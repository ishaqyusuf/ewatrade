import { afterAll, expect, spyOn, test } from "bun:test"
import {
  type GeneralBookingAction,
  generalBookingActionSchema,
} from "@ewatrade/assistant/general/booking-action"
import { Prisma } from "@ewatrade/db/browser"
import { generalBookingReviewSchema } from "../../../../packages/assistant/src/general/booking-review"
import { field } from "../../../../packages/db/src/queries/test-helpers/booking-availability"
import {
  createGeneralBookingDraftInTransaction as create,
  readGeneralBookingDraftInTransaction as privateRead,
} from "./general-booking-draft-store"
import { readGeneralBookingAppReviewInTransaction as read } from "./general-booking-review-projection"
import {
  bookingReviewProjectionFixture as fixture,
  bookingProjectionIds as ids,
  bookingProjectionKey as key,
  bookingProjectionNow as now,
  projectionAction,
  projectionHold,
  projectionWork,
} from "./general-booking-review-projection-fixture"

const network = spyOn(globalThis, "fetch").mockRejectedValue(
  Error("No network/provider in booking projection tests"),
)
afterAll(() => network.mockRestore())
async function clocked(run: () => Promise<void>) {
  const clock = spyOn(Date, "now").mockReturnValue(now)
  try {
    await run()
  } finally {
    clock.mockRestore()
  }
}
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
const request = (f: ReturnType<typeof fixture>) => ({
  ...f.scope,
  draftRef: ids.proposalId,
})

test("actual accepted Quote/Order/Job optional links and native deposit snapshot retain exact operational facts only", () =>
  clocked(async () => {
    const f = fixture()
    Object.assign(f.canonical.state.config, {
      paymentRequirement: "DEPOSIT",
      depositAmountMinor: 1500,
      paymentPolicyRevision: 7,
    })
    const initial = await projectionAction(f, "service_booking_confirm")
    const payload = generalBookingActionSchema.parse({
      ...initial,
      quoteVersionId: "quote-version",
      commercialOrderId: "order-1",
      serviceJobId: "job-1",
    })
    const expiry = new Date(now + 86_400_001)
    f.quoteVersions.push({
      id: "quote-version",
      quoteId: "quote",
      version: 3,
      status: "ACCEPTED",
      currencyCode: "NGN",
      totalMinor: 5000,
      expiresAt: expiry,
      acceptedOrderId: "order-1",
      quote: {
        id: "quote",
        sourceId: "request-1",
        sourceType: "SERVICE_REQUEST",
        tenantId: f.scope.tenantId,
        storeId: f.scope.storeId,
        currentVersionId: "quote-version",
      },
    })
    Object.assign(f.canonical.orders[0] ?? {}, {
      acceptedCommerceQuoteVersion: {
        id: "quote-version",
        quote: { sourceType: "SERVICE_REQUEST" },
      },
    })
    f.canonical.jobs.push({
      id: "job-1",
      commercialOrderId: "order-1",
      tenantId: f.scope.tenantId,
      storeId: f.scope.storeId,
      revision: 5,
    })
    await create(f.tx, { ...f.scope, payload }, ids, key)
    const writes = f.canonical.writes.length
    const result = await read(f.tx, request(f), key)
    if (
      result.kind !== "complete" ||
      result.review.action !== "service_booking_confirm"
    )
      throw Error("Expected confirm")
    expect(result.review.details.payment).toEqual({
      currencyCode: "NGN",
      depositAmountMinor: 1500,
      payableAmountMinor: 5000,
      requiredPaymentMinor: 1500,
      paymentStatus: "PENDING",
    })
    expect(result.review.details.quoteVersion).toEqual({
      id: "quote-version",
      quoteId: "quote",
      version: 3,
      status: "ACCEPTED",
      currencyCode: "NGN",
      totalMinor: 5000,
      expiresAt: expiry.toISOString(),
      acceptedOrderId: "order-1",
    })
    expect(result.review.details.job).toEqual({
      id: "job-1",
      commercialOrderId: "order-1",
      revision: 5,
    })
    expect(result.review.details.order?.acceptedQuoteVersionId).toBe(
      "quote-version",
    )
    expect(result.review.details.effects.paymentCollected).toBe(false)
    expect(result.observations.observedHoldExpiresAt).toBeNull()
    expect(result.review.details.before.expiresAt).toBe(
      new Date(now + 600_000).toISOString(),
    )
    expect(f.canonical.writes).toHaveLength(writes)
  }))

