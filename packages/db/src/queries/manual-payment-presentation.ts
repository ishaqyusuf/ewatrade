/** Customer-safe provenance; receipt checks/reference matching never set confirmed. */
export function manualPaymentVerification(row: {
  status: string
  canonicalPaymentId: string | null
  decidedAt: Date | null
  receivedAt: Date | null
  receivedAmountMinor: number | null
}) {
  const confirmed =
    row.status === "CONFIRMED" && Boolean(row.canonicalPaymentId)
  return {
    state: confirmed ? ("confirmed" as const) : ("unverified" as const),
    source: confirmed ? ("merchant_bank_check" as const) : null,
    confirmedAt: confirmed ? row.decidedAt : null,
    receivedAt: confirmed ? row.receivedAt : null,
    receivedAmountMinor: confirmed ? row.receivedAmountMinor : null,
    canonicalPaymentId: confirmed ? row.canonicalPaymentId : null,
  }
}
