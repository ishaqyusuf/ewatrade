import { expect, spyOn, test } from "bun:test"
import {
  field,
  matches,
  bookingAvailabilityScope as scope,
} from "../test-helpers/booking-availability"
import { bookingCommandFixture } from "../test-helpers/booking-commands"
import {
  type StaffServiceCommerceBookingReviewInput,
  reviewStaffServiceCommerceBookingCommandInTransaction as review,
} from "./booking-command-review"
import {
  confirmPreparedServiceCommerceBookingInTransaction,
  createPreparedServiceCommerceBookingHoldInTransaction,
  inspectServiceCommerceBookingConfirmationInTransaction,
  prepareServiceCommerceBookingConfirmation,
  prepareServiceCommerceBookingHold,
  prepareServiceCommerceBookingRevision,
  revisePreparedServiceCommerceBookingInTransaction,
} from "./booking-commands"
import { readStaffServiceCommerceBookingAvailabilityInTransaction } from "./staff-availability"

const now = Date.parse("2031-02-03T08:00:00.000Z")

test("confirmation uses actual native accepted Quote payment policy without claiming paid or dropping version facts", () =>
  withClock(async () => {
    const f = fixture()
    Object.assign(f.state.config, {
      paymentRequirement: "DEPOSIT",
      depositAmountMinor: 1500,
      paymentPolicyRevision: 7,
    })
    const input = await held(f)
    f.quoteVersions.push({
      id: "version-1",
      quoteId: "quote-1",
      version: 2,
      status: "ACCEPTED",
      currencyCode: "NGN",
      totalMinor: 5000,
      expiresAt: new Date(now + 86400_000),
      acceptedOrderId: null,
      quote: {
        id: "quote-1",
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        sourceId: "request-1",
        sourceType: "SERVICE_REQUEST",
        currentVersionId: "version-1",
      },
    })
    const command = {
      kind: "confirm" as const,
      input: { ...input, quoteVersionId: "version-1" },
    }
    const result = await review(f.readsOnly, command)
    if (!("payment" in result.review.details))
      throw Error("Expected confirmation payment")
    expect(result.review.details.payment).toEqual({
      currencyCode: "NGN",
      depositAmountMinor: 1500,
      payableAmountMinor: 5000,
      paymentStatus: "PENDING",
      requiredPaymentMinor: 1500,
    })
    expect(result.review.details.quoteVersion?.version).toBe(2)
    expect(result.review.details.quoteVersion?.expiresAt).toEqual(
      new Date(now + 86400_000),
    )
    Object.assign(f.quoteVersions[0] ?? {}, {
      expiresAt: new Date(now + 2 * 86400_000),
    })
    expect((await review(f.readsOnly, command)).target.revision).not.toBe(
      result.target.revision,
    )
    Object.assign(f.quoteVersions[0] ?? {}, { status: "DRAFT" })
    await expect(review(f.readsOnly, command)).rejects.toThrow()
    expect(
      f.writes.some((write) => write.table === "commercialOrderPayment"),
    ).toBe(false)
  }))

test("source consent/contact, native active Store access and pending reminder recipient remain digest-bound", () =>
  withClock(async () => {
    const f = fixture()
    const input = await held(f)
    const first = await review(f.readsOnly, { kind: "confirm", input })
    f.state.source.customerPhone = "PRIVATE_CHANGED_PHONE"
    const contact = await review(f.readsOnly, { kind: "confirm", input })
    expect(contact.target.revision).not.toBe(first.target.revision)
    expect(JSON.stringify(contact)).not.toContain("PRIVATE_CHANGED_PHONE")
    Object.assign(f.state.source, { contactOptIn: false })
    const noConsent = await review(f.readsOnly, { kind: "confirm", input })
    expect(noConsent.target.revision).not.toBe(contact.target.revision)
    const id = await confirmed(f)
    f.notifications.push({
      id: "reminder",
      bookingId: id,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      status: "PENDING",
      type: "REMINDER",
      scheduledFor: new Date(now + 3600_000),
      recipientCiphertext: "PRIVATE_REMINDER_A",
      authorizationUserId: scope.actorUserId,
    })
    const command = revisionInput(id, "cancel")
    const current = await review(f.readsOnly, command)
    Object.assign(f.notifications.find((row) => row.id === "reminder") ?? {}, {
      recipientCiphertext: "PRIVATE_REMINDER_B",
    })
    const changed = await review(f.readsOnly, command)
    expect(changed.target.revision).not.toBe(current.target.revision)
    expect(JSON.stringify(changed)).not.toContain("PRIVATE_REMINDER_B")
    f.state.member.staffAccessRevision = 0
    await expect(review(f.readsOnly, command)).rejects.toThrow()
  }))