test("actual signed saved-draft + canonical review exposes all8 exact allowlisted operations with zero effects", () =>
  clocked(async () => {
    for (const name of actions) {
      const f = fixture()
      const payload = await projectionAction(f, name)
      if (name === "service_booking_start") projectionWork(f, 1, "QUEUED")
      await create(f.tx, { ...f.scope, payload }, ids, key)
      const writes = f.canonical.writes.length
      const proposalWrites = f.writes.length
      const result = await read(f.tx, request(f), key)
      expect(result.kind).toBe("complete")
      if (result.kind !== "complete")
        throw Error(`Expected ${name} complete projection`)
      expect(result.review.action).toBe(name)
      expect(result.review.draft.ref).toBe(ids.proposalId)
      expect(result.review.coverage.complete).toBe(true)
      expect(
        generalBookingReviewSchema.parse(
          JSON.parse(JSON.stringify(result.review)),
        ),
      ).toEqual(result.review)
      expect(result.observations.asOf).toBe(new Date(now).toISOString())
      const parent = await privateRead(f.tx, request(f), key)
      expect(result.privateBinding.canonicalTarget).toEqual(
        parent.review.target,
      )
      expect(result.privateBinding.row.payloadHash).toBe(f.row().payloadHash)
      expect(result.privateBinding.row.approvalTokenHash).toBe(
        f.row().approvalTokenHash,
      )
      const wire = JSON.stringify({
        review: result.review,
        observations: result.observations,
      })
      for (const hidden of [
        f.scope.actorUserId,
        f.scope.tenantId,
        f.scope.storeId,
        "PRIVATE_PHONE",
        "PRIVATE_EMAIL",
        "PRIVATE_NAME",
        "PRIVATE_PROJECTION_TOKEN",
        "PRIVATE_PROJECTION_CIPHERTEXT",
        "authority",
        "contactBasisDigest",
        "recipientDigest",
        "recipientCiphertext",
        "authorizationUserId",
        "membershipId",
        "commandHash",
        "payloadHash",
        "approvalTokenHash",
        "targetRevision",
        "reservationFacts",
        "reservations",
        "capabilityToken",
      ])
        expect(wire).not.toContain(hidden)
      if ("work" in result.review.details && name === "service_booking_start") {
        expect(result.review.details.work?.lines).toHaveLength(1)
        expect(result.review.details.work?.changes[0]?.toStatus).toBe(
          "IN_PROGRESS",
        )
      }
      expect(f.canonical.writes).toHaveLength(writes)
      expect(f.writes).toHaveLength(proposalWrites)
    }
  }))

