import type { StaffServiceCommerceBookingCommandReview } from "@ewatrade/db/service-booking-command-review"

type Details = StaffServiceCommerceBookingCommandReview["review"]["details"]
type Work = NonNullable<Extract<Details, { work: unknown }>["work"]>
export function bookingReviewDate(value: unknown): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw Error("Unsupported booking review date")
  return value.toISOString()
}
export function bookingReviewOptionalDate(value: Date | null): string | null {
  return value === null ? null : bookingReviewDate(value)
}
/** Copy exact canonical work and whole-Order facts. No completion arithmetic,
 * scope/authorship rows, first-N bounds, quantity normalization or Number(). */
export function bookingReviewWork(work: Work | null) {
  if (work === null) return null
  return {
    jobId: work.jobId,
    jobRevision: work.jobRevision,
    lines: work.lines.map((row) => ({
      id: row.id,
      revision: row.revision,
      status: row.status,
      authorizationStatus: row.authorizationStatus,
      allocatedQuantity: row.allocatedQuantity,
      reworkOfLineId: row.reworkOfLineId,
      completedAt: bookingReviewOptionalDate(row.completedAt),
    })),
    changes: work.changes.map((row) => ({
      id: row.id,
      revision: row.revision,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      completedAt: row.completedAt,
    })),
    jobRevisionIncrement: work.jobRevisionIncrement,
    jobCompletedAt: work.jobCompletedAt,
    obligations:
      work.obligations === null
        ? null
        : work.obligations.map((row) => ({
            id: row.id,
            kind: row.kind,
            quantity: row.quantity,
            productFulfillments: row.productFulfillments.map((fact) => ({
              createdAt: bookingReviewDate(fact.createdAt),
              quantity: fact.quantity,
            })),
            snapshot:
              row.snapshot === null
                ? null
                : {
                    serviceAuthorizationPolicy:
                      row.snapshot.serviceAuthorizationPolicy,
                    serviceWorkPolicy: row.snapshot.serviceWorkPolicy,
                  },
            serviceAuthorization:
              row.serviceAuthorization === null
                ? null
                : {
                    authorizedAt: bookingReviewDate(
                      row.serviceAuthorization.authorizedAt,
                    ),
                    quantity: row.serviceAuthorization.quantity,
                  },
            serviceFulfillment:
              row.serviceFulfillment === null
                ? null
                : {
                    performedAt: bookingReviewDate(
                      row.serviceFulfillment.performedAt,
                    ),
                    quantity: row.serviceFulfillment.quantity,
                  },
            serviceJobLines: row.serviceJobLines.map((fact) => ({
              id: fact.id,
              allocatedQuantity: fact.allocatedQuantity,
              authorizationStatus: fact.authorizationStatus,
              status: fact.status,
              completedAt: bookingReviewOptionalDate(fact.completedAt),
              reworkOfLineId: fact.reworkOfLineId,
            })),
          })),
    wouldCompleteOrder: work.wouldCompleteOrder,
  }
}
