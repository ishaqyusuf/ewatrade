import { afterAll, expect, spyOn, test } from "bun:test"
import {
  generalBookingActionSchema,
  generalBookingReceiptSchema,
} from "@ewatrade/assistant/general/booking-action"
import * as communications from "@ewatrade/communications"
import {
  confirmPreparedServiceCommerceBookingInTransaction,
  createPreparedServiceCommerceBookingHoldInTransaction,
  inspectServiceCommerceBookingConfirmationInTransaction,
  prepareServiceCommerceBookingConfirmation,
  prepareServiceCommerceBookingHold,
} from "@ewatrade/db/service-booking-commands"
import * as capability from "../service-commerce/booking-capability"
import { bookingConfirmationFixture } from "./general-booking-confirmation-fixture"
import { decideGeneralBooking } from "./general-booking-decision"
import { generalBookingDraftApprovalToken } from "./general-booking-draft-store"
import { createGeneralBookingDraft } from "./general-booking-drafts"
import { generalBookingNativeInput } from "./general-booking-input"
import { generalBookingFreshFixtureFrom } from "./test-helpers/general-booking-fresh"

const network = spyOn(globalThis, "fetch").mockRejectedValue(
  Error("No network/provider in inert outer booking tests"),
)
afterAll(() => network.mockRestore())
const now = Date.parse("2031-02-03T08:00:00.000Z")
const ids = {
  proposalId: "outer-booking-draft",
  idempotencyKey: "outer-booking-command",
}
const key = "INERT_OUTER_BOOKING_SIGNING_KEY_NOT_A_CREDENTIAL_1234"
const hold = () =>
  generalBookingActionSchema.parse({
    action: "service_booking_hold",
    source: { kind: "service", id: "request-1" },
    offeringId: "offering-1",
    resourceId: "resource-1",
    quantity: 1,
    expectedConfigurationRevision: 0,
    slotStartAt: new Date(now + 7_200_000).toISOString(),
    slotEndAt: new Date(now + 9_000_000).toISOString(),
  })
async function environment(run: () => Promise<void>) {
  const configured = {
    APP_ENV: "production",
    ASSISTANT_APPROVAL_SIGNING_KEY: key,
    SERVICE_COMMERCE_BOOKING_CAPABILITY_SECRET:
      "INERT_BOOKING_CAPABILITY_KEY_NOT_A_CREDENTIAL",
    COMMUNICATIONS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString(
      "base64",
    ),
  }
  const saved = Object.fromEntries(
    Object.keys(configured).map((name) => [name, process.env[name]]),
  )
  const clock = spyOn(Date, "now").mockReturnValue(now)
  Object.assign(process.env, configured)
  try {
    await run()
  } finally {
    clock.mockRestore()
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) Reflect.deleteProperty(process.env, name)
      else process.env[name] = value
    }
  }
}
async function staged(kind: "hold" | "confirm" | "revise" = "hold") {
  const base = bookingConfirmationFixture()
  let payload = hold()
  if (kind !== "hold") {
    const native = generalBookingNativeInput(payload, base.scope, "seed-hold")
    if (native.kind !== "hold") throw Error("Expected seed hold")
    const held = await createPreparedServiceCommerceBookingHoldInTransaction(
      base.canonical.tx,
      prepareServiceCommerceBookingHold(
        native.input,
        () => "INERT_PRIVATE_TOKEN",
      ),
      base.scope,
    )
    payload = generalBookingActionSchema.parse({
      action: "service_booking_confirm",
      source: { kind: "service", id: "request-1" },
      holdId: held.receipt.holdId,
    })
    if (kind === "revise") {
      const confirm = generalBookingNativeInput(
        payload,
        base.scope,
        "seed-confirm",
      )
      if (confirm.kind !== "confirm") throw Error("Expected seed confirmation")
      const inspected =
        await inspectServiceCommerceBookingConfirmationInTransaction(
          base.canonical.tx,
          confirm.input,
        )
      const booked = await confirmPreparedServiceCommerceBookingInTransaction(
        base.canonical.tx,
        prepareServiceCommerceBookingConfirmation(inspected, {
          issueCapabilityToken: () => "INERT_PRIVATE_TOKEN",
          protectRecipient: () => "INERT_PRIVATE_CIPHER",
        }),
        base.scope,
      )
      if (booked.receipt.kind !== "booking_event")
        throw Error("Expected seed booking")
      payload = generalBookingActionSchema.parse({
        action: "service_booking_arrive",
        bookingId: booked.receipt.bookingId,
        expectedRevision: 0,
      })
    }
  }
  const f = await generalBookingFreshFixtureFrom(base)
  await createGeneralBookingDraft(
    f.ctx,
    { conversationId: f.conversationScope.conversationId, payload },
    ids,
  )
  return f
}
type Fixture = Awaited<ReturnType<typeof staged>>
function request(f: Fixture, decision: "confirm" | "cancel" = "confirm") {
  return {
    conversationId: f.conversationScope.conversationId,
    draftRef: f.row().id,
    revision: f.row().revision,
    decision,
    ...(decision === "confirm"
      ? { approvalToken: generalBookingDraftApprovalToken(f.row(), key) }
      : {}),
  }
}