test("full2001 exact work changes and mixed whole-Order nested obligations survive JSON without recalculation or clipping", () =>
  clocked(async () => {
    const f = fixture()
    const payload = await projectionAction(f, "service_booking_complete")
    projectionWork(f, 2001)
    f.canonical.orderLines.push(
      {
        id: "unperformed-product",
        orderId: "order-1",
        order: { tenantId: f.scope.tenantId, storeId: f.scope.storeId },
        kind: "PRODUCT_UNIT",
        quantity: "9007199254740993.000001",
        productFulfillments: [],
        snapshot: null,
        serviceAuthorization: null,
        serviceFulfillment: null,
        serviceJobLines: [],
      },
      {
        id: "performed-service",
        orderId: "order-1",
        order: { tenantId: f.scope.tenantId, storeId: f.scope.storeId },
        kind: "SERVICE",
        quantity: "0.000001",
        productFulfillments: [
          { quantity: "0.000001", createdAt: new Date(now - 1) },
        ],
        snapshot: {
          serviceAuthorizationPolicy: "MANUAL_RELEASE",
          serviceWorkPolicy: "CHARGE_ONLY",
        },
        serviceAuthorization: {
          authorizedAt: new Date(now - 2),
          orderId: "order-1",
          orderLineId: "performed-service",
          tenantId: f.scope.tenantId,
          quantity: "0.000001",
        },
        serviceFulfillment: {
          performedAt: new Date(now - 1),
          orderId: "order-1",
          tenantId: f.scope.tenantId,
          quantity: "0.000001",
        },
        serviceJobLines: [],
      },
    )
    await create(f.tx, { ...f.scope, payload }, ids, key)
    const writes = f.canonical.writes.length
    const parent = await privateRead(f.tx, request(f), key)
    const result = await read(f.tx, request(f), key)
    if (
      result.kind !== "complete" ||
      !("work" in result.review.details) ||
      !result.review.details.work
    )
      throw Error("Expected complete canonical work projection")
    const work = result.review.details.work
    expect(work.lines).toHaveLength(2001)
    expect(work.changes).toHaveLength(2001)
    expect(work.obligations).toHaveLength(3)
    expect(
      work.obligations?.find((row) => row.id === "original-service-line")
        ?.serviceJobLines,
    ).toHaveLength(2001)
    expect(
      work.lines.every((row) => row.allocatedQuantity === "0.000001"),
    ).toBe(true)
    expect(
      work.obligations?.find((row) => row.id === "unperformed-product")
        ?.quantity,
    ).toBe("9007199254740993.000001")
    expect(
      work.obligations?.find((row) => row.id === "performed-service")
        ?.serviceAuthorization,
    ).toEqual({
      authorizedAt: new Date(now - 2).toISOString(),
      quantity: "0.000001",
    })
    expect(
      work.obligations?.find((row) => row.id === "performed-service")
        ?.serviceFulfillment,
    ).toEqual({
      performedAt: new Date(now - 1).toISOString(),
      quantity: "0.000001",
    })
    if (
      !("work" in parent.review.review.details) ||
      !parent.review.review.details.work
    )
      throw Error("Expected private work")
    expect(work.wouldCompleteOrder).toBe(
      parent.review.review.details.work.wouldCompleteOrder,
    )
    expect(work.wouldCompleteOrder).toBe(false)
    expect(result.review.coverage).toEqual({
      complete: true,
      workLines: 2001,
      workChanges: 2001,
      obligations: 3,
      obligationWorkLines: 2001,
      productFulfillments: 1,
      pendingReminders: 0,
    })
    expect(
      generalBookingReviewSchema.parse(
        JSON.parse(JSON.stringify(result.review)),
      ),
    ).toEqual(result.review)
    expect(f.canonical.writes).toHaveLength(writes)
    expect(
      f.canonical.jobLines.every((row) => row.status === "IN_PROGRESS"),
    ).toBe(true)
  }))

test("native cancellation/refund and reminder truth is copied, never Finance/payment/provider execution", () =>
  clocked(async () => {
    const f = fixture()
    const payload = await projectionAction(f, "service_booking_cancel")
    const booking = f.canonical.bookings[0]
    if (!booking || typeof booking.id !== "string")
      throw Error("Expected booking")
    Object.assign(booking, {
      commercialOrderId: "order-1",
      refundPolicySnapshot: "FULL_BEFORE_CUTOFF",
      requiredPaymentMinorSnapshot: 1500,
    })
    f.canonical.payments.push(
      {
        orderId: "order-1",
        tenantId: f.scope.tenantId,
        storeId: f.scope.storeId,
        type: "PAYMENT",
        amountMinor: 2000,
      },
      {
        orderId: "order-1",
        tenantId: f.scope.tenantId,
        storeId: f.scope.storeId,
        type: "REFUND",
        amountMinor: 200,
      },
    )
    f.canonical.notifications.push({
      id: "PRIVATE_REMINDER_ID",
      bookingId: booking.id,
      tenantId: f.scope.tenantId,
      storeId: f.scope.storeId,
      status: "PENDING",
      type: "REMINDER",
      scheduledFor: new Date(now + 1000),
      recipientCiphertext: "PRIVATE_REMINDER_CIPHER",
      authorizationUserId: f.scope.actorUserId,
    })
    await create(f.tx, { ...f.scope, payload }, ids, key)
    const result = await read(f.tx, request(f), key)
    if (
      result.kind !== "complete" ||
      !("cancellation" in result.review.details)
    )
      throw Error("Expected cancellation")
    expect(result.review.details.cancellation).toMatchObject({
      netPaidMinor: 1800,
      refundExecuted: false,
      consequence: {
        refundAmountMinor: 1500,
        refundOutcome: "refund_eligible",
      },
    })
    expect(result.review.details.effects.reasonCode).toBe("CUSTOMER_REQUEST")
    expect(result.review.details.effects.pendingReminders).toEqual([
      {
        status: "PENDING",
        type: "REMINDER",
        scheduledFor: new Date(now + 1000).toISOString(),
      },
    ])
    expect(JSON.stringify(result.review)).not.toContain("PRIVATE_REMINDER")
    expect(result.review.details.effects.paymentCollected).toBe(false)
    expect(result.review.details.effects.providerSettlement).toBe("not_checked")
  }))

