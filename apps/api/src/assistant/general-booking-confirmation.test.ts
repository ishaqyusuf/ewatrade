import { afterAll, expect, spyOn, test } from "bun:test"
import {
  type GeneralBookingAction,
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
import {
  confirmGeneralBookingInTransaction as confirm,
  inspectGeneralBookingConfirmationInTransaction as inspect,
  prepareGeneralBookingConfirmation as prepare,
} from "./general-booking-confirmation"
import { bookingConfirmationFixture } from "./general-booking-confirmation-fixture"
import {
  createGeneralBookingDraftInTransaction as create,
  generalBookingDraftApprovalToken,
} from "./general-booking-draft-store"
import { generalBookingNativeInput } from "./general-booking-input"
import { proposalApprovalToken } from "./proposal-security"

const network = spyOn(globalThis, "fetch").mockRejectedValue(
  Error("No network/provider"),
)
afterAll(() => network.mockRestore())
const instant = Date.parse("2031-02-03T08:00:00.000Z")
const signingKey = "INERT_BOOKING_CONFIRMATION_SIGNING_KEY_".repeat(2)
const ids = { proposalId: "booking-draft", idempotencyKey: "booking-command" }
type Fixture = ReturnType<typeof bookingConfirmationFixture>
const actions: GeneralBookingAction["action"][] = [
  "service_booking_hold",
  "service_booking_confirm",
  "service_booking_arrive",
  "service_booking_start",
  "service_booking_complete",
  "service_booking_cancel",
  "service_booking_no_show",
  "service_booking_reschedule",
]
function hold(): GeneralBookingAction {
  return generalBookingActionSchema.parse({
    action: "service_booking_hold",
    source: { kind: "service", id: "request-1" },
    offeringId: "offering-1",
    resourceId: "resource-1",
    quantity: 1,
    expectedConfigurationRevision: 0,
    slotStartAt: new Date(instant + 7200_000).toISOString(),
    slotEndAt: new Date(instant + 9000_000).toISOString(),
  })
}
async function clocked(run: (setNow: (at: number) => void) => Promise<void>) {
  const clock = spyOn(Date, "now").mockReturnValue(instant)
  try {
    await run((at) => {
      clock.mockReturnValue(at)
    })
  } finally {
    clock.mockRestore()
  }
}
async function payload(f: Fixture, name: GeneralBookingAction["action"]) {
  if (name === "service_booking_hold") return hold()
  const native = generalBookingNativeInput(hold(), f.scope, "seed-hold")
  if (native.kind !== "hold") throw Error("Expected hold")
  const h = await createPreparedServiceCommerceBookingHoldInTransaction(
    f.canonical.tx,
    prepareServiceCommerceBookingHold(native.input, () => "PRIVATE_TOKEN"),
    f.scope,
  )
  const confirmation = generalBookingActionSchema.parse({
    action: "service_booking_confirm",
    source: { kind: "service", id: "request-1" },
    holdId: h.receipt.holdId,
  })
  if (name === "service_booking_confirm") return confirmation
  const input = generalBookingNativeInput(confirmation, f.scope, "seed-confirm")
  if (input.kind !== "confirm") throw Error("Expected confirm")
  const inspected =
    await inspectServiceCommerceBookingConfirmationInTransaction(
      f.canonical.tx,
      input.input,
    )
  const c = await confirmPreparedServiceCommerceBookingInTransaction(
    f.canonical.tx,
    prepareServiceCommerceBookingConfirmation(inspected, {
      issueCapabilityToken: () => "PRIVATE_TOKEN",
      protectRecipient: () => "PRIVATE_CIPHER",
    }),
    f.scope,
  )
  if (c.receipt.kind !== "booking_event") throw Error("Expected booking")
  if (name === "service_booking_start")
    Object.assign(f.canonical.bookings[0] ?? {}, { status: "ARRIVED" })
  if (name === "service_booking_complete")
    Object.assign(f.canonical.bookings[0] ?? {}, { status: "IN_SERVICE" })
  return generalBookingActionSchema.parse({
    action: name,
    bookingId: c.receipt.bookingId,
    expectedRevision: 0,
    ...([
      "service_booking_cancel",
      "service_booking_no_show",
      "service_booking_reschedule",
    ].includes(name)
      ? { reasonCode: "CUSTOMER_REQUEST" }
      : {}),
    ...(name === "service_booking_reschedule"
      ? {
          resourceId: "resource-1",
          newSlotStartAt: new Date(instant + 10800_000).toISOString(),
          newSlotEndAt: new Date(instant + 12600_000).toISOString(),
        }
      : {}),
  })
}
async function staged(
  name: GeneralBookingAction["action"] = "service_booking_hold",
) {
  const f = bookingConfirmationFixture()
  const original = await payload(f, name)
  await create(
    f.tx,
    { ...f.conversationScope, payload: original },
    ids,
    signingKey,
  )
  return f
}
function request(f: Fixture, decision: "confirm" | "cancel" = "confirm") {
  return {
    conversationId: f.conversationScope.conversationId,
    draftRef: f.row().id,
    revision: f.row().revision,
    decision,
    ...(decision === "confirm"
      ? { approvalToken: generalBookingDraftApprovalToken(f.row(), signingKey) }
      : {}),
  }
}
async function prepared(f: Fixture) {
  const raw = request(f)
  const inspection = await inspect(f.tx, f.scope, raw, signingKey)
  if (inspection.kind !== "pending") throw Error("Expected pending plan")
  return { raw, plan: inspection.plan, handle: prepare(inspection.plan) }
}
async function execute(f: Fixture) {
  const p = await prepared(f)
  return confirm(f.tx, f.scope, p.raw, signingKey, p.handle)
}
function safe(value: unknown) {
  const text = JSON.stringify(value)
  for (const secret of [
    "PRIVATE",
    "scb1.",
    "ciphertext",
    "notificationDispatches",
    "payloadHash",
    "approvalToken",
    "customerName",
  ])
    expect(text).not.toContain(secret)
}
function resetPending(f: Fixture) {
  Object.assign(f.row(), {
    status: "PENDING",
    executedResult: null,
    errorCode: null,
    decidedAt: null,
  })
}

test("actual all8 draft→review→native→immutable proof→saved receipt composition and historical replay", () =>
  clocked(async () => {
    for (const name of actions) {
      const f = await staged(name)
      const outcome = await execute(f)
      expect(outcome.result.kind).toBe("completed")
      if (outcome.result.kind !== "completed") throw Error("Expected result")
      expect(outcome.result.recovered).toBe(false)
      expect(generalBookingReceiptSchema.parse(outcome.result.receipt)).toEqual(
        generalBookingReceiptSchema.parse(f.row().executedResult),
      )
      expect(f.row().status).toBe("COMPLETED")
      expect(f.transitions).toHaveLength(2)
      expect(f.row().updatedAt.getTime()).toBeGreaterThan(instant)
      safe(outcome.result)
      const domainWrites = f.canonical.writes.length
      const original = JSON.parse(JSON.stringify(outcome.result.receipt))
      f.row().executedResult = original
      const replay = await confirm(f.tx, f.scope, request(f), "", undefined)
      expect(replay.result).toEqual({ ...outcome.result, recovered: true })
      expect(replay.notificationDispatches).toEqual([])
      expect(f.canonical.writes).toHaveLength(domainWrites)
      expect(network).not.toHaveBeenCalled()
      if (name === "service_booking_confirm")
        expect(outcome.notificationDispatches).toHaveLength(1)
    }
  }))

test("opaque plans/handles retain no serializable secrets and allocate actual local crypto only outside TX once", () =>
  clocked(async () => {
    const f = await staged("service_booking_confirm")
    let depth = 0
    const tokenOriginal = capability.issueServiceCommerceBookingCapabilityToken
    const protectOriginal = communications.protectCommunicationsRecipient
    const token = spyOn(
      capability,
      "issueServiceCommerceBookingCapabilityToken",
    ).mockImplementation((input) => {
      expect(depth).toBe(0)
      return tokenOriginal(input)
    })
    const protect = spyOn(
      communications,
      "protectCommunicationsRecipient",
    ).mockImplementation((phone) => {
      expect(depth).toBe(0)
      return protectOriginal(phone)
    })
    try {
      depth++
      const inspected = await inspect(f.tx, f.scope, request(f), signingKey)
      depth--
      if (inspected.kind !== "pending") throw Error("Expected plan")
      expect(token).not.toHaveBeenCalled()
      expect(protect).not.toHaveBeenCalled()
      const handle = prepare(inspected.plan)
      expect(prepare(inspected.plan)).toBe(handle)
      expect(JSON.stringify(inspected.plan)).toBe("{}")
      expect(JSON.stringify(handle)).toBe("{}")
      expect(token).toHaveBeenCalledTimes(1)
      expect(protect).toHaveBeenCalledTimes(1)
      depth++
      const result = await confirm(
        f.tx,
        f.scope,
        request(f),
        signingKey,
        handle,
      )
      depth--
      expect(token).toHaveBeenCalledTimes(1)
      expect(protect).toHaveBeenCalledTimes(1)
      const intentId = f.canonical.notifications.at(-1)?.id
      if (typeof intentId !== "string")
        throw Error("Expected saved notification intent ID")
      expect(result.notificationDispatches).toEqual([
        {
          actorUserId: f.scope.actorUserId,
          intentId,
        },
      ])
      expect(f.canonical.bookings[0]?.customerContactCiphertext).not.toBe(
        "PRIVATE_PHONE",
      )
      safe(result.result)
    } finally {
      token.mockRestore()
      protect.mockRestore()
    }
  }))

test("serialized/forged evidence and fresh caller actor/Tenant/Store mismatch refuse before every delegate", () =>
  clocked(async () => {
    const f = await staged()
    const p = await prepared(f)
    let touches = 0
    const untouched = new Proxy(f.tx, {
      get() {
        touches++
        throw Error("No delegate")
      },
    })
    expect(() => prepare(JSON.parse("{}"))).toThrow()
    for (const current of [
      f.scope,
      { ...f.scope, actorUserId: "other" },
      { ...f.scope, tenantId: "other" },
      { ...f.scope, storeId: "other" },
    ]) {
      await expect(
        confirm(
          untouched,
          current,
          p.raw,
          signingKey,
          current === f.scope ? JSON.parse(JSON.stringify(p.handle)) : p.handle,
        ),
      ).rejects.toMatchObject({ reason: "preparation_required" })
    }
    expect(touches).toBe(0)
    expect(f.transitions).toHaveLength(0)
    expect(
      (await confirm(f.tx, f.scope, p.raw, signingKey, p.handle)).result.kind,
    ).toBe("completed")
  }))

test("explicit invalid handles never fall back even for a completed result", () =>
  clocked(async () => {
    const f = await staged()
    await execute(f)
    const writes = f.transitions.length
    await expect(
      confirm(f.tx, f.scope, request(f), "", JSON.parse("{}")),
    ).rejects.toMatchObject({ reason: "preparation_required" })
    expect(f.transitions).toHaveLength(writes)
  }))

test("verified old facts survive key rotation, expiry, disabled new issuance and source decision changes", () =>
  clocked(async (setNow) => {
    for (const name of actions) {
      const f = await staged(name)
      const first = await execute(f)
      if (first.result.kind !== "completed")
        throw Error("Expected completed result")
      const raw = request(f)
      setNow(instant + 48 * 3600_000)
      f.canonical.state.profile.bookingEnabled = false
      f.canonical.state.source.status = "DECLINED"
      Object.assign(f.canonical.bookings[0] ?? {}, {
        status: "COMPLETED",
        revision: 37,
        customerName: "Later name",
      })
      f.canonical.payments.length = 0
      const writes = f.canonical.writes.length
      const result = await confirm(
        f.tx,
        f.scope,
        { ...raw, approvalToken: "old token no longer valid" },
        "ROTATED",
      )
      expect(result.result).toEqual({ ...first.result, recovered: true })
      expect(result.notificationDispatches).toEqual([])
      expect(f.canonical.writes).toHaveLength(writes)
      setNow(instant)
    }
  }))

test("all4 uncertain states recover exact proof without a new approval or command, including legacy markers", () =>
  clocked(async () => {
    for (const name of actions) {
      for (const status of [
        "PENDING",
        "EXECUTING",
        "FAILED",
        "EXPIRED",
      ] as const) {
        const f = await staged(name)
        const result = await execute(f)
        if (result.result.kind !== "completed") throw Error("Expected result")
        resetPending(f)
        Object.assign(f.row(), {
          status,
          ...(status === "PENDING"
            ? {}
            : {
                errorCode: "LEGACY_UNKNOWN",
                decidedAt: new Date(instant - 1),
                executedResult: result.result.receipt,
              }),
        })
        f.row().expiresAt = new Date(0)
        const writes = f.canonical.writes.length
        const recovery = await confirm(
          f.tx,
          f.scope,
          { ...request(f, "cancel") },
          "",
        )
        expect(recovery.result).toEqual({ ...result.result, recovered: true })
        expect(recovery.notificationDispatches).toEqual([])
        expect(f.row().errorCode).toBeNull()
        expect(f.row().status).toBe("COMPLETED")
        expect(f.canonical.writes).toHaveLength(writes)
      }
    }
  }))

test("missing proof in EXECUTING/FAILED/EXPIRED remains unknown; never enters new issuance", () =>
  clocked(async () => {
    for (const status of ["EXECUTING", "FAILED", "EXPIRED"] as const) {
      const f = await staged()
      f.row().status = status
      await expect(
        inspect(f.tx, f.scope, request(f), signingKey),
      ).rejects.toMatchObject({ reason: "unknown_effect" })
      await expect(
        confirm(f.tx, f.scope, request(f, "cancel"), ""),
      ).rejects.toMatchObject({ reason: "unknown_effect" })
      expect(f.transitions).toHaveLength(0)
      expect(f.canonical.holds).toHaveLength(0)
    }
  }))

test("draft cancellation is not domain cancel and ignores expiry/new booking readiness but preserves read scope", () =>
  clocked(async () => {
    const f = await staged("service_booking_cancel")
    f.row().expiresAt = new Date(0)
    f.canonical.state.profile.bookingEnabled = false
    f.canonical.state.source.status = "DECLINED"
    const before = structuredClone(f.canonical.bookings)
    const writes = f.canonical.writes.length
    const result = await confirm(f.tx, f.scope, request(f, "cancel"), "")
    expect(result.result).toEqual({
      kind: "cancelled",
      draftRef: ids.proposalId,
      revision: 1,
    })
    expect(result.notificationDispatches).toEqual([])
    expect(f.canonical.bookings).toEqual(before)
    expect(f.canonical.writes).toHaveLength(writes)
    expect((await confirm(f.tx, f.scope, request(f), "")).result).toEqual(
      result.result,
    )
    f.canonical.state.member.status = "SUSPENDED"
    await expect(
      confirm(f.tx, f.scope, request(f, "cancel"), ""),
    ).rejects.toMatchObject({ code: "BOOKING_FORBIDDEN" })
  }))

test("CANCELLED with an exact effect conflicts; cancel after an applied pending effect recovers truthfully", () =>
  clocked(async () => {
    const f = await staged()
    const original = await execute(f)
    if (original.result.kind !== "completed")
      throw Error("Expected completed result")
    resetPending(f)
    expect(
      (await confirm(f.tx, f.scope, request(f, "cancel"), "")).result,
    ).toEqual({ ...original.result, recovered: true })
    Object.assign(f.row(), {
      status: "CANCELLED",
      executedResult: null,
      errorCode: null,
      decidedAt: new Date(instant),
    })
    await expect(
      confirm(f.tx, f.scope, request(f, "cancel"), ""),
    ).rejects.toMatchObject({ reason: "effect_conflict" })
  }))

test("completed saved receipts and uncertain optional receipts must match genuine immutable proof exactly", () =>
  clocked(async () => {
    for (const status of ["COMPLETED", "FAILED"] as const) {
      const f = await staged()
      const result = await execute(f)
      if (result.result.kind !== "completed") throw Error("Expected result")
      const altered = generalBookingReceiptSchema.parse(result.result.receipt)
      if (altered.effect.kind !== "hold_created") throw Error("Expected hold")
      altered.effect.holdId = "other-hold"
      f.row().executedResult = altered
      f.row().status = status
      const writes = f.transitions.length
      await expect(
        confirm(f.tx, f.scope, request(f), ""),
      ).rejects.toMatchObject({ reason: "saved_result_unavailable" })
      expect(f.transitions).toHaveLength(writes)
    }
  }))

test("immutable native actor/hash/source/origin mismatches cannot be adopted from a schema-valid receipt", () =>
  clocked(async () => {
    for (const change of [
      (f: Fixture) =>
        Object.assign(f.canonical.events.at(-1) ?? {}, {
          actorUserId: "other",
        }),
      (f: Fixture) =>
        Object.assign(f.canonical.events.at(-1) ?? {}, {
          payloadHash: "f".repeat(64),
        }),
      (f: Fixture) =>
        Object.assign(f.canonical.bookings.at(-1) ?? {}, { sourceId: "other" }),
      (f: Fixture) =>
        Object.assign(f.canonical.events.at(-1) ?? {}, { storeId: "other" }),
    ]) {
      const f = await staged("service_booking_confirm")
      await execute(f)
      change(f)
      const writes = f.transitions.length
      await expect(confirm(f.tx, f.scope, request(f), "")).rejects.toThrow()
      expect(f.transitions).toHaveLength(writes)
    }
  }))

test("fresh current read authority is required even after a verified effect; no new issuance gate substitutes", () =>
  clocked(async () => {
    for (const change of [
      (f: Fixture) => {
        f.canonical.state.member.status = "SUSPENDED"
      },
      (f: Fixture) => {
        f.canonical.state.member.staffStoreAssignments.length = 0
      },
      (f: Fixture) => {
        f.canonical.state.member.serviceCommerceStoreTeamAssignments.length = 0
      },
      (f: Fixture) => {
        f.canonical.state.member.staffAccessRevision = 0
      },
      (f: Fixture) => {
        f.canonical.state.tenant.isActive = false
      },
      (f: Fixture) => {
        f.canonical.state.store.status = "INACTIVE"
      },
    ]) {
      const f = await staged()
      await execute(f)
      change(f)
      const writes = f.transitions.length
      await expect(
        confirm(f.tx, f.scope, request(f), ""),
      ).rejects.toMatchObject({ code: "BOOKING_FORBIDDEN" })
      expect(f.transitions).toHaveLength(writes)
    }
  }))

test("new pending execution requires current local domain signature and expiry, ordinary GENERAL token is incompatible", () =>
  clocked(async (setNow) => {
    const f = await staged()
    const raw = request(f)
    const row = f.row()
    const ordinary = proposalApprovalToken(
      {
        id: row.id,
        revision: row.revision,
        payloadHash: row.payloadHash,
        actorUserId: row.actorUserId,
        tenantId: row.tenantId,
        storeId: row.storeId,
        expiresAt: row.expiresAt,
      },
      signingKey,
    )
    await expect(
      inspect(f.tx, f.scope, { ...raw, approvalToken: ordinary }, signingKey),
    ).rejects.toMatchObject({ reason: "approval_unavailable" })
    await expect(inspect(f.tx, f.scope, raw, "ROTATED")).rejects.toMatchObject({
      reason: "approval_unavailable",
    })
    setNow(row.expiresAt.getTime())
    await expect(inspect(f.tx, f.scope, raw, signingKey)).rejects.toMatchObject(
      { reason: "approval_unavailable" },
    )
    expect(f.transitions).toHaveLength(0)
  }))

test("fresh re-review binds current source, contact/consent, capacity, role, policy and configuration", () =>
  clocked(async () => {
    for (const change of [
      (f: Fixture) => {
        f.canonical.state.source.customerPhone = "CHANGED"
      },
      (f: Fixture) => {
        Object.assign(f.canonical.state.source, { contactOptIn: false })
      },
      (f: Fixture) => {
        f.canonical.state.source.revision = 2
      },
      (f: Fixture) => {
        f.canonical.state.config.revision = 1
      },
      (f: Fixture) => {
        f.canonical.state.resource.capacity = 0
      },
      (f: Fixture) => {
        f.canonical.state.member.role = "CASHIER"
      },
      (f: Fixture) => {
        f.canonical.state.profile.bookingEnabled = false
      },
    ]) {
      const f = await staged("service_booking_confirm")
      const p = await prepared(f)
      change(f)
      const domainWrites = f.canonical.writes.length
      await expect(
        confirm(f.tx, f.scope, p.raw, signingKey, p.handle),
      ).rejects.toThrow()
      expect(f.transitions).toHaveLength(0)
      expect(f.canonical.writes).toHaveLength(domainWrites)
      expect(f.canonical.bookings).toHaveLength(0)
    }
  }))

test("full persisted fingerprint catches same-revision row changes and queued competing cancellation before CAS", () =>
  clocked(async () => {
    for (const change of [
      (f: Fixture) => {
        f.row().updatedAt = new Date(instant + 1)
      },
      (f: Fixture) => {
        f.row().targetRevision = "f".repeat(64)
      },
      (f: Fixture) => {
        f.row().roleSnapshot = "ADMIN"
      },
    ]) {
      const f = await staged()
      const p = await prepared(f)
      change(f)
      await expect(
        confirm(f.tx, f.scope, p.raw, signingKey, p.handle),
      ).rejects.toThrow()
      expect(f.canonical.holds).toHaveLength(0)
    }
    const g = await staged()
    const p = await prepared(g)
    g.decisions.beforeTransition = (status) => {
      if (status === "EXECUTING")
        Object.assign(g.row(), {
          status: "CANCELLED",
          decidedAt: new Date(instant),
          updatedAt: new Date(instant + 5),
        })
    }
    await expect(
      confirm(g.tx, g.scope, p.raw, signingKey, p.handle),
    ).rejects.toMatchObject({ reason: "stale" })
    expect(g.row().status).toBe("CANCELLED")
    expect(g.canonical.holds).toHaveLength(0)
  }))

test("lost claim creates no native effect; lost completion remains unknown until exact proof-only reconciliation", () =>
  clocked(async () => {
    const f = await staged()
    const p = await prepared(f)
    f.decisions.loseStatus = "EXECUTING"
    await expect(
      confirm(f.tx, f.scope, p.raw, signingKey, p.handle),
    ).rejects.toMatchObject({ reason: "stale" })
    expect(f.canonical.holds).toHaveLength(0)
    f.decisions.loseStatus = "COMPLETED"
    await expect(
      confirm(f.tx, f.scope, p.raw, signingKey, p.handle),
    ).rejects.toMatchObject({ reason: "stale" })
    // Deliberately retained inert mutations are NOT a successful SQL rollback test.
    expect(f.row().status).toBe("EXECUTING")
    expect(f.canonical.holds).toHaveLength(1)
    const writes = f.canonical.writes.length
    f.decisions.loseStatus = ""
    const recovered = await confirm(f.tx, f.scope, p.raw, "")
    expect(recovered.result).toMatchObject({
      kind: "completed",
      recovered: true,
    })
    expect(recovered.notificationDispatches).toEqual([])
    expect(f.canonical.writes).toHaveLength(writes)
  }))

test("post-update readback must preserve exact binding, decision time and outcome metadata", () =>
  clocked(async () => {
    for (const status of ["EXECUTING", "COMPLETED", "CANCELLED"]) {
      const f = await staged()
      const p = await prepared(f)
      f.decisions.afterTransition = (seen) => {
        if (seen === status) f.row().targetRevision = "e".repeat(64)
      }
      await expect(
        confirm(
          f.tx,
          f.scope,
          status === "CANCELLED" ? request(f, "cancel") : p.raw,
          signingKey,
          p.handle,
        ),
      ).rejects.toThrow()
      if (status === "EXECUTING" || status === "CANCELLED")
        expect(f.canonical.holds).toHaveLength(0)
    }
  }))

test("strict compact request rejects callbacks, scope/receipt/provider fields, oversized and malformed identity before delegates", async () => {
  const f = bookingConfirmationFixture()
  let touches = 0
  const tx = new Proxy(f.tx, {
    get() {
      touches++
      throw Error("No delegate")
    },
  })
  const raw = {
    conversationId: f.conversationScope.conversationId,
    draftRef: ids.proposalId,
    revision: 1,
    decision: "confirm",
  }
  for (const invalid of [
    { ...raw, actorUserId: "spoof" },
    { ...raw, receipt: {} },
    { ...raw, now: new Date() },
    { ...raw, callback: () => {} },
    { ...raw, accessToken: "public" },
    { ...raw, draftRef: "" },
    { ...raw, revision: 0 },
    { ...raw, approvalToken: "x".repeat(5000) },
  ])
    await expect(
      confirm(tx, f.scope, invalid, signingKey),
    ).rejects.toMatchObject({ reason: "invalid_request" })
  expect(touches).toBe(0)
})

test("postcommit notification enqueue failure cannot cause new execution or fabricated delivery", () =>
  clocked(async () => {
    const f = await staged("service_booking_confirm")
    const outcome = await execute(f)
    expect(outcome.notificationDispatches).toHaveLength(1)
    await expect(
      Promise.reject(Error("synthetic after-commit enqueue failure")),
    ).rejects.toThrow()
    const writes = f.canonical.writes.length
    const retry = await confirm(f.tx, f.scope, request(f), "")
    expect(retry.notificationDispatches).toEqual([])
    expect(f.canonical.writes).toHaveLength(writes)
    if (
      retry.result.kind !== "completed" ||
      retry.result.receipt.effect.kind !== "booking_event"
    )
      throw Error("Expected event")
    expect(retry.result.receipt.effect.notificationDelivery).toBe("unverified")
    expect(f.canonical.notifications).toHaveLength(1)
  }))

test("same opaque preparation survives an explicitly restored pre-effect rollback checkpoint without reallocating crypto", () =>
  clocked(async () => {
    const f = await staged()
    const original = structuredClone(f.row())
    const tokenOriginal = capability.issueServiceCommerceBookingCapabilityToken
    const token = spyOn(
      capability,
      "issueServiceCommerceBookingCapabilityToken",
    ).mockImplementation(tokenOriginal)
    try {
      const p = await prepared(f)
      expect(token).toHaveBeenCalledTimes(1)
      let first = true
      const tx = new Proxy(f.tx, {
        get(target, name) {
          if (name === "$queryRaw")
            return async (...args: unknown[]) => {
              if (first) {
                first = false
                throw Error("synthetic serialization before native effects")
              }
              return Reflect.apply(target.$queryRaw, target, args)
            }
          return Reflect.get(target, name)
        },
      })
      await expect(
        confirm(tx, f.scope, p.raw, signingKey, p.handle),
      ).rejects.toThrow("synthetic serialization")
      expect(f.canonical.holds).toHaveLength(0)
      expect(f.row().status).toBe("EXECUTING")
      // Restore the caller's pre-effect checkpoint explicitly. This does not test a database rollback.
      Object.assign(f.row(), original)
      const result = await confirm(tx, f.scope, p.raw, signingKey, p.handle)
      expect(result.result).toMatchObject({
        kind: "completed",
        recovered: false,
      })
      expect(f.canonical.holds).toHaveLength(1)
      expect(f.canonical.holds[0]?.clientHoldId).toBe(ids.idempotencyKey)
      expect(token).toHaveBeenCalledTimes(1)
    } finally {
      token.mockRestore()
    }
  }))
