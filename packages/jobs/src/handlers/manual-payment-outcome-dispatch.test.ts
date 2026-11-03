import { expect, test } from "bun:test"
import { WhatsAppProviderSendError } from "@ewatrade/communications"
import {
  type PaymentReportOutcomeClaim,
  type PaymentReportOutcomeDependencies,
  createPaymentReportOutcomeProvider,
  paymentReportOutcomeTemplateValues,
  paymentReportOutcomesEnabled,
  runPaymentReportOutcomeDispatch,
} from "./manual-payment-outcome-dispatch"

const env = {
  PAYMENT_REPORT_ALERTS_ENABLED: "true",
  PAYMENT_REPORT_WHATSAPP_ACCESS_TOKEN: "test-not-a-key",
  PAYMENT_REPORT_WHATSAPP_PHONE_NUMBER_ID: "123",
  PAYMENT_REPORT_WHATSAPP_TEMPLATE_NAME: "payment_report_review",
  PAYMENT_REPORT_WHATSAPP_TEMPLATE_LANGUAGE: "en",
  PAYMENT_REPORT_OUTCOME_WHATSAPP_TEMPLATE: "payment_report_outcome",
  PAYMENT_REPORT_OUTCOME_WHATSAPP_TEMPLATE_LANGUAGE: "en",
}
const content = {
  reportId: "report_1",
  businessName: "Mama Ada Provisions",
  orderNumber: "S-1039",
  outcome: "CONFIRMED" as const,
  payerName: "Chidi Eze",
  currencyCode: "NGN",
  claimedAmountMinor: 2_450_000,
  receivedAmountMinor: 2_450_000,
  balanceMinor: 0,
  receivedAccountName: "Main bank",
  reason: null,
}
const claim: PaymentReportOutcomeClaim = {
  tenantId: "tenant",
  notificationId: "notice",
  claimId: "claim",
  destination: "+2348180000000",
  content,
}

test("default OFF: alert switch alone, or a missing template, never enables outcome sends", () => {
  expect(paymentReportOutcomesEnabled({})).toBe(false)
  expect(
    paymentReportOutcomesEnabled({
      ...env,
      PAYMENT_REPORT_OUTCOME_WHATSAPP_TEMPLATE: undefined,
    }),
  ).toBe(false)
  expect(
    paymentReportOutcomesEnabled({
      ...env,
      PAYMENT_REPORT_ALERTS_ENABLED: "false",
    }),
  ).toBe(false)
  expect(paymentReportOutcomesEnabled(env)).toBe(true)
})

test("recorded in full matches the design and carries no payer contact or bank number", () => {
  const values = paymentReportOutcomeTemplateValues(content)
  expect(values).toEqual([
    "Mama Ada Provisions",
    "✅ *Recorded in EwaTrade*",
    "S-1039",
    "*₦24,500* received into Main bank.",
    "S-1039 is now *paid in full*.",
    "Chidi",
  ])
  for (const value of values) {
    expect(value).not.toMatch(/[\r\n\t]| {4,}/)
    expect(value).not.toContain("234")
  }
})

test("less arrived shows the claim and what is still to pay", () => {
  expect(
    paymentReportOutcomeTemplateValues({
      ...content,
      receivedAmountMinor: 2_000_000,
      balanceMinor: 450_000,
    }).slice(3, 5),
  ).toEqual([
    "*₦20,000* received into Main bank (Chidi said ₦24,500).",
    "*₦4,500* still to pay.",
  ])
})

test("not received keeps the merchant reason on one line without user formatting", () => {
  const values = paymentReportOutcomeTemplateValues({
    ...content,
    outcome: "NOT_RECEIVED",
    receivedAmountMinor: null,
    receivedAccountName: null,
    balanceMinor: 2_450_000,
    payerName: "*Chidi*\nEze",
    reason: "Not in our account yet.\n\nPlease send the _transfer_ receipt.",
  })
  expect(values.slice(1)).toEqual([
    "❌ *Marked not received*",
    "S-1039",
    "Nothing was recorded.",
    "*₦24,500* still to pay. Reason for Chidi: _Not in our account yet. Please send the transfer receipt._",
    "Chidi",
  ])
})