test("complete review projects every native Job line and whole original Order obligation before actual native effects", () =>
  withClock(async () => {
    const f = fixture()
    const id = await confirmed(f)
    Object.assign(f.bookings[0] ?? {}, {
      status: "IN_SERVICE",
      commercialOrderId: "order-1",
      serviceJobId: "job-1",
    })
    f.jobs.push({
      id: "job-1",
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      commercialOrderId: "order-1",
      revision: 4,
    })
    for (let i = 0; i < 2001; i++)
      f.jobLines.push({
        id: `line-${i}`,
        serviceJobId: "job-1",
        revision: 0,
        status: "IN_PROGRESS",
        authorizationStatus: "AUTHORIZED",
        allocatedQuantity: "0.000001",
        reworkOfLineId: null,
        completedAt: null,
        serviceJob: {
          commercialOrderId: "order-1",
          storeId: scope.storeId,
          tenantId: scope.tenantId,
        },
      })
    f.orderLines.push({
      id: "original-line",
      orderId: "order-1",
      order: { storeId: scope.storeId, tenantId: scope.tenantId },
      kind: "SERVICE",
      quantity: "0.002001",
      productFulfillments: [],
      snapshot: {
        serviceAuthorizationPolicy: "ON_ORDER_CONFIRMATION",
        serviceWorkPolicy: "TRACKED",
      },
      serviceAuthorization: null,
      serviceFulfillment: null,
      serviceJobLines: f.jobLines,
    })
    const command = revisionInput(id, "complete")
    const writes = f.writes.length
    const result = await review(f.readsOnly, command)
    const details = result.review.details
    if (!("work" in details) || !details.work)
      throw Error("Expected complete work review")
    expect(details.work.lines).toHaveLength(2001)
    expect(details.work.changes).toHaveLength(2001)
    expect(details.work.lines.at(-1)?.allocatedQuantity).toBe("0.000001")
    expect(details.work.wouldCompleteOrder).toBe(true)
    expect(f.jobLines.every((line) => line.status === "IN_PROGRESS")).toBe(true)
    expect(f.writes).toHaveLength(writes)
    f.jobLines.reverse()
    f.orderLines.reverse()
    expect((await review(f.readsOnly, command)).target).toEqual(result.target)
    if (command.kind !== "revise") throw Error("Expected revision command")
    await revisePreparedServiceCommerceBookingInTransaction(
      f.tx,
      prepareServiceCommerceBookingRevision(command.input, () => "PRIVATE"),
      scope,
    )
    expect(f.jobLines.every((line) => line.status === "COMPLETED")).toBe(true)
    expect(f.orders[0]?.status).toBe("COMPLETED")
  }))

