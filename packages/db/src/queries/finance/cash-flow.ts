export type CashFlowGroup = { sourceKind: string; netMinor: bigint }

/** Cash/bank scope excludes unsettled clearing; opening imports are not receipts. */
export function calculateCashFlow(
  groups: CashFlowGroup[],
  opening: bigint,
  closing: bigint,
) {
  let operating = BigInt(0)
  let financing = BigInt(0)
  let transfersAndClearing = BigInt(0)
  let openingAdjustments = BigInt(0)
  let unclassified = BigInt(0)
  const rows = groups.map((group) => {
    let category:
      | "OPERATING"
      | "FINANCING"
      | "TRANSFERS_AND_CLEARING"
      | "OPENING_ADJUSTMENT"
      | "UNCLASSIFIED"
    switch (group.sourceKind) {
      case "CUSTOMER_RECEIPT":
      case "CUSTOMER_HELD_CREDIT_REFUND":
      case "COMMERCIAL_PAYMENT":
      case "BILL_PAYMENT":
        category = "OPERATING"
        operating += group.netMinor
        break
      case "OWNER_CONTRIBUTION":
      case "OWNER_WITHDRAWAL":
        category = "FINANCING"
        financing += group.netMinor
        break
      case "TRANSFER":
        category = "TRANSFERS_AND_CLEARING"
        transfersAndClearing += group.netMinor
        break
      case "OPENING_BALANCE":
        category = "OPENING_ADJUSTMENT"
        openingAdjustments += group.netMinor
        break
      default:
        category = "UNCLASSIFIED"
        unclassified += group.netMinor
    }
    return {
      sourceKind: group.sourceKind,
      category,
      netMinor: group.netMinor.toString(),
    }
  })
  const change =
    operating +
    financing +
    transfersAndClearing +
    openingAdjustments +
    unclassified
  const difference = closing - opening - change
  return {
    scope: "CASH_AND_BANK_EXCLUDING_CLEARING" as const,
    openingMinor: opening.toString(),
    closingMinor: closing.toString(),
    operatingMinor: operating.toString(),
    financingMinor: financing.toString(),
    transfersAndClearingMinor: transfersAndClearing.toString(),
    openingAdjustmentsMinor: openingAdjustments.toString(),
    unclassifiedMinor: unclassified.toString(),
    netChangeMinor: change.toString(),
    differenceMinor: difference.toString(),
    reconciled: difference === BigInt(0),
    classificationComplete: !rows.some(
      (row) => row.category === "UNCLASSIFIED",
    ),
    groups: rows,
  }
}
