import { describe, expect, spyOn, test } from "bun:test"
import {
  field,
  bookingAvailabilityScope as scope,
} from "../test-helpers/booking-availability"
import { bookingCommandFixture } from "../test-helpers/booking-commands"
import { fixture as decisionFixture } from "../test-helpers/commerce-quote-decision"
import {
  readServiceCommerceBookingConfirmationEffectInTransaction,
  readServiceCommerceBookingHoldEffectInTransaction,
  readServiceCommerceBookingRevisionEffectInTransaction,
} from "./booking-command-effects"
import {
  type StaffServiceCommerceBookingRevisionInput,
  confirmPreparedServiceCommerceBookingInTransaction,
  createPreparedServiceCommerceBookingHoldInTransaction,
  inspectServiceCommerceBookingConfirmationInTransaction,
  prepareServiceCommerceBookingConfirmation,
  prepareServiceCommerceBookingHold,
  prepareServiceCommerceBookingRevision,
  revisePreparedServiceCommerceBookingInTransaction,
} from "./booking-commands"
import {
  confirmServiceCommerceBooking,
  createServiceCommerceBookingHold,
  reviseServiceCommerceBooking,
} from "./lifecycle"
import { bookingTokenDigest } from "./shared"

const instant = Date.parse("2031-02-03T08:00:00.000Z")
function savedRowId(row: Record<string, unknown> | undefined): string {
  if (typeof row?.id !== "string") throw Error("Expected a saved row ID")
  return row.id
}
function holdInput() {
  return {
    ...scope,
    clientOperationId: "hold-command",
    expectedConfigurationRevision: 0,
    offeringId: "offering-1",
    quantity: 1,
    resourceId: "resource-1",
    slotStartAt: new Date(instant + 2 * 3600000),
    slotEndAt: new Date(instant + 2.5 * 3600000),
    source: { kind: "service" as const, id: "request-1" },
  }
}
function fixture() {
  const f = bookingCommandFixture()
  let transactionDepth = 0
  let allocations = 0
  let encryptions = 0
  const token = (input: { clientOperationId: string }) => {
    expect(transactionDepth).toBe(0)
    allocations++
    return `PRIVATE_TOKEN:${input.clientOperationId}`
  }
  const protectRecipient = (phone: string) => {
    expect(transactionDepth).toBe(0)
    encryptions++
    return `PRIVATE_CIPHER:${phone}`
  }
  async function inTransaction<T>(run: () => Promise<T>) {
    transactionDepth++
    try {
      return await run()
    } finally {
      transactionDepth--
    }
  }
  return {
    ...f,
    token,
    protectRecipient,
    inTransaction,
    counts: () => ({ allocations, encryptions }),
  }
}
type Fixture = ReturnType<typeof fixture>
async function held(f: Fixture) {
  const input = holdInput()
  const prepared = prepareServiceCommerceBookingHold(input, f.token)
  const result = await f.inTransaction(() =>
    createPreparedServiceCommerceBookingHoldInTransaction(
      f.tx,
      prepared,
      scope,
    ),
  )
  return { input, prepared, result }
}
async function confirmed(f: Fixture, linked = false) {
  const h = await held(f)
  const input = {
    ...scope,
    source: holdInput().source,
    holdId: h.result.receipt.holdId,
    clientOperationId: "confirm-command",
    ...(linked ? { commercialOrderId: "order-1", serviceJobId: "job-1" } : {}),
  }
  if (linked) {
    f.jobs.push({
      id: "job-1",
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      commercialOrderId: "order-1",
      revision: 0,
    })
    f.jobLines.push({
      id: "job-line-1",
      serviceJobId: "job-1",
      status: "QUEUED",
      authorizationStatus: "AUTHORIZED",
      revision: 0,
      completedAt: null,
    })
  }
  const inspection = await f.inTransaction(() =>
    inspectServiceCommerceBookingConfirmationInTransaction(f.tx, input),
  )
  const prepared = prepareServiceCommerceBookingConfirmation(inspection, {
    issueCapabilityToken: f.token,
    protectRecipient: f.protectRecipient,
  })
  const result = await f.inTransaction(() =>
    confirmPreparedServiceCommerceBookingInTransaction(f.tx, prepared, scope),
  )
  return { h, input, inspection, prepared, result }
}
function revisionInput(
  bookingId: string,
  operation: StaffServiceCommerceBookingRevisionInput["operation"],
  expectedRevision = 0,
): StaffServiceCommerceBookingRevisionInput {
  return {
    ...scope,
    bookingId,
    operation,
    expectedRevision,
    clientOperationId: `${operation}-${expectedRevision}`,
    ...(["cancel", "mark_no_show", "reschedule"].includes(operation)
      ? { reasonCode: "  CUSTOMER_REQUEST  " }
      : {}),
    ...(operation === "reschedule"
      ? {
          resourceId: "resource-1",
          newSlotStartAt: new Date(instant + 3 * 3600000),
          newSlotEndAt: new Date(instant + 3.5 * 3600000),
        }
      : {}),
  }
}
function safe(receipt: unknown) {
  const text = JSON.stringify(receipt)
  for (const privatePart of [
    "PRIVATE",
    "token",
    "payloadHash",
    "customerName",
    "recipient",
    "notificationDispatches",
    "paymentStatus",
    "commercialOrderId",
  ])
    expect(text).not.toContain(privatePart)
}
async function clocked(run: () => Promise<void>) {
  const clock = spyOn(Date, "now").mockReturnValue(instant)
  try {
    await run()
  } finally {
    clock.mockRestore()
  }
}

