import {
  type GeneralBookingAction,
  generalBookingActionSchema,
} from "@ewatrade/assistant/general/booking-action"
import {
  confirmPreparedServiceCommerceBookingInTransaction,
  createPreparedServiceCommerceBookingHoldInTransaction,
  inspectServiceCommerceBookingConfirmationInTransaction,
  prepareServiceCommerceBookingConfirmation,
  prepareServiceCommerceBookingHold,
} from "@ewatrade/db/service-booking-commands"
import {
  field,
  matches,
} from "../../../../packages/db/src/queries/test-helpers/booking-availability"
import { generalBookingDraftFixture } from "../../../../packages/db/src/queries/test-helpers/general-booking-draft"
import { generalBookingNativeInput } from "./general-booking-input"

export const bookingProjectionNow = Date.parse("2031-02-03T08:00:00.000Z")
export const bookingProjectionIds = {
  proposalId: "projection-draft",
  idempotencyKey: "projection-command",
}
export const bookingProjectionKey =
  "INERT_PROJECTION_SIGNING_KEY_NOT_A_CREDENTIAL_1234"
export function bookingReviewProjectionFixture() {
  const f = generalBookingDraftFixture()
  // Fill required selected persisted fields absent from older minimal fixtures.
  // Actual canonical functions and predicates remain unchanged/unmocked.
  Object.assign(f.canonical.state.config, {
    capacity: 1,
    createdAt: new Date(bookingProjectionNow - 86_400_000),
    updatedAt: new Date(bookingProjectionNow - 3600_000),
    resources: [
      {
        resourceId: f.canonical.state.resource.id,
        capacityRequired: 1,
        resource: f.canonical.state.resource,
      },
    ],
  })
  Object.assign(f.canonical.state.resource, { kind: "ROOM" })
  Object.assign(f.canonical.state.settings, { defaultHoldMinutes: 10 })
  for (const order of f.canonical.orders)
    Object.assign(order, { paymentStatus: "PENDING" })
  const quoteVersions: Array<Record<string, unknown>> = []
  const quoteReads: unknown[] = []
  const tx = new Proxy(f.tx, {
    get(target, table: string) {
      if (table === "commerceQuoteVersion")
        return {
          findFirst: async (args: unknown) => {
            quoteReads.push(args)
            return structuredClone(
              quoteVersions.find((row) =>
                matches(row, field(args, "where") ?? {}),
              ) ?? null,
            )
          },
        }
      return Reflect.get(target, table)
    },
  })
  return { ...f, tx, quoteVersions, quoteReads }
}
type Fixture = ReturnType<typeof bookingReviewProjectionFixture>
export const projectionHold = () =>
  generalBookingActionSchema.parse({
    action: "service_booking_hold",
    source: { kind: "service", id: "request-1" },
    offeringId: "offering-1",
    resourceId: "resource-1",
    quantity: 1,
    expectedConfigurationRevision: 0,
    slotStartAt: new Date(bookingProjectionNow + 7200_000).toISOString(),
    slotEndAt: new Date(bookingProjectionNow + 9000_000).toISOString(),
  })