test("unperformed Product obligations, unauthorized work and clinical Order cannot be disguised as a complete Service booking", () =>
  withClock(async () => {
    const f = fixture()
    const id = await confirmed(f)
    Object.assign(f.bookings[0] ?? {}, {
      status: "IN_SERVICE",
      commercialOrderId: "order-1",
      serviceJobId: "job-1",
    })
    f.jobs.push({
      id: "job-1",
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      commercialOrderId: "order-1",
      revision: 0,
    })
    f.jobLines.push({
      id: "line",
      serviceJobId: "job-1",
      revision: 0,
      status: "IN_PROGRESS",
      authorizationStatus: "AUTHORIZED",
      allocatedQuantity: "1",
      reworkOfLineId: null,
      completedAt: null,
    })
    f.orderLines.push({
      id: "unperformed-product",
      orderId: "order-1",
      order: { tenantId: scope.tenantId, storeId: scope.storeId },
      kind: "PRODUCT_UNIT",
      quantity: "1",
      productFulfillments: [],
      snapshot: null,
      serviceAuthorization: null,
      serviceFulfillment: null,
      serviceJobLines: [],
    })
    const command = revisionInput(id, "complete")
    const result = await review(f.readsOnly, command)
    if (!("work" in result.review.details)) throw Error("Expected work review")
    expect(result.review.details.work?.wouldCompleteOrder).toBe(false)
    Object.assign(f.jobLines[0] ?? {}, { authorizationStatus: "PENDING" })
    await expect(review(f.readsOnly, command)).rejects.toThrow("authorized")
    Object.assign(f.jobLines[0] ?? {}, { authorizationStatus: "AUTHORIZED" })
    Object.assign(f.orders[0] ?? {}, {
      prescriptionPickupFulfillment: { id: "clinical" },
    })
    await expect(review(f.readsOnly, command)).rejects.toThrow("nonclinical")
  }))

test("cancellation binds exact net payment and refund consequence without refund or notification delivery", () =>
  withClock(async () => {
    const f = fixture()
    const id = await confirmed(f)
    Object.assign(f.bookings[0] ?? {}, {
      commercialOrderId: "order-1",
      requiredPaymentMinorSnapshot: 5000,
      refundPolicySnapshot: "FULL_BEFORE_CUTOFF",
      cancellationWindowSnapshot: 30,
    })
    f.payments.push(
      { orderId: "order-1", ...scope, type: "PAYMENT", amountMinor: 6000 },
      { orderId: "order-1", ...scope, type: "REFUND", amountMinor: 2000 },
    )
    const command = revisionInput(id, "cancel")
    const result = await review(f.readsOnly, command)
    if (!("cancellation" in result.review.details))
      throw Error("Expected cancellation")
    expect(result.review.details.cancellation?.netPaidMinor).toBe(4000)
    expect(
      result.review.details.cancellation?.consequence.refundAmountMinor,
    ).toBe(4000)
    expect(result.review.details.cancellation?.refundExecuted).toBe(false)
    Object.assign(f.payments[0] ?? {}, { amountMinor: 5000 })
    expect((await review(f.readsOnly, command)).target.revision).not.toBe(
      result.target.revision,
    )
    Object.assign(f.bookings[0] ?? {}, {
      customerContactCiphertext: "DIFFERENT_PRIVATE_RECIPIENT",
    })
    const changed = await review(f.readsOnly, command)
    expect(changed.target.revision).not.toBe(result.target.revision)
    expect(JSON.stringify(changed)).not.toContain("DIFFERENT_PRIVATE_RECIPIENT")
  }))

test("exact reservation identity is private review binding and never added to staff availability", () =>
  withClock(async () => {
    const f = fixture()
    const command = { kind: "hold" as const, input: holdInput() }
    f.state.resource.capacity = 2
    f.holds.push({
      id: "PRIVATE_RESERVATION_A",
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      resourceId: "resource-1",
      startAt: command.input.slotStartAt,
      endAt: command.input.slotEndAt,
      expiresAt: new Date(now + 3600_000),
      capacity: 1,
      status: "HELD",
    })
    const first = await review(f.readsOnly, command)
    expect(JSON.stringify(first.review)).toContain("PRIVATE_RESERVATION_A")
    Object.assign(f.holds[0] ?? {}, { id: "PRIVATE_RESERVATION_B" })
    expect((await review(f.readsOnly, command)).target.revision).not.toBe(
      first.target.revision,
    )
    const available =
      await readStaffServiceCommerceBookingAvailabilityInTransaction(
        f.readsOnly,
        {
          ...scope,
          source: command.input.source,
          offeringId: "offering-1",
          resourceId: "resource-1",
          from: command.input.slotStartAt,
          to: command.input.slotEndAt,
          quantity: 1,
        },
      )
    expect(available.slots).toHaveLength(1)
    expect(JSON.stringify(available)).not.toContain("PRIVATE_RESERVATION")
    expect(JSON.stringify(available)).not.toContain("reservationFacts")
  }))