describe("prepared caller-owned booking commands", () => {
  test("hold preparation snapshots Dates/input, retries same token, and returns exact safe historical receipt", () =>
    clocked(async () => {
      const f = fixture()
      const input = holdInput()
      const prepared = prepareServiceCommerceBookingHold(input, f.token)
      input.source.id = "foreign"
      input.quantity = 2
      input.slotStartAt.setUTCFullYear(2040)
      const first = await f.inTransaction(() =>
        createPreparedServiceCommerceBookingHoldInTransaction(
          f.tx,
          prepared,
          scope,
        ),
      )
      const second = await f.inTransaction(() =>
        createPreparedServiceCommerceBookingHoldInTransaction(
          f.tx,
          prepared,
          scope,
        ),
      )
      expect(first).toEqual(second)
      expect(f.holds).toHaveLength(1)
      expect(f.capabilities).toHaveLength(1)
      expect(f.counts()).toEqual({ allocations: 1, encryptions: 0 })
      expect(first.receipt.source.id).toBe("request-1")
      expect(first.receipt.startAt).toBe("2031-02-03T10:00:00.000Z")
      expect(f.capabilities[0]?.tokenDigest).toBe(
        bookingTokenDigest("PRIVATE_TOKEN:hold-command:confirm"),
      )
      safe(first)
    }))
  test("confirmation inspection is read-only; encryption/token outside TX once; commit and replay preserve exact effects", () =>
    clocked(async () => {
      const f = fixture()
      const c = await confirmed(f)
      expect(
        prepareServiceCommerceBookingConfirmation(c.inspection, {
          issueCapabilityToken: () => {
            throw Error("must not allocate again")
          },
          protectRecipient: () => {
            throw Error("must not encrypt again")
          },
        }),
      ).toBe(c.prepared)
      const before = f.writes.length
      const replay = await f.inTransaction(() =>
        confirmPreparedServiceCommerceBookingInTransaction(
          f.tx,
          c.prepared,
          scope,
        ),
      )
      expect(replay.receipt).toEqual(c.result.receipt)
      expect(f.bookings).toHaveLength(1)
      expect(f.events).toHaveLength(1)
      expect(f.notifications).toHaveLength(1)
      expect(f.counts()).toEqual({ allocations: 2, encryptions: 1 })
      expect(
        f.writes
          .slice(before)
          .every((w) => w.table === "serviceCommercePolicyAuditEvent"),
      ).toBe(true)
      expect(c.result.notificationDispatches).toEqual([
        { actorUserId: "actor-1", intentId: savedRowId(f.notifications[0]) },
      ])
      safe(c.result.receipt)
      expect(f.bookings[0]?.customerContactCiphertext).toBe(
        "PRIVATE_CIPHER:PRIVATE_PHONE",
      )
    }))
  test("inspection itself never writes; source contact/consent/revision changes refuse before booking/capability/notification writes", () =>
    clocked(async () => {
      for (const change of [
        { customerPhone: "CHANGED" },
        { contactOptIn: false },
        { revision: 2 },
        { channelOrigin: "WHATSAPP" },
        { customerName: "Changed" },
      ]) {
        const f = fixture()
        const h = await held(f)
        const input = {
          ...scope,
          source: holdInput().source,
          holdId: h.result.receipt.holdId,
          clientOperationId: "confirm-command",
        }
        const writes = f.writes.length
        const inspection = await f.inTransaction(() =>
          inspectServiceCommerceBookingConfirmationInTransaction(f.tx, input),
        )
        expect(f.writes.length).toBe(writes)
        const prepared = prepareServiceCommerceBookingConfirmation(inspection, {
          issueCapabilityToken: f.token,
          protectRecipient: f.protectRecipient,
        })
        Object.assign(f.state.source, change)
        await expect(
          f.inTransaction(() =>
            confirmPreparedServiceCommerceBookingInTransaction(
              f.tx,
              prepared,
              scope,
            ),
          ),
        ).rejects.toMatchObject({ code: "BOOKING_REVISION_CONFLICT" })
        expect(f.bookings).toHaveLength(0)
        expect(f.notifications).toHaveLength(0)
        expect(f.capabilities).toHaveLength(1)
      }
    }))
  test("fresh commit clock expires hold rather than reusing inspection time and consent-off never invokes crypto", () =>
    clocked(async () => {
      const f = fixture()
      Object.assign(f.state.source, { contactOptIn: false })
      const h = await held(f)
      const input = {
        ...scope,
        source: holdInput().source,
        holdId: h.result.receipt.holdId,
        clientOperationId: "confirm-command",
      }
      const inspection =
        await inspectServiceCommerceBookingConfirmationInTransaction(
          f.tx,
          input,
        )
      const prepared = prepareServiceCommerceBookingConfirmation(inspection, {
        issueCapabilityToken: f.token,
        protectRecipient: () => {
          throw Error("No consent")
        },
      })
      const later = spyOn(Date, "now").mockReturnValue(instant + 11 * 60000)
      try {
        await expect(
          confirmPreparedServiceCommerceBookingInTransaction(
            f.tx,
            prepared,
            scope,
          ),
        ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })
      } finally {
        later.mockRestore()
      }
      expect(f.bookings).toHaveLength(0)
    }))
  test("malformed/forged staff inputs and serialized opaque evidence refuse before any delegate", async () => {
    const f = fixture()
    const customerInput = { ...holdInput(), accessToken: "customer" }
    expect(() =>
      prepareServiceCommerceBookingHold(customerInput, f.token),
    ).toThrow()
    const clientClockInput = { ...holdInput(), now: new Date() }
    expect(() =>
      prepareServiceCommerceBookingHold(clientClockInput, f.token),
    ).toThrow()
    const prepared = prepareServiceCommerceBookingHold(holdInput(), f.token)
    await expect(
      createPreparedServiceCommerceBookingHoldInTransaction(
        f.tx,
        JSON.parse(JSON.stringify(prepared)),
        scope,
      ),
    ).rejects.toMatchObject({ code: "BOOKING_INVALID_INPUT" })
    expect(f.writes).toHaveLength(0)
    expect(f.reads).toHaveLength(0)
  })
  test("current membership, attendant, Store grant, Tenant/Store activity and access revision remain fresh", () =>
    clocked(async () => {
      for (const change of [
        (f: Fixture) => {
          f.state.member.status = "SUSPENDED"
        },
        (f: Fixture) => {
          f.state.member.serviceCommerceStoreTeamAssignments.length = 0
        },
        (f: Fixture) => {
          f.state.member.staffStoreAssignments.length = 0
        },
        (f: Fixture) => {
          f.state.member.staffAccessRevision = 0
        },
        (f: Fixture) => {
          f.state.tenant.isActive = false
        },
        (f: Fixture) => {
          f.state.store.status = "INACTIVE"
        },
      ]) {
        const f = fixture()
        const prepared = prepareServiceCommerceBookingHold(holdInput(), f.token)
        change(f)
        await expect(
          createPreparedServiceCommerceBookingHoldInTransaction(
            f.tx,
            prepared,
            scope,
          ),
        ).rejects.toMatchObject({ code: "BOOKING_FORBIDDEN" })
        expect(f.writes).toHaveLength(0)
      }
    }))
  test("all six revisions use canonical transition/CAS/capability/events and safe immutable receipt", () =>
    clocked(async () => {
      for (const operation of [
        "arrive",
        "start",
        "complete",
        "mark_no_show",
        "reschedule",
        "cancel",
      ] as const) {
        const f = fixture()
        const c = await confirmed(f)
        if (operation === "start")
          Object.assign(f.bookings[0] ?? {}, { status: "ARRIVED" })
        if (operation === "complete")
          Object.assign(f.bookings[0] ?? {}, { status: "IN_SERVICE" })
        const input = revisionInput(c.result.receipt.bookingId, operation)
        const prepared = prepareServiceCommerceBookingRevision(input, f.token)
        const result = await f.inTransaction(() =>
          revisePreparedServiceCommerceBookingInTransaction(
            f.tx,
            prepared,
            scope,
          ),
        )
        const replay = await f.inTransaction(() =>
          revisePreparedServiceCommerceBookingInTransaction(
            f.tx,
            prepared,
            scope,
          ),
        )
        expect(replay.receipt).toEqual(result.receipt)
        expect(result.receipt.revision).toBe(1)
        expect(result.receipt.operation).toBe(operation)
        expect(f.events).toHaveLength(2)
        expect(f.bookings[0]?.revision).toBe(1)
        expect(f.counts().allocations).toBe(3)
        safe(result.receipt)
        expect(f.events[1]?.reasonCode).toBe(input.reasonCode?.trim())
        expect(
          f.capabilities.filter((r) => r.status === "ACTIVE"),
        ).toHaveLength(
          ["cancel", "complete", "mark_no_show"].includes(operation) ? 0 : 1,
        )
      }
    }))
  test("revision rejects stale revision, unavailable capacity, wrong scope and lost CAS (caller must roll back TX)", () =>
    clocked(async () => {
      const f = fixture()
      const c = await confirmed(f)
      const input = revisionInput(c.result.receipt.bookingId, "arrive", 3)
      await expect(
        revisePreparedServiceCommerceBookingInTransaction(
          f.tx,
          prepareServiceCommerceBookingRevision(input, f.token),
          scope,
        ),
      ).rejects.toMatchObject({ code: "BOOKING_REVISION_CONFLICT" })
      expect(f.events).toHaveLength(1)
      f.controls.loseCAS = "serviceBooking"
      await expect(
        revisePreparedServiceCommerceBookingInTransaction(
          f.tx,
          prepareServiceCommerceBookingRevision(
            { ...input, expectedRevision: 0 },
            f.token,
          ),
          scope,
        ),
      ).rejects.toMatchObject({ code: "BOOKING_REVISION_CONFLICT" })
      expect(f.events).toHaveLength(1)
      await expect(
        revisePreparedServiceCommerceBookingInTransaction(
          f.tx,
          prepareServiceCommerceBookingRevision(
            { ...input, expectedRevision: 0, storeId: "foreign" },
            f.token,
          ),
          scope,
        ),
      ).rejects.toMatchObject({ code: "BOOKING_FORBIDDEN" })
      f.controls.loseCAS = ""
      f.state.resource.capacity = 0
      await expect(
        revisePreparedServiceCommerceBookingInTransaction(
          f.tx,
          prepareServiceCommerceBookingRevision(
            revisionInput(c.result.receipt.bookingId, "reschedule"),
            f.token,
          ),
          scope,
        ),
      ).rejects.toMatchObject({ code: "BOOKING_CAPACITY_CONFLICT" })
    }))
  test("terminal recovery is pure native proof despite disabled issuance, source declined and changed live booking", () =>
    clocked(async () => {
      const f = fixture()
      const c = await confirmed(f)
      const input = revisionInput(c.result.receipt.bookingId, "cancel")
      const result = await revisePreparedServiceCommerceBookingInTransaction(
        f.tx,
        prepareServiceCommerceBookingRevision(input, f.token),
        scope,
      )
      f.state.profile.bookingEnabled = false
      f.state.source.status = "DECLINED"
      Object.assign(f.bookings[0] ?? {}, {
        status: "COMPLETED",
        revision: 9,
        startAt: new Date(instant + 9 * 3600000),
        customerName: "Changed",
      })
      const before = f.writes.length
      const allocations = f.counts()
      expect(
        await readServiceCommerceBookingRevisionEffectInTransaction(
          f.tx,
          input,
        ),
      ).toEqual(result.receipt)
      expect(
        await readServiceCommerceBookingConfirmationEffectInTransaction(
          f.tx,
          c.input,
        ),
      ).toEqual(c.result.receipt)
      expect(
        await readServiceCommerceBookingHoldEffectInTransaction(
          f.tx,
          c.h.input,
        ),
      ).toEqual(c.h.result.receipt)
      expect(f.writes.length).toBe(before)
      expect(f.counts()).toEqual(allocations)
      expect(
        await readServiceCommerceBookingRevisionEffectInTransaction(f.tx, {
          ...input,
          clientOperationId: "missing",
        }),
      ).toBeNull()
      await expect(
        readServiceCommerceBookingRevisionEffectInTransaction(f.tx, {
          ...input,
          reasonCode: "OTHER",
        }),
      ).rejects.toMatchObject({ code: "BOOKING_IDEMPOTENCY_MISMATCH" })
      f.state.source.storeId = "foreign"
      await expect(
        readServiceCommerceBookingRevisionEffectInTransaction(f.tx, input),
      ).rejects.toMatchObject({ code: "BOOKING_IDEMPOTENCY_MISMATCH" })
    }))
  test("linked start/complete retains financial-before-booking-before-Job locks and work authorization; unpaid is not invented gate", () =>
    clocked(async () => {
      const f = fixture()
      const c = await confirmed(f, true)
      Object.assign(f.bookings[0] ?? {}, { status: "ARRIVED" })
      f.locks.length = 0
      const start = revisionInput(c.result.receipt.bookingId, "start")
      await revisePreparedServiceCommerceBookingInTransaction(
        f.tx,
        prepareServiceCommerceBookingRevision(start, f.token),
        scope,
      )
      expect(f.locks).toEqual([
        "FinanceBook",
        "CustomerLedgerAccount",
        "CommercialOrder",
        "ServiceBooking",
        "ServiceJob",
      ])
      expect(f.jobLines[0]?.status).toBe("IN_PROGRESS")
      expect(f.workEvents).toHaveLength(1)
      expect(f.orders[0]?.paymentStatus).toBe("UNPAID")
      const complete = revisionInput(c.result.receipt.bookingId, "complete", 1)
      await revisePreparedServiceCommerceBookingInTransaction(
        f.tx,
        prepareServiceCommerceBookingRevision(complete, f.token),
        scope,
      )
      expect(f.jobLines[0]?.status).toBe("COMPLETED")
      expect(f.workEvents).toHaveLength(2)
      expect(f.orders[0]?.status).toBe("FULFILLING")
      const denied = fixture()
      const other = await confirmed(denied, true)
      Object.assign(denied.bookings[0] ?? {}, { status: "ARRIVED" })
      Object.assign(denied.jobLines[0] ?? {}, {
        authorizationStatus: "PENDING",
      })
      await expect(
        revisePreparedServiceCommerceBookingInTransaction(
          denied.tx,
          prepareServiceCommerceBookingRevision(
            revisionInput(other.result.receipt.bookingId, "start"),
            denied.token,
          ),
          scope,
        ),
      ).rejects.toMatchObject({ code: "BOOKING_BLOCKED" })
      expect(denied.workEvents).toHaveLength(0)
    }))
  test("cancellation stores bounded native refund consequence; recovery ignores later live payments", () =>
    clocked(async () => {
      const f = fixture()
      const c = await confirmed(f, true)
      Object.assign(f.bookings[0] ?? {}, {
        requiredPaymentMinorSnapshot: 5000,
        refundPolicySnapshot: "FULL_BEFORE_CUTOFF",
        cancellationWindowSnapshot: 0,
      })
      f.payments.push(
        { orderId: "order-1", ...scope, type: "PAYMENT", amountMinor: 6000 },
        { orderId: "order-1", ...scope, type: "REFUND", amountMinor: 2000 },
      )
      const input = revisionInput(c.result.receipt.bookingId, "cancel")
      const result = await revisePreparedServiceCommerceBookingInTransaction(
        f.tx,
        prepareServiceCommerceBookingRevision(input, f.token),
        scope,
      )
      expect(result.receipt.refundConsequence).toEqual({
        outcome: "refund_eligible",
        amountMinor: 4000,
      })
      f.payments.length = 0
      const before = f.reads.length
      expect(
        await readServiceCommerceBookingRevisionEffectInTransaction(
          f.tx,
          input,
        ),
      ).toEqual(result.receipt)
      expect(
        f.reads.slice(before).some((r) => r.table === "commercialOrderPayment"),
      ).toBe(false)
    }))
  test("trusted token callbacks receive only allocation identity and cannot mutate the prepared command", () =>
    clocked(async () => {
      const f = fixture()
      const original = holdInput()
      const prepared = prepareServiceCommerceBookingHold(
        original,
        (allocation) => {
          expect(Object.keys(allocation).sort()).toEqual([
            "clientOperationId",
            "purpose",
            "storeId",
            "tenantId",
          ])
          original.source.id = "mutated"
          original.slotEndAt.setFullYear(2040)
          return f.token(allocation)
        },
      )
      const saved = await createPreparedServiceCommerceBookingHoldInTransaction(
        f.tx,
        prepared,
        scope,
      )
      expect(saved.receipt.source.id).toBe("request-1")
      expect(saved.receipt.endAt).toBe("2031-02-03T10:30:00.000Z")
    }))
  test("same prepared allocation survives a caller retry without nested transaction or crypto", () =>
    clocked(async () => {
      const f = fixture()
      const prepared = prepareServiceCommerceBookingHold(holdInput(), f.token)
      let first = true
      const tx = new Proxy(f.tx, {
        get(target, key) {
          if (key === "$queryRaw")
            return async (...args: unknown[]) => {
              if (first) {
                first = false
                throw Error(
                  "synthetic serialization retry before command writes",
                )
              }
              return Reflect.apply(target.$queryRaw, target, args)
            }
          return Reflect.get(target, key)
        },
      })
      await expect(
        createPreparedServiceCommerceBookingHoldInTransaction(
          tx,
          prepared,
          scope,
        ),
      ).rejects.toThrow("synthetic serialization")
      expect(f.holds).toHaveLength(0)
      const result =
        await createPreparedServiceCommerceBookingHoldInTransaction(
          tx,
          prepared,
          scope,
        )
      expect(result.receipt.holdId).toBe(savedRowId(f.holds[0]))
      expect(f.counts()).toEqual({ allocations: 1, encryptions: 0 })
    }))
  test("historical recovery refuses changed actor, exact native proof and inactive current membership without issuance work", () =>
    clocked(async () => {
      const f = fixture()
      const c = await confirmed(f)
      const before = f.writes.length
      Object.assign(f.events[0] ?? {}, { actorUserId: "foreign" })
      await expect(
        readServiceCommerceBookingConfirmationEffectInTransaction(
          f.tx,
          c.input,
        ),
      ).rejects.toMatchObject({ code: "BOOKING_IDEMPOTENCY_MISMATCH" })
      Object.assign(f.events[0] ?? {}, { actorUserId: scope.actorUserId })
      f.state.member.status = "SUSPENDED"
      await expect(
        readServiceCommerceBookingConfirmationEffectInTransaction(
          f.tx,
          c.input,
        ),
      ).rejects.toMatchObject({ code: "BOOKING_FORBIDDEN" })
      expect(f.writes.length).toBe(before)
    }))
  test("all prepared commits bind the required fresh caller actor/Tenant/Store before any delegate", () =>
    clocked(async () => {
      const f = fixture()
      const c = await confirmed(f)
      const revision = prepareServiceCommerceBookingRevision(
        revisionInput(c.result.receipt.bookingId, "arrive"),
        f.token,
      )
      let touches = 0
      const untouched = new Proxy(f.tx, {
        get() {
          touches++
          throw Error("Scope refusal must precede every delegate")
        },
      })
      const writes = f.writes.length
      for (const current of [
        { ...scope, actorUserId: "other-actor" },
        { ...scope, tenantId: "other-tenant" },
        { ...scope, storeId: "other-store" },
      ]) {
        await expect(
          createPreparedServiceCommerceBookingHoldInTransaction(
            untouched,
            c.h.prepared,
            current,
          ),
        ).rejects.toMatchObject({ code: "BOOKING_FORBIDDEN" })
        await expect(
          confirmPreparedServiceCommerceBookingInTransaction(
            untouched,
            c.prepared,
            current,
          ),
        ).rejects.toMatchObject({ code: "BOOKING_FORBIDDEN" })
        await expect(
          revisePreparedServiceCommerceBookingInTransaction(
            untouched,
            revision,
            current,
          ),
        ).rejects.toMatchObject({ code: "BOOKING_FORBIDDEN" })
      }
      expect(touches).toBe(0)
      expect(f.writes.length).toBe(writes)
      // The original scope remains currently eligible; failure was caller binding,
      // not revocation or a synthetic authorization refusal.
      const same = await revisePreparedServiceCommerceBookingInTransaction(
        f.tx,
        revision,
        scope,
      )
      expect(same.receipt.operation).toBe("arrive")
      expect(f.bookings[0]?.revision).toBe(1)
    }))
  test("native wrappers keep own transaction, tokens, projections and local encryption compatibility", () =>
    clocked(async () => {
      const f = fixture()
      let transactions = 0
      // Existing typed root scaffold; only its transaction method is permitted.
      const db = new Proxy(decisionFixture().root, {
        get(_target, key) {
          if (key === "$transaction")
            return async (
              run: (tx: typeof f.tx) => Promise<unknown>,
              options: unknown,
            ) => {
              expect(field(options, "isolationLevel")).toBe("Serializable")
              transactions++
              return run(f.tx)
            }
          throw Error(`Unexpected root client access: ${String(key)}`)
        },
      })
      const hold = await createServiceCommerceBookingHold(db, {
        ...holdInput(),
        issueCapabilityToken: f.token,
        now: new Date(instant),
      })
      const confirmation = await confirmServiceCommerceBooking(db, {
        ...scope,
        source: holdInput().source,
        holdId: hold.id,
        clientOperationId: "native-confirm",
        now: new Date(instant),
        issueCapabilityToken: f.token,
        protectRecipient: f.protectRecipient,
      })
      expect(confirmation.accessToken).toBe(
        "PRIVATE_TOKEN:native-confirm:manage",
      )
      const revision = await reviseServiceCommerceBooking(db, {
        ...revisionInput(confirmation.id, "arrive"),
        now: new Date(instant),
        issueCapabilityToken: f.token,
      })
      expect(revision.status).toBe("arrived")
      expect(transactions).toBe(3)
      expect(f.counts()).toEqual({ allocations: 3, encryptions: 1 })
    }))
})