test("send uses the outcome template on the existing alert number with the report button", async () => {
  const sends: Array<Record<string, unknown>> = []
  const provider = createPaymentReportOutcomeProvider({
    env,
    whatsapp: {
      sendTemplate: async (input) => {
        sends.push(input as unknown as Record<string, unknown>)
        return { messageId: "wamid.outcome" }
      },
    },
    assertProviderAllowed: async (input) => {
      expect(input).toEqual({ tenantId: "tenant", operation: "whatsapp" })
    },
  })
  await provider.assertProviderAllowed(claim)
  const values = paymentReportOutcomeTemplateValues(content)
  expect(await provider.send({ ...claim, values })).toEqual({
    providerMessageId: "wamid.outcome",
  })
  expect(sends[0]).toMatchObject({
    phoneNumberId: "123",
    templateName: "payment_report_outcome",
    language: "en",
    to: "+2348180000000",
    components: [
      {
        type: "body",
        parameters: values.map((text) => ({ type: "text", text })),
      },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: "report_1" }],
      },
    ],
  })
})

test("unconfigured provider refuses before any transport call", async () => {
  let calls = 0
  const provider = createPaymentReportOutcomeProvider({
    env: { ...env, PAYMENT_REPORT_OUTCOME_WHATSAPP_TEMPLATE: "" },
    whatsapp: {
      sendTemplate: async () => {
        calls++
        return { messageId: "x" }
      },
    },
    assertProviderAllowed: async () => {
      calls++
    },
  })
  await expect(provider.assertProviderAllowed(claim)).rejects.toThrow(
    "not enabled",
  )
  await expect(provider.send({ ...claim, values: [] })).rejects.toThrow(
    "not enabled",
  )
  expect(calls).toBe(0)
})

function harness(overrides: Partial<PaymentReportOutcomeDependencies> = {}): {
  deps: PaymentReportOutcomeDependencies
  log: string[]
} {
  const log: string[] = []
  return {
    log,
    deps: {
      claim: async () => claim,
      assertProviderAllowed: async () => {
        log.push("guard")
      },
      start: async () => {
        log.push("start")
        return true
      },
      send: async () => {
        log.push("send")
        return { providerMessageId: "wamid" }
      },
      finish: async (input) => {
        log.push(`finish:${input.outcome}`)
      },
      ...overrides,
    },
  }
}
const identity = { tenantId: "tenant", notificationId: "notice" }

test("one fenced send: accepted once, a lost start fence never sends", async () => {
  const ok = harness()
  expect(await runPaymentReportOutcomeDispatch(identity, ok.deps)).toEqual({
    status: "accepted",
  })
  expect(ok.log).toEqual(["guard", "start", "send", "finish:accepted"])
  const fenced = harness({ start: async () => false })
  expect(await runPaymentReportOutcomeDispatch(identity, fenced.deps)).toEqual({
    status: "skipped",
  })
  expect(fenced.log).toEqual(["guard"])
})

test("QA guard refusal cancels without a provider call", async () => {
  const qa = harness({
    assertProviderAllowed: async () => {
      throw new Error("QA tenant")
    },
  })
  expect(await runPaymentReportOutcomeDispatch(identity, qa.deps)).toEqual({
    status: "cancelled",
  })
  expect(qa.log).toEqual(["finish:cancelled"])
})

test("definite provider failure is rejected; anything else stays unknown", async () => {
  const rejected = harness({
    ...createPaymentReportOutcomeProvider({
      env,
      whatsapp: {
        sendTemplate: async () => {
          throw new WhatsAppProviderSendError(
            "PROVIDER_REJECTED",
            "DEFINITE_FAILURE",
          )
        },
      },
      assertProviderAllowed: async () => undefined,
    }),
  })
  expect(
    await runPaymentReportOutcomeDispatch(identity, rejected.deps),
  ).toEqual({ status: "rejected" })
  const unknown = harness({
    send: async () => {
      throw new Error("socket closed")
    },
  })
  expect(await runPaymentReportOutcomeDispatch(identity, unknown.deps)).toEqual(
    { status: "unknown" },
  )
  expect(unknown.log.at(-1)).toBe("finish:unknown")
})

test("identity must be exactly tenant and notification", async () => {
  await expect(
    runPaymentReportOutcomeDispatch(
      { ...identity, extra: "x" } as unknown as typeof identity,
      harness().deps,
    ),
  ).rejects.toThrow("Invalid payment outcome identity.")
})