test("native nonreschedule optional slot fields stay ignored in review effects exactly as the actual writer", () =>
  withClock(async () => {
    const f = fixture()
    const id = await confirmed(f)
    const command = revisionInput(id, "cancel")
    if (command.kind !== "revise") throw Error("Expected revision")
    const input = {
      ...command.input,
      resourceId: "IGNORED_FOREIGN_RESOURCE",
      newSlotStartAt: new Date(now + 9 * 3600_000),
      newSlotEndAt: new Date(now + 10 * 3600_000),
    }
    const result = await review(f.readsOnly, { kind: "revise", input })
    const effects = result.review.details.effects
    if (!("resourceId" in effects) || !("startAt" in effects))
      throw Error("Expected slot effects")
    expect(effects.resourceId).toBe("resource-1")
    expect(effects.startAt).toEqual(holdInput().slotStartAt)
    const actual = await revisePreparedServiceCommerceBookingInTransaction(
      f.tx,
      prepareServiceCommerceBookingRevision(input, () => "PRIVATE"),
      scope,
    )
    if (actual.receipt.kind !== "booking_event")
      throw Error("Expected event receipt")
    if (typeof effects.resourceId !== "string")
      throw Error("Expected exact current resource identity")
    expect(actual.receipt.resourceId).toBe(effects.resourceId)
    expect(actual.receipt.startAt).toBe(holdInput().slotStartAt.toISOString())
  }))

test("unordered capacity evidence and policy returns do not manufacture stale review while source/runtime scope stays bound", () =>
  withClock(async () => {
    const f = fixture()
    f.state.resource.capacity = 3
    const command = { kind: "hold" as const, input: holdInput() }
    for (const id of ["reservation-b", "reservation-a"])
      f.holds.push({
        id,
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        resourceId: "resource-1",
        startAt: command.input.slotStartAt,
        endAt: command.input.slotEndAt,
        expiresAt: new Date(now + 3600_000),
        capacity: 1,
        status: "HELD",
      })
    const first = await review(f.readsOnly, command)
    f.holds.reverse()
    f.state.policies.reverse()
    expect((await review(f.readsOnly, command)).target).toEqual(first.target)
    Object.assign(f.state.profile, { revision: 1 })
    expect((await review(f.readsOnly, command)).target.revision).not.toBe(
      first.target.revision,
    )
    f.state.member.serviceCommerceStoreTeamAssignments.splice(0)
    await expect(review(f.readsOnly, command)).rejects.toThrow()
  }))
