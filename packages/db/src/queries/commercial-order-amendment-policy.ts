/** Domain eligibility only; this is neither actor authorization nor a write command. */
export type OrderAmendmentEvidence = {
  status: string
  paymentStatus: string
  amountPaidMinor: number
  storeActive: boolean
  lineCount: number
  inspectedLineCount: number
  snapshotsComplete: boolean
  paymentCount: number
  fulfillmentCount: number
  returnCount: number
  committedReservationCount: number
  ledgerEntryCount: number
  serviceAuthorizationCount: number
  trackedWorkCount: number
  quoteOwned: boolean
  prescriptionOwned: boolean
  bookingCount: number
  intakeOwned: boolean
}
export type OrderAmendmentBlock = {
  code: string
  reason: string
  requiredWorkflow:
    | "reload"
    | "return_refund"
    | "customer_ledger"
    | "service_work"
    | "quote"
    | "prescription"
    | "booking"
    | "store_access"
}
export function assessOrderAmendment(evidence: OrderAmendmentEvidence) {
  const blockers: OrderAmendmentBlock[] = []
  const add = (
    code: string,
    reason: string,
    requiredWorkflow: OrderAmendmentBlock["requiredWorkflow"],
  ) => blockers.push({ code, reason, requiredWorkflow })
  const counts = [
    evidence.lineCount,
    evidence.inspectedLineCount,
    evidence.paymentCount,
    evidence.fulfillmentCount,
    evidence.returnCount,
    evidence.committedReservationCount,
    evidence.ledgerEntryCount,
    evidence.serviceAuthorizationCount,
    evidence.trackedWorkCount,
    evidence.bookingCount,
  ]
  if (
    counts.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    !Number.isSafeInteger(evidence.amountPaidMinor) ||
    evidence.amountPaidMinor < 0 ||
    evidence.lineCount === 0 ||
    evidence.lineCount !== evidence.inspectedLineCount ||
    !evidence.snapshotsComplete
  )
    add(
      "INCOMPLETE_EVIDENCE",
      "Complete original order and line evidence is required.",
      "reload",
    )
  if (!evidence.storeActive)
    add("STORE_UNAVAILABLE", "The order's Store is inactive.", "store_access")
  if (!["DRAFT", "PENDING", "CONFIRMED"].includes(evidence.status))
    add(
      "ORDER_STATE",
      "The order has progressed beyond unpaid, unfulfilled amendment.",
      "return_refund",
    )
  // Net zero is not evidence that no money moved or was authorized.
  if (
    evidence.amountPaidMinor !== 0 ||
    evidence.paymentCount !== 0 ||
    !["PENDING", "FAILED"].includes(evidence.paymentStatus)
  )
    add(
      "PAYMENT_HISTORY",
      "Payment or authorization evidence requires its own correction or refund workflow.",
      "return_refund",
    )
  if (
    evidence.fulfillmentCount !== 0 ||
    evidence.returnCount !== 0 ||
    evidence.committedReservationCount !== 0
  )
    add(
      "FULFILLMENT_HISTORY",
      "Fulfilled, committed or returned stock/work cannot be rewritten by an amendment.",
      "return_refund",
    )
  if (evidence.ledgerEntryCount !== 0)
    add(
      "LEDGER_SOURCE",
      "Customer-ledger sources require source-owned compensation.",
      "customer_ledger",
    )
  if (
    evidence.serviceAuthorizationCount !== 0 ||
    evidence.trackedWorkCount !== 0 ||
    evidence.intakeOwned
  )
    add(
      "SERVICE_SOURCE",
      "Service intake, authorization and work must be reconciled through their owning workflow.",
      "service_work",
    )
  if (evidence.quoteOwned)
    add(
      "QUOTE_SOURCE",
      "Accepted quote snapshots require the quote correction workflow.",
      "quote",
    )
  if (evidence.prescriptionOwned)
    add(
      "PRESCRIPTION_SOURCE",
      "Prescription orders require the prescription workflow.",
      "prescription",
    )
  if (evidence.bookingCount !== 0)
    add(
      "BOOKING_SOURCE",
      "Booking obligations require the booking workflow.",
      "booking",
    )
  return {
    eligibleForOrdinaryAmendment: blockers.length === 0,
    blockers,
    metadataFields: ["customer", "deliveryDueAt", "notes"] as const,
    commercialTermsStrategy: "linked_replacement" as const,
    preserveOriginalSnapshots: true as const,
    cancellationStrategy: "release_active_reservations" as const,
  }
}
