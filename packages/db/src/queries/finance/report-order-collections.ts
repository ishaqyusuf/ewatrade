/** The control account unbilled Order collections post to; see order-collection-source. */
export const ORDER_COLLECTIONS_ACCOUNT = {
  code: "2200",
  name: "Order collections awaiting reconciliation",
  kind: "LIABILITY",
  purpose: "OTHER",
} as const

type ReportRow = {
  accountId: string
  code: string
  name: string
  kind: string
  purpose: string
  closingBalanceMinor: string
  periodBalanceMinor: string
}

/**
 * Order money received without a posted sale: it raises cash but not revenue.
 * Credit-normal amounts, so positive means money held from Orders. Null when
 * the Book has never received an unbilled Order collection.
 */
export function reportOrderCollections(rows: readonly ReportRow[]) {
  const row = rows.find(
    (account) =>
      account.code === ORDER_COLLECTIONS_ACCOUNT.code &&
      account.name === ORDER_COLLECTIONS_ACCOUNT.name &&
      account.kind === ORDER_COLLECTIONS_ACCOUNT.kind &&
      account.purpose === ORDER_COLLECTIONS_ACCOUNT.purpose,
  )
  if (!row) return null
  return {
    accountId: row.accountId,
    receivedMinor: row.periodBalanceMinor,
    heldMinor: row.closingBalanceMinor,
  }
}