function holdInput() {
  return {
    ...scope,
    clientOperationId: "hold-review",
    expectedConfigurationRevision: 0,
    offeringId: "offering-1",
    resourceId: "resource-1",
    quantity: 1,
    slotStartAt: new Date(now + 2 * 3600_000),
    slotEndAt: new Date(now + 2.5 * 3600_000),
    source: { kind: "service" as const, id: "request-1" },
  }
}
function fixture() {
  const f = bookingCommandFixture()
  Object.assign(f.state.profile, { revision: 0 })
  const quoteVersions: Array<Record<string, unknown>> = []
  for (const row of f.orders)
    Object.assign(row, {
      prescriptionPickupFulfillment: null,
      prescriptionDeliveryAddress: null,
      _count: { prescriptionPaymentIntents: 0 },
    })
  const readsOnly = new Proxy(f.tx, {
    get(target, table: string) {
      if (table.startsWith("$")) throw Error(`No locks/root TX ${table}`)
      if (table === "commerceQuoteVersion")
        return {
          findFirst: async (args: unknown) =>
            quoteVersions.find((row) =>
              matches(row, field(args, "where") ?? {}),
            ) ?? null,
        }
      const delegate = Reflect.get(target, table)
      return new Proxy(delegate, {
        get(_target, method: string) {
          if (
            ![
              "findFirst",
              "findFirstOrThrow",
              "findUnique",
              "findMany",
              "groupBy",
              "count",
            ].includes(method)
          )
            throw Error(`No write ${table}.${method}`)
          return Reflect.get(delegate, method)
        },
      })
    },
  })
  return { ...f, readsOnly, quoteVersions }
}
type Fixture = ReturnType<typeof fixture>
async function withClock(
  run: (setNow: (value: number) => void) => Promise<void>,
) {
  const clock = spyOn(Date, "now").mockReturnValue(now)
  try {
    await run((value) => {
      clock.mockReturnValue(value)
    })
  } finally {
    clock.mockRestore()
  }
}
async function held(f: Fixture) {
  const input = holdInput()
  const native = await createPreparedServiceCommerceBookingHoldInTransaction(
    f.tx,
    prepareServiceCommerceBookingHold(input, () => "PRIVATE_TOKEN"),
    scope,
  )
  return {
    ...scope,
    clientOperationId: "confirm-review",
    source: input.source,
    holdId: native.receipt.holdId,
  }
}
async function confirmed(f: Fixture) {
  const input = await held(f)
  const inspection =
    await inspectServiceCommerceBookingConfirmationInTransaction(f.tx, input)
  const native = await confirmPreparedServiceCommerceBookingInTransaction(
    f.tx,
    prepareServiceCommerceBookingConfirmation(inspection, {
      issueCapabilityToken: () => "PRIVATE_TOKEN",
      protectRecipient: () => "PRIVATE_CIPHER",
    }),
    scope,
  )
  if (native.receipt.kind !== "booking_event")
    throw Error("Expected booking event")
  return native.receipt.bookingId
}
function revisionInput(
  bookingId: string,
  operation:
    | "arrive"
    | "start"
    | "complete"
    | "cancel"
    | "mark_no_show"
    | "reschedule",
): StaffServiceCommerceBookingReviewInput {
  return {
    kind: "revise",
    input: {
      ...scope,
      bookingId,
      clientOperationId: `review-${operation}`,
      expectedRevision: 0,
      operation,
      ...(["cancel", "mark_no_show", "reschedule"].includes(operation)
        ? { reasonCode: "CUSTOMER_REQUEST" }
        : {}),
      ...(operation === "reschedule"
        ? {
            resourceId: "resource-1",
            newSlotStartAt: new Date(now + 3 * 3600_000),
            newSlotEndAt: new Date(now + 3.5 * 3600_000),
          }
        : {}),
    },
  }
}
test("pure actual hold review preserves10k and exact191 target, no token/callback/lock/audit/write", () =>
  withClock(async () => {
    const f = fixture()
    f.state.resource.capacity = 10_000
    const input = holdInput()
    input.quantity = 10_000
    const id = "原生:?=".padEnd(191, "n")
    f.state.source.id = id
    input.source.id = id
    const result = await review(f.readsOnly, { kind: "hold", input })
    expect(result.target.id).toBe(id)
    expect(result.target.revision).toMatch(/^[a-f0-9]{64}$/)
    const text = JSON.stringify(result)
    expect(text).toContain('"quantity":10000')
    for (const secret of [
      "PRIVATE",
      "customerPhone",
      "customerEmail",
      "customerName",
      "tokenDigest",
      "recipientCiphertext",
    ])
      expect(text).not.toContain(secret)
    expect(f.writes).toEqual([])
    expect(f.locks).toEqual([])
    expect(f.denied).toEqual([])
  }))
