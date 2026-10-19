import type {
  BookingConfirmationData,
  BookingContactBasis,
} from "./booking-command-types"
import type { BookingTransaction } from "./shared"
import { ServiceCommerceBookingError, bookingSourceType } from "./shared"

/** Private exact contact evidence. Never a client/model DTO or a capability. */
export async function readBookingContactBasisInTransaction(
  tx: BookingTransaction,
  input: BookingConfirmationData,
): Promise<BookingContactBasis> {
  bookingSourceType(input.source)
  const source = await tx.serviceRequest.findFirst({
    where: {
      id: input.source.id,
      tenantId: input.tenantId,
      storeId: input.storeId,
    },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      revision: true,
      contactOptIn: true,
      customerPhone: true,
      channelOrigin: true,
      customerName: true,
    },
  })
  if (
    !source ||
    source.id !== input.source.id ||
    source.tenantId !== input.tenantId ||
    source.storeId !== input.storeId ||
    !Number.isSafeInteger(source.revision) ||
    source.revision < 1
  )
    throw new ServiceCommerceBookingError(
      "BOOKING_REVISION_CONFLICT",
      "The exact booking source contact is unavailable.",
    )
  return {
    sourceId: source.id,
    tenantId: source.tenantId,
    storeId: source.storeId,
    revision: source.revision,
    contactOptIn: source.contactOptIn,
    phone: source.customerPhone,
    channelOrigin: source.channelOrigin,
    customerName: source.customerName,
  }
}
export async function assertBookingContactBasisInTransaction(
  tx: BookingTransaction,
  input: BookingConfirmationData,
  expected: BookingContactBasis,
) {
  const current = await readBookingContactBasisInTransaction(tx, input)
  if (JSON.stringify(current) !== JSON.stringify(expected))
    throw new ServiceCommerceBookingError(
      "BOOKING_REVISION_CONFLICT",
      "Booking source contact or consent changed. Review it again.",
    )
}
