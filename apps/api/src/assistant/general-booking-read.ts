import {
  generalBookingReadInput,
  serviceBookingTargetSchema,
} from "@ewatrade/assistant/general/booking-read"
import { generalMoney } from "@ewatrade/assistant/general/contracts"
import { getAssistantServiceBookingInTransaction } from "@ewatrade/db/service-booking-read"
import { assertServiceOperator } from "../trpc/routers/service-permissions"
import type { GeneralContext } from "./general-context"
import { requireGeneralScope } from "./general-context"

export function readGeneralBooking(ctx: GeneralContext, raw: unknown) {
  const input = generalBookingReadInput.parse(raw)
  const scope = requireGeneralScope(ctx)
  assertServiceOperator(ctx.tenantContext.membership.role)
  return ctx.db.$transaction(
    (tx) =>
      getAssistantServiceBookingInTransaction(tx, {
        ...input,
        actorUserId: scope.userId,
        tenantId: scope.tenantId,
        storeId: scope.storeId,
      }),
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}

type Booking = Awaited<
  ReturnType<typeof getAssistantServiceBookingInTransaction>
>

/** Root registers the strict saved target before this is used with onAnswer. */
export function generalBookingAnswer(booking: Booking, storeName: string) {
  return {
    id: `booking_${crypto.randomUUID()}`,
    title: "Saved service booking",
    value: `${booking.startAt} — ${booking.endAt}`,
    scope: storeName.slice(0, 300),
    asOf: new Date().toISOString(),
    detail: `${booking.status} · UTC times; saved timezone ${booking.timezone}. ${booking.resource.label}: ${booking.reservedCapacity} capacity reserved. Stored booking payment ${booking.payment.storedStatus}; required ${generalMoney(booking.payment.requiredMinor, booking.payment.currencyCode)} under its saved policy. Current Order payment facts are separate. Available capacity and provider settlement were not checked. This read changes no booking, payment or public capability.`,
    target: serviceBookingTargetSchema.parse({
      kind: "service_booking",
      bookingId: booking.id,
      sourceId: booking.sourceId,
      offeringId: booking.offeringId,
    }),
  }
}