test("only generated hold-expiry/asOf observations change while exact semantic review and private target remain stable", () =>
  clocked(async () => {
    const f = fixture()
    await create(f.tx, { ...f.scope, payload: projectionHold() }, ids, key)
    const first = await read(f.tx, request(f), key)
    const clock = spyOn(Date, "now").mockReturnValue(now + 1000)
    try {
      const next = await read(f.tx, request(f), key)
      if (first.kind !== "complete" || next.kind !== "complete")
        throw Error("Expected two reviews")
      expect(next.review).toEqual(first.review)
      expect(next.privateBinding).toEqual(first.privateBinding)
      expect(next.observations.asOf).not.toBe(first.observations.asOf)
      expect(next.observations.observedHoldExpiresAt).not.toBe(
        first.observations.observedHoldExpiresAt,
      )
      expect(JSON.stringify(next.review)).not.toContain("observedExpiresAt")
    } finally {
      clock.mockRestore()
    }
  }))

test("current authority, role/source/signed-row drift, expiry and foreign drafts return no partial facts or private errors", () =>
  clocked(async () => {
    for (const mode of [
      "role",
      "source",
      "signature",
      "expired",
      "foreign",
      "unknown-status",
      "incomplete-config",
    ]) {
      const f = fixture()
      const payload =
        mode === "unknown-status"
          ? await projectionAction(f, "service_booking_arrive")
          : projectionHold()
      if (mode === "unknown-status")
        f.canonical.state.source.status = "FUTURE_UNSUPPORTED"
      if (mode === "incomplete-config")
        Reflect.deleteProperty(f.canonical.state.config, "createdAt")
      await create(f.tx, { ...f.scope, payload }, ids, key)
      if (mode === "role") f.canonical.state.member.role = "CUSTOMER"
      if (mode === "source") f.canonical.state.source.revision++
      if (mode === "signature") f.row().approvalTokenHash = "0".repeat(64)
      if (mode === "expired") f.row().expiresAt = new Date(now - 1)
      const result = await read(
        f.tx,
        {
          ...request(f),
          ...(mode === "foreign" ? { conversationId: "foreign" } : {}),
        },
        key,
      )
      expect(result).toEqual({
        kind: "unavailable",
        reason: "complete_review_unavailable",
      })
    }
  }))

test("safe contract rejects unsupported state/extra private fields, partial counts and malformed decimals from an actual review", () =>
  clocked(async () => {
    const f = fixture()
    const payload = await projectionAction(f, "service_booking_complete")
    projectionWork(f, 1)
    await create(f.tx, { ...f.scope, payload }, ids, key)
    const result = await read(f.tx, request(f), key)
    if (result.kind !== "complete") throw Error("Expected review")
    for (const mutate of [
      (copy: unknown) =>
        Reflect.set(Object(copy), "authority", { actor: "PRIVATE" }),
      (copy: unknown) =>
        Reflect.set(Object(copy), "coverage", {
          ...result.review.coverage,
          workLines: 0,
        }),
      (copy: unknown) =>
        Reflect.set(Object(copy), "action", "service_booking_future"),
    ]) {
      const copy: unknown = structuredClone(result.review)
      mutate(copy)
      expect(generalBookingReviewSchema.safeParse(copy).success).toBe(false)
    }
    const bad = structuredClone(result.review)
    if (!("work" in bad.details) || !bad.details.work?.lines[0])
      throw Error("Expected work")
    bad.details.work.lines[0].allocatedQuantity = "1.0000001"
    expect(generalBookingReviewSchema.safeParse(bad).success).toBe(false)
    expect(generalBookingActionSchema.safeParse(payload).success).toBe(true)
  }))