test("actual confirmation review binds exact active hold and optional accepted Order/Job graph without exposing contacts", () =>
  withClock(async () => {
    const f = fixture()
    const input = await held(f)
    f.jobs.push({
      id: "job-1",
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      commercialOrderId: "order-1",
      revision: 3,
    })
    const before = f.writes.length
    const result = await review(f.readsOnly, {
      kind: "confirm",
      input: { ...input, commercialOrderId: "order-1", serviceJobId: "job-1" },
    })
    expect(result.target.id).toBe(input.holdId)
    expect(JSON.stringify(result.review)).toContain(
      '"job":{"id":"job-1","commercialOrderId":"order-1","revision":3}',
    )
    expect(f.writes).toHaveLength(before)
    for (const secret of ["PRIVATE", "customerPhone", "recipientCiphertext"])
      expect(JSON.stringify(result)).not.toContain(secret)
    await expect(
      review(f.readsOnly, {
        kind: "confirm",
        input: { ...input, holdId: "foreign" },
      }),
    ).rejects.toThrow()
    await expect(
      review(f.readsOnly, {
        kind: "confirm",
        input: { ...input, serviceJobId: "job-1" },
      }),
    ).rejects.toThrow()
  }))
test("all six canonical lifecycle reviews return exact before/after and distinct cancellation/notification truth", () =>
  withClock(async () => {
    for (const operation of [
      "arrive",
      "start",
      "complete",
      "cancel",
      "mark_no_show",
      "reschedule",
    ] as const) {
      const f = fixture()
      const id = await confirmed(f)
      if (operation === "start")
        Object.assign(f.bookings[0] ?? {}, { status: "ARRIVED" })
      if (operation === "complete")
        Object.assign(f.bookings[0] ?? {}, { status: "IN_SERVICE" })
      const writes = f.writes.length
      const locks = f.locks.length
      const result = await review(f.readsOnly, revisionInput(id, operation))
      expect(result.target.id).toBe(id)
      expect(JSON.stringify(result.review)).toContain(`"kind":"${operation}"`)
      expect(f.writes).toHaveLength(writes)
      expect(f.locks).toHaveLength(locks)
      if (operation === "cancel")
        expect(JSON.stringify(result.review)).toContain(
          '"refundExecuted":false',
        )
      expect(JSON.stringify(result.review)).not.toContain("PRIVATE_CIPHER")
    }
  }))
test("source/access/policy/config/capacity drift changes target while clock alone keeps ordinary hold digest", () =>
  withClock(async (setNow) => {
    const f = fixture()
    const command = { kind: "hold" as const, input: holdInput() }
    const initial = await review(f.readsOnly, command)
    setNow(now + 1000)
    expect((await review(f.readsOnly, command)).target).toEqual(initial.target)
    setNow(now)
    f.state.source.revision++
    const changed = await review(f.readsOnly, command)
    expect(changed.target.revision).not.toBe(initial.target.revision)
    f.state.member.staffAccessRevision++
    expect((await review(f.readsOnly, command)).target.revision).not.toBe(
      changed.target.revision,
    )
    f.state.resource.capacity++
    expect((await review(f.readsOnly, command)).target.revision).not.toBe(
      changed.target.revision,
    )
    f.state.config.revision++
    await expect(review(f.readsOnly, command)).rejects.toThrow()
  }))
test("refuses inactive/revoked/wrong Store/expired hold/clinical Order and invalid operations before effects", () =>
  withClock(async () => {
    const f = fixture()
    const command = { kind: "hold" as const, input: holdInput() }
    f.state.member.status = "INACTIVE"
    await expect(review(f.readsOnly, command)).rejects.toThrow()
    f.state.member.status = "ACTIVE"
    await expect(
      review(f.readsOnly, {
        ...command,
        input: { ...command.input, storeId: "foreign" },
      }),
    ).rejects.toThrow()
    const input = await held(f)
    Object.assign(f.holds[0] ?? {}, { expiresAt: new Date(now) })
    await expect(
      review(f.readsOnly, { kind: "confirm", input }),
    ).rejects.toThrow()
    expect(f.locks.length).toBe(1)
  }))