test("actual outer fresh GENERAL staging→two-TX decision composes all three native command kinds", () =>
  environment(async () => {
    for (const kind of ["hold", "confirm", "revise"] as const) {
      const f = await staged(kind)
      const result = await decideGeneralBooking(f.ctx, request(f))
      expect(result.result.kind).toBe("completed")
      expect(f.row().status).toBe("COMPLETED")
      expect(f.counters()).toEqual({ transactions: 3, depth: 0 })
      expect(f.locks.filter((name) => name === "Membership")).toHaveLength(3)
      expect(f.locks.filter((name) => name === "Store")).toHaveLength(3)
      expect(f.transitions).toHaveLength(2)
      if (result.result.kind !== "completed") throw Error("Expected receipt")
      expect(result.result.receipt).toEqual(
        generalBookingReceiptSchema.parse(f.row().executedResult),
      )
      expect(result.result.recovered).toBe(false)
      expect(JSON.stringify(result.result)).not.toContain(
        "notificationDispatches",
      )
      expect(JSON.stringify(result.result)).not.toContain("INERT_PRIVATE")
      expect(network).not.toHaveBeenCalled()
    }
  }))

test("actual token and recipient encryption run only between closed fresh transactions", () =>
  environment(async () => {
    const f = await staged("confirm")
    const issue = capability.issueServiceCommerceBookingCapabilityToken
    const protect = communications.protectCommunicationsRecipient
    const tokenSpy = spyOn(
      capability,
      "issueServiceCommerceBookingCapabilityToken",
    ).mockImplementation((input) => {
      expect(f.counters()).toEqual({ transactions: 2, depth: 0 })
      return issue(input)
    })
    const protectSpy = spyOn(
      communications,
      "protectCommunicationsRecipient",
    ).mockImplementation((phone) => {
      expect(f.counters()).toEqual({ transactions: 2, depth: 0 })
      return protect(phone)
    })
    try {
      const result = await decideGeneralBooking(f.ctx, request(f))
      expect(tokenSpy).toHaveBeenCalledTimes(1)
      expect(protectSpy).toHaveBeenCalledTimes(1)
      expect(result.notificationDispatches).toHaveLength(1)
      expect(f.counters().depth).toBe(0)
    } finally {
      tokenSpy.mockRestore()
      protectSpy.mockRestore()
    }
  }))

test("historical recovery uses one fresh TX after key rotation/expiry/new-readiness changes", () =>
  environment(async () => {
    const f = await staged()
    const raw = request(f)
    const result = await decideGeneralBooking(f.ctx, raw)
    if (result.result.kind !== "completed") throw Error("Expected receipt")
    const writes = f.canonical.writes.length
    f.row().expiresAt = new Date(0)
    process.env.ASSISTANT_APPROVAL_SIGNING_KEY =
      "INERT_ROTATED_KEY_NO_NEW_APPROVAL_".repeat(2)
    f.canonical.state.profile.bookingEnabled = false
    f.canonical.state.source.status = "DECLINED"
    const recovered = await decideGeneralBooking(f.ctx, raw)
    expect(recovered.result).toEqual({ ...result.result, recovered: true })
    expect(recovered.notificationDispatches).toEqual([])
    expect(f.canonical.writes).toHaveLength(writes)
    expect(f.counters()).toEqual({ transactions: 4, depth: 0 })
  }))

