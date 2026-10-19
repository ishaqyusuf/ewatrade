import {
  ServiceJobLineStatus,
  WorkAuthorizationStatus,
} from "../../../generated/prisma/enums"
import { ServiceCommerceBookingError } from "./shared"

/** Same full native eligibility and changed-line set, shared by writer and review.
 * No reads, locks, writes, quantities, policy overrides or delivery inference.
 */
export function planServiceCommerceBookingWork<
  T extends {
    status: ServiceJobLineStatus
    authorizationStatus: WorkAuthorizationStatus
  },
>(lines: readonly T[], operation: "start" | "complete") {
  const activeLines = lines.filter(
    (line) => line.status !== ServiceJobLineStatus.CANCELLED,
  )
  if (
    activeLines.some(
      (line) => line.authorizationStatus !== WorkAuthorizationStatus.AUTHORIZED,
    )
  )
    throw new ServiceCommerceBookingError(
      "BOOKING_BLOCKED",
      "Service work must be authorized before the appointment can progress.",
    )
  const eligibleStatuses: Set<ServiceJobLineStatus> =
    operation === "start"
      ? new Set([ServiceJobLineStatus.QUEUED, ServiceJobLineStatus.IN_PROGRESS])
      : new Set([
          ServiceJobLineStatus.IN_PROGRESS,
          ServiceJobLineStatus.READY_FOR_HANDOFF,
          ServiceJobLineStatus.COMPLETED,
        ])
  if (activeLines.some((line) => !eligibleStatuses.has(line.status)))
    throw new ServiceCommerceBookingError(
      "BOOKING_BLOCKED",
      operation === "start"
        ? "Linked Service work is not ready to start."
        : "Linked Service work is not ready to complete.",
    )
  const nextStatus =
    operation === "start"
      ? ServiceJobLineStatus.IN_PROGRESS
      : ServiceJobLineStatus.COMPLETED
  return {
    activeLines,
    changedLines: activeLines.filter((line) => line.status !== nextStatus),
    nextStatus,
  }
}
