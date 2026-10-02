export type ReviewedPurchaseSourceFacts = {
  book: {
    id: string
    tenantId: string
    currencyCode: string
    startsAt: Date
    lastSequence: bigint
  }
  through: Date
  receipt: {
    id: string
    tenantId: string
    bookId: string
    billLineId: string
    stockOperationId: string
    stockMovementId: string
  }
  bill: {
    id: string
    bookId: string
    kind: string
    supplierId: string | null
    supplierBookId: string | null
    storeId: string | null
    storeTenantId: string | null
    currencyCode: string | null
    actorUserId: string
    description: string
    incurredAt: Date
    totalMinor: bigint
    corrected: boolean
    lineCount: number
    originalEntryCount: number
    lines: Array<{
      id: string
      bookId: string
      billId: string
      position: number
      amountMinor: bigint
      account: {
        id: string
        bookId: string
        code: string
        kind: string
        purpose: string
      }
      receipt: {
        id: string
        tenantId: string
        bookId: string
        billLineId: string
        stockOperationId: string
        stockMovementId: string
      } | null
    }>
  }
  operation: {
    id: string
    tenantId: string
    storeId: string
    type: string
    source: string
    actorUserId: string
    effectiveAt: Date
    clientOperationId: string
    payloadHash: string
    linkedOperationId: string | null
    correctionOfOperationId: string | null
    ownerCounts: Record<string, number>
  }
  movement: {
    id: string
    operationId: string
    balanceSourceId: string
    balanceTenantId: string
    balanceStoreId: string
    currencyCode: string
    effect: string
    before: string
    after: string
    reversalOfMovementId: string | null
  }
  event: {
    id: string
    tenantId: string
    bookId: string
    poolId: string
    poolTenantId: string
    poolBookId: string
    poolBalanceSourceId: string
    balanceSourceId: string
    stockOperationId: string
    stockMovementId: string
    purchaseReceiptId: string | null
    productReturnCostId: string | null
    sequence: bigint
    kind: string
    sourceKind: string
    sourceId: string
    sourceCostMinor: bigint | null
    valueBeforeMinor: bigint | null
    valueDeltaMinor: bigint | null
    valueAfterMinor: bigint | null
    unknownReason: string | null
    actorUserId: string
    effectiveAt: Date
    effect: string
    before: string
    after: string
  } | null
  supplierEntry: {
    id: string
    bookId: string
    supplierId: string
    billId: string | null
    kind: string
    side: string
    amountMinor: bigint
    actorUserId: string
    effectiveAt: Date
    journalEntryId: string
    moneyAccountId: string | null
    paymentId: string | null
    reversalOfId: string | null
    reversalCount: number
  } | null
  journal: {
    id: string
    bookId: string
    sequence: bigint
    sourceKind: string
    sourceId: string
    description: string
    actorUserId: string
    storeId: string | null
    effectiveAt: Date
    payloadHash: string
    reversalOfId: string | null
    reversed: boolean
    lines: Array<{
      id: string
      bookId: string
      entryId: string
      debitMinor: bigint
      creditMinor: bigint
      description: string | null
      account: {
        id: string
        bookId: string
        code: string
        kind: string
        purpose: string
      }
    }>
  } | null
  command: {
    id: string
    bookId: string
    kind: string
    clientCommandId: string
    actorUserId: string
    payloadHash: string
    resultId: string | null
  }
  postingCommand: {
    id: string
    bookId: string
    kind: string
    clientCommandId: string
    actorUserId: string
    payloadHash: string
    entryId: string | null
  } | null
}