test("unexpected persistence errors propagate unchanged instead of masquerading as complete-review refusal", () =>
  clocked(async () => {
    const f = fixture()
    await create(f.tx, { ...f.scope, payload: projectionHold() }, ids, key)
    const failure = new Error("INERT_UNEXPECTED_STORAGE_FAILURE")
    f.control.onConversation = async () => {
      throw failure
    }
    await expect(read(f.tx, request(f), key)).rejects.toBe(failure)
  }))

test("actual Prisma.Decimal scientific work quantities survive canonical start review verbatim", () =>
  clocked(async () => {
    const f = fixture()
    const payload = await projectionAction(f, "service_booking_start")
    projectionWork(f, 2, "QUEUED")
    const quantities = [
      new Prisma.Decimal("1000000000000000000000"),
      new Prisma.Decimal("10000000000000000000000000000000"),
    ]
    const tx = new Proxy(f.tx, {
      get(target, table: string) {
        if (table !== "serviceJob") return Reflect.get(target, table)
        const delegate = Reflect.get(target, table)
        const find = Reflect.get(delegate, "findFirst")
        if (typeof find !== "function")
          throw Error("Expected native Job reader")
        return {
          findFirst: async (args: unknown) => {
            const row: unknown = await Reflect.apply(find, delegate, [args])
            const lines = field(row, "lines")
            if (!Array.isArray(lines) || lines.length !== quantities.length)
              throw Error("Expected all scoped Job lines")
            for (let index = 0; index < lines.length; index++) {
              const line: unknown = lines[index]
              if (!line || typeof line !== "object")
                throw Error("Expected original line")
              Reflect.set(line, "allocatedQuantity", quantities[index])
            }
            return row
          },
        }
      },
    })
    await create(tx, { ...f.scope, payload }, ids, key)
    const result = await read(tx, request(f), key)
    if (result.kind !== "complete" || !("work" in result.review.details))
      throw Error("Expected exact work")
    expect(
      result.review.details.work?.lines.map((row) => row.allocatedQuantity),
    ).toEqual(quantities.map((value) => value.toString()))
    expect(result.review.details.work?.lines[0]?.allocatedQuantity).toBe(
      "1e+21",
    )
    expect(result.review.details.work?.lines[1]?.allocatedQuantity).toBe(
      "1e+31",
    )
  }))

