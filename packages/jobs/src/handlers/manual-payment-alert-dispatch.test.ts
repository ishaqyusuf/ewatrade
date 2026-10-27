import { expect, test } from "bun:test"
import {
  type ManualPaymentAlertDispatchClaim,
  type ManualPaymentAlertDispatchDependencies,
  ManualPaymentAlertProviderRejected,
  runManualPaymentAlertDispatch,
} from "./manual-payment-alert-dispatch"

const identity = { tenantId: "tenant-a", intentId: "intent-a" }
const claim: ManualPaymentAlertDispatchClaim = {
  ...identity,
  claimId: "fence",
  channel: "email",
  destination: "owner@example.test",
  providerIdempotencyKey: "payment-report-staff-a",
  content: {
    businessName: "Business",
    payerName: "Aisha",
    amountMinor: 500000,
    currencyCode: "NGN",
    orderNumber: "ORD-ABC",
    bankAccountName: "Bank",
    reportedAt: "27 October",
    reviewUrl: "https://dash.ewatrade.com/finance/payments?reportId=report",
  },
}
function harness() {
  const events: string[] = []
  let consumed = false
  const dependencies: ManualPaymentAlertDispatchDependencies = {
    claim: async () => (consumed ? null : claim),
    assertProviderAllowed: async () => {
      events.push("guard")
    },
    start: async () => {
      events.push("start")
      consumed = true
      return true
    },
    send: async () => {
      events.push("send")
      return { providerMessageId: "provider-id" }
    },
    finish: async ({ outcome }) => {
      events.push(outcome)
    },
  }
  return { events, dependencies }
}
test("durable start precedes one accepted send; replay never calls transport", async () => {
  const h = harness()
  expect(await runManualPaymentAlertDispatch(identity, h.dependencies)).toEqual(
    { status: "accepted" },
  )
  expect(h.events).toEqual(["guard", "start", "send", "accepted"])
  expect(await runManualPaymentAlertDispatch(identity, h.dependencies)).toEqual(
    { status: "skipped" },
  )
  expect(h.events.filter((e) => e === "send")).toHaveLength(1)
})
test("unavailable provider cancels before start and revoked permission prevents I/O", async () => {
  const h = harness()
  h.dependencies.assertProviderAllowed = async () => {
    throw new Error("disabled")
  }
  expect(await runManualPaymentAlertDispatch(identity, h.dependencies)).toEqual(
    { status: "cancelled" },
  )
  expect(h.events).toEqual(["cancelled"])
  const revoked = harness()
  revoked.dependencies.start = async () => false
  expect(
    await runManualPaymentAlertDispatch(identity, revoked.dependencies),
  ).toEqual({ status: "skipped" })
  expect(revoked.events).toEqual(["guard"])
})
test("timeout or missing receipt remains unknown and cannot retry another channel", async () => {
  for (const mode of ["timeout", "empty"]) {
    const h = harness()
    h.dependencies.send = async () => {
      h.events.push("send")
      if (mode === "timeout") throw new Error("timeout")
      return { providerMessageId: "" }
    }
    expect(
      await runManualPaymentAlertDispatch(identity, h.dependencies),
    ).toEqual({ status: "unknown" })
    expect(
      await runManualPaymentAlertDispatch(identity, h.dependencies),
    ).toEqual({ status: "skipped" })
    expect(h.events).toEqual(["guard", "start", "send", "unknown"])
  }
})
test("only definitive provider rejection releases the failed attempt", async () => {
  const h = harness()
  h.dependencies.send = async () => {
    throw new ManualPaymentAlertProviderRejected()
  }
  expect(await runManualPaymentAlertDispatch(identity, h.dependencies)).toEqual(
    { status: "rejected" },
  )
  expect(h.events).toEqual(["guard", "start", "rejected"])
})
test("failed settlement never re-enters transport on a job retry", async () => {
  const h = harness()
  h.dependencies.finish = async () => {
    throw new Error("database unavailable")
  }
  await expect(
    runManualPaymentAlertDispatch(identity, h.dependencies),
  ).rejects.toThrow("database unavailable")
  expect(await runManualPaymentAlertDispatch(identity, h.dependencies)).toEqual(
    { status: "skipped" },
  )
  expect(h.events.filter((e) => e === "send")).toHaveLength(1)
})