/** Seed only with actual native commands; synthetic writes are not SQL proof. */
export async function projectionAction(
  f: Fixture,
  action: GeneralBookingAction["action"],
) {
  const scope = {
    actorUserId: f.scope.actorUserId,
    tenantId: f.scope.tenantId,
    storeId: f.scope.storeId,
  }
  if (action === "service_booking_hold") return projectionHold()
  const holdInput = generalBookingNativeInput(
    projectionHold(),
    scope,
    "seed-projection-hold",
  )
  if (holdInput.kind !== "hold") throw Error("Expected hold input")
  const held = await createPreparedServiceCommerceBookingHoldInTransaction(
    f.canonical.tx,
    prepareServiceCommerceBookingHold(
      holdInput.input,
      () => "PRIVATE_PROJECTION_TOKEN",
    ),
    scope,
  )
  if (action === "service_booking_confirm")
    return generalBookingActionSchema.parse({
      action,
      source: { kind: "service", id: "request-1" },
      holdId: held.receipt.holdId,
    })
  const input = generalBookingNativeInput(
    generalBookingActionSchema.parse({
      action: "service_booking_confirm",
      source: { kind: "service", id: "request-1" },
      holdId: held.receipt.holdId,
    }),
    scope,
    "seed-projection-confirm",
  )
  if (input.kind !== "confirm") throw Error("Expected confirmation input")
  const inspected =
    await inspectServiceCommerceBookingConfirmationInTransaction(
      f.canonical.tx,
      input.input,
    )
  const confirmed = await confirmPreparedServiceCommerceBookingInTransaction(
    f.canonical.tx,
    prepareServiceCommerceBookingConfirmation(inspected, {
      issueCapabilityToken: () => "PRIVATE_PROJECTION_TOKEN",
      protectRecipient: () => "PRIVATE_PROJECTION_CIPHERTEXT",
    }),
    scope,
  )
  if (confirmed.receipt.kind !== "booking_event") throw Error("Expected event")
  // Prisma persists omitted nullable columns as null. The inert native writer
  // stores only its explicit data, so materialize those actual DB defaults here.
  Object.assign(f.canonical.bookings[0] ?? {}, {
    arrivedAt: null,
    serviceStartedAt: null,
    completedAt: null,
    cancelledAt: null,
    noShowAt: null,
    quoteVersionId: null,
    commercialOrderId: null,
    serviceJobId: null,
  })
  if (action === "service_booking_start")
    Object.assign(f.canonical.bookings[0] ?? {}, { status: "ARRIVED" })
  if (action === "service_booking_complete")
    Object.assign(f.canonical.bookings[0] ?? {}, { status: "IN_SERVICE" })
  return generalBookingActionSchema.parse({
    action,
    bookingId: confirmed.receipt.bookingId,
    expectedRevision: 0,
    ...([
      "service_booking_cancel",
      "service_booking_no_show",
      "service_booking_reschedule",
    ].includes(action)
      ? { reasonCode: "  CUSTOMER_REQUEST  " }
      : {}),
    ...(action === "service_booking_reschedule"
      ? {
          resourceId: "resource-1",
          newSlotStartAt: new Date(
            bookingProjectionNow + 10800_000,
          ).toISOString(),
          newSlotEndAt: new Date(
            bookingProjectionNow + 12600_000,
          ).toISOString(),
        }
      : {}),
  })
}
export function projectionWork(
  f: Fixture,
  count: number,
  status: "QUEUED" | "IN_PROGRESS" = "IN_PROGRESS",
) {
  Object.assign(f.canonical.bookings[0] ?? {}, {
    commercialOrderId: "order-1",
    serviceJobId: "job-1",
  })
  f.canonical.jobs.push({
    id: "job-1",
    tenantId: f.scope.tenantId,
    storeId: f.scope.storeId,
    commercialOrderId: "order-1",
    revision: 4,
  })
  for (let index = 0; index < count; index++)
    f.canonical.jobLines.push({
      id: `projection-line-${index}`,
      serviceJobId: "job-1",
      revision: index,
      status,
      authorizationStatus: "AUTHORIZED",
      allocatedQuantity: "0.000001",
      reworkOfLineId: null,
      completedAt: null,
      serviceJob: {
        commercialOrderId: "order-1",
        tenantId: f.scope.tenantId,
        storeId: f.scope.storeId,
      },
    })
  f.canonical.orderLines.push({
    id: "original-service-line",
    orderId: "order-1",
    order: { tenantId: f.scope.tenantId, storeId: f.scope.storeId },
    kind: "SERVICE",
    quantity: count === 2001 ? "0.002001" : "0.000001",
    productFulfillments: [],
    snapshot: {
      serviceAuthorizationPolicy: "ON_ORDER_CONFIRMATION",
      serviceWorkPolicy: "TRACKED",
    },
    serviceAuthorization: null,
    serviceFulfillment: null,
    serviceJobLines: f.canonical.jobLines,
  })
}