test("actual COMPLETE review preserves scientific whole-Order Decimals and a final micro-unit deficit", () =>
  clocked(async () => {
    for (const { ordered, complete } of [
      { ordered: "1000000000000000000000", complete: true },
      { ordered: "1000000000000000000000.000001", complete: false },
    ]) {
      const f = fixture()
      const payload = await projectionAction(f, "service_booking_complete")
      projectionWork(f, 1)
      const allocated = new Prisma.Decimal("1000000000000000000000")
      const original = new Prisma.Decimal(ordered)
      const installAllocation = (line: unknown) => {
        if (!line || typeof line !== "object")
          throw Error("Expected exact original work line")
        Reflect.set(line, "allocatedQuantity", allocated)
      }
      // The older inert delegates structuredClone rows. Restore actual returned
      // Prisma Decimal objects at those two read boundaries, retaining their
      // original exact predicates, scopes, relation shapes and all rows.
      const tx = new Proxy(f.tx, {
        get(target, table: string) {
          if (table !== "serviceJob" && table !== "commercialOrderLine")
            return Reflect.get(target, table)
          const delegate = Reflect.get(target, table)
          const method = table === "serviceJob" ? "findFirst" : "findMany"
          const find = Reflect.get(delegate, method)
          if (typeof find !== "function")
            throw Error("Expected canonical scoped reader")
          return {
            [method]: async (args: unknown) => {
              const result: unknown = await Reflect.apply(find, delegate, [
                args,
              ])
              if (table === "serviceJob") {
                const lines = field(result, "lines")
                if (!Array.isArray(lines) || lines.length !== 1)
                  throw Error("Expected complete original Job")
                lines.forEach(installAllocation)
              } else {
                if (!Array.isArray(result) || result.length !== 1)
                  throw Error("Expected complete whole Order")
                const row: unknown = result[0]
                if (!row || typeof row !== "object")
                  throw Error("Expected owning Order obligation")
                Reflect.set(row, "quantity", original)
                const lines = field(row, "serviceJobLines")
                if (!Array.isArray(lines) || lines.length !== 1)
                  throw Error("Expected complete nested original work")
                lines.forEach(installAllocation)
              }
              return result
            },
          }
        },
      })
      await create(tx, { ...f.scope, payload }, ids, key)
      const writes = f.canonical.writes.length
      const parent = await privateRead(tx, request(f), key)
      const result = await read(tx, request(f), key)
      if (
        result.kind !== "complete" ||
        !("work" in result.review.details) ||
        !result.review.details.work ||
        !("work" in parent.review.review.details) ||
        !parent.review.review.details.work
      )
        throw Error("Expected complete exact canonical projection")
      const work = result.review.details.work
      expect(work.wouldCompleteOrder).toBe(complete)
      expect(work.wouldCompleteOrder).toBe(
        parent.review.review.details.work.wouldCompleteOrder,
      )
      expect(work.lines[0]?.allocatedQuantity).toBe("1e+21")
      expect(work.obligations?.[0]?.quantity).toBe(original.toString())
      expect(work.obligations?.[0]?.serviceJobLines[0]?.allocatedQuantity).toBe(
        allocated.toString(),
      )
      expect(work.changes[0]?.toStatus).toBe("COMPLETED")
      expect(
        generalBookingReviewSchema.parse(
          JSON.parse(JSON.stringify(result.review)),
        ),
      ).toEqual(result.review)
      expect(f.canonical.writes).toHaveLength(writes)
      expect(f.canonical.jobLines[0]?.status).toBe("IN_PROGRESS")
    }
  }))

test("canonical recorded net-payment aggregates retain signed safe integers beyond per-payment Int32", () =>
  clocked(async () => {
    for (const amounts of [
      [2_147_483_647, 2_147_483_647, 200],
      [1, 0, 200],
    ]) {
      const f = fixture()
      const payload = await projectionAction(f, "service_booking_cancel")
      Object.assign(f.canonical.bookings[0] ?? {}, {
        commercialOrderId: "order-1",
        refundPolicySnapshot: "FULL_BEFORE_CUTOFF",
        requiredPaymentMinorSnapshot: 1500,
      })
      for (const [index, amountMinor] of amounts.entries())
        f.canonical.payments.push({
          orderId: "order-1",
          tenantId: f.scope.tenantId,
          storeId: f.scope.storeId,
          type: index === 2 ? "REFUND" : "PAYMENT",
          amountMinor,
        })
      await create(f.tx, { ...f.scope, payload }, ids, key)
      const result = await read(f.tx, request(f), key)
      if (
        result.kind !== "complete" ||
        !("cancellation" in result.review.details)
      )
        throw Error("Expected cancellation")
      const expected = amounts[0] === 1 ? -199 : 4_294_967_094
      expect(result.review.details.cancellation?.netPaidMinor).toBe(expected)
      expect(result.review.details.cancellation?.refundExecuted).toBe(false)
    }
  }))

test("expiry crossing only after the actual full read and synchronous projection returns no partial response", () =>
  clocked(async () => {
    const f = fixture()
    await create(f.tx, { ...f.scope, payload: projectionHold() }, ids, key)
    const clock = spyOn(Date, "now").mockReturnValue(now)
    try {
      clock.mockClear()
      const initial = await read(f.tx, request(f), key)
      const calls = clock.mock.calls.length
      expect(initial.kind).toBe("complete")
      expect(calls).toBeGreaterThan(2)
      clock.mockClear()
      let current = 0
      clock.mockImplementation(() =>
        ++current >= calls ? now + 15 * 60_000 + 1 : now,
      )
      expect(await read(f.tx, request(f), key)).toEqual({
        kind: "unavailable",
        reason: "complete_review_unavailable",
      })
      expect(current).toBe(calls)
    } finally {
      clock.mockRestore()
    }
  }))