test("second owning transaction repeats actual current Session/account/Store authority and full review", () =>
  environment(async () => {
    for (const change of [
      "session",
      "legal",
      "grant",
      "configuration",
      "contact",
    ]) {
      const f = await staged("confirm")
      const writes = f.canonical.writes.length
      f.state.beforeTransaction = async (index) => {
        if (index !== 3) return
        if (change === "session") f.state.sessionAvailable = false
        if (change === "legal") f.state.acceptedLegalHash = "wrong-current-hash"
        if (change === "grant") f.member.staffStoreAssignments.length = 0
        if (change === "configuration") f.canonical.state.config.revision++
        if (change === "contact")
          f.canonical.state.source.customerPhone = "DIFFERENT_PRIVATE_PHONE"
      }
      await expect(decideGeneralBooking(f.ctx, request(f))).rejects.toThrow()
      expect(f.row().status).toBe("PENDING")
      expect(f.canonical.writes).toHaveLength(writes)
      expect(f.counters()).toEqual({ transactions: 3, depth: 0 })
    }
  }))

test("clean pending draft cancellation resolves in first TX without token or native booking effect", () =>
  environment(async () => {
    const f = await staged()
    const writes = f.canonical.writes.length
    f.row().expiresAt = new Date(0)
    f.canonical.state.profile.bookingEnabled = false
    const token = spyOn(
      capability,
      "issueServiceCommerceBookingCapabilityToken",
    )
    try {
      expect(await decideGeneralBooking(f.ctx, request(f, "cancel"))).toEqual({
        result: { kind: "cancelled", draftRef: ids.proposalId, revision: 1 },
        notificationDispatches: [],
      })
      expect(f.counters()).toEqual({ transactions: 2, depth: 0 })
      expect(f.canonical.writes).toHaveLength(writes)
      expect(token).not.toHaveBeenCalled()
    } finally {
      token.mockRestore()
    }
  }))

test("uncertain applied effect recovers before cancellation/preparation; absent proof remains unknown", () =>
  environment(async () => {
    const f = await staged()
    await decideGeneralBooking(f.ctx, request(f))
    const writes = f.canonical.writes.length
    Object.assign(f.row(), {
      status: "EXECUTING",
      executedResult: null,
      decidedAt: null,
      expiresAt: new Date(0),
    })
    const result = await decideGeneralBooking(f.ctx, request(f, "cancel"))
    expect(result.result.kind).toBe("completed")
    expect(result.notificationDispatches).toEqual([])
    expect(f.canonical.writes).toHaveLength(writes)
    expect(f.counters()).toEqual({ transactions: 4, depth: 0 })
    const unknown = await staged()
    unknown.row().status = "EXECUTING"
    await expect(
      decideGeneralBooking(unknown.ctx, request(unknown)),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(unknown.counters()).toEqual({ transactions: 2, depth: 0 })
    expect(unknown.canonical.writes).toEqual([])
  }))

test("strict scalar request is snapshotted before await and refuses client effects/scope before opening TX", () =>
  environment(async () => {
    const f = await staged()
    const raw = request(f)
    for (const extra of [
      { actorUserId: "foreign" },
      { payload: hold() },
      { receipt: {} },
      { idempotencyKey: "new-command" },
      { provider: "send" },
    ])
      await expect(
        decideGeneralBooking(f.ctx, { ...raw, ...extra }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(f.counters().transactions).toBe(1)
    const pending = decideGeneralBooking(f.ctx, raw)
    raw.conversationId = "caller-edited"
    raw.draftRef = "caller-edited"
    raw.revision = 999
    expect((await pending).result.draftRef).toBe(ids.proposalId)
    expect(f.counters()).toEqual({ transactions: 3, depth: 0 })
  }))
