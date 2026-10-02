import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import {
  type FinanceCommandRecoveryMetadata,
  type PendingFinanceCommand,
  isFinanceCommandRecoveryMetadata,
} from "@ewatrade/utils/finance-command-identity"
import { parseFinanceMoney } from "@ewatrade/utils/finance-money"
import type { StockCategoryDraft } from "@ewatrade/utils/inventory-categories"
import {
  collectStockCategoryDraft,
  stockCategorySelectors,
} from "@ewatrade/utils/inventory-categories"

export function beginPurchasePreparation(latch: { current: boolean }) {
  if (latch.current) return null
  latch.current = true
  let released = false
  return () => {
    if (released) return
    released = true
    latch.current = false
  }
}

/** Preserve original line order: the complete payload digest remains authoritative. */
export function retainedPurchaseReceiptConfirmations(
  command: PendingFinanceCommand | undefined,
  source: {
    bookId: string
    recognitionId: string
    storeId: string
    lineIds: string[]
  },
) {
  const metadata = command?.recoveryMetadata
  if (
    command?.operation !== "recognizePurchase" ||
    command.bookId !== source.bookId ||
    !isFinanceCommandRecoveryMetadata(metadata) ||
    !metadata.purchaseReceipt
  )
    return null
  const receipt = metadata.purchaseReceipt
  const ids = new Set(source.lineIds)
  if (
    receipt.recognitionId !== source.recognitionId ||
    receipt.storeId !== source.storeId ||
    ids.size !== source.lineIds.length ||
    receipt.receipts.length !== ids.size ||
    receipt.receipts.some((line) => !ids.has(line.lineId))
  )
    return null
  return receipt.receipts.map((line) => ({ ...line }))
}

export function purchaseReceiptRecoveryMetadata(input: {
  recognitionId: string
  storeId: string
  receipts: { lineId: string; expectedBalanceRevision: number }[]
}): FinanceCommandRecoveryMetadata {
  const metadata = {
    purchaseReceipt: {
      recognitionId: input.recognitionId,
      storeId: input.storeId,
      receipts: input.receipts.map((line) => ({ ...line })),
    },
  }
  if (!isFinanceCommandRecoveryMetadata(metadata))
    throw new Error(
      "The receipt's original stock revisions could not be retained.",
    )
  return metadata
}

export type PurchaseRestartRetryOperation =
  | "registerPurchase"
  | "recognizePurchase"
  | "reversePurchaseRecognition"

export type PurchaseRestartRetryAuthorization = Pick<
  PendingFinanceCommand,
  | "actorUserId"
  | "tenantId"
  | "bookId"
  | "operation"
  | "clientCommandId"
  | "payloadDigest"
  | "salt"
  | "createdAt"
> & { contextKey: string }

type RetainedPurchaseCommand = {
  command: PendingFinanceCommand
  rejectedCode?: string
}

export function snapshotPurchaseRestartRetryIdentity(
  retained: RetainedPurchaseCommand,
  contextKey: string,
) {
  const { command } = retained
  if (retained.rejectedCode !== undefined || !contextKey) return null
  return {
    actorUserId: command.actorUserId,
    tenantId: command.tenantId,
    bookId: command.bookId,
    operation: command.operation,
    clientCommandId: command.clientCommandId,
    payloadDigest: command.payloadDigest,
    salt: command.salt,
    createdAt: command.createdAt,
    contextKey,
  } satisfies PurchaseRestartRetryAuthorization
}

export function authorizePurchaseRestartRetry(input: {
  status: "COMMITTED" | "NOT_FOUND"
  retained: RetainedPurchaseCommand
  scope: { actorUserId: string; tenantId: string; bookId: string }
  contextKey: string
  operation: PurchaseRestartRetryOperation
}) {
  const { command } = input.retained
  if (
    input.status !== "NOT_FOUND" ||
    input.retained.rejectedCode !== undefined ||
    command.operation !== input.operation ||
    command.actorUserId !== input.scope.actorUserId ||
    command.tenantId !== input.scope.tenantId ||
    command.bookId !== input.scope.bookId ||
    !input.contextKey
  )
    return null
  return {
    actorUserId: command.actorUserId,
    tenantId: command.tenantId,
    bookId: command.bookId,
    operation: command.operation,
    clientCommandId: command.clientCommandId,
    payloadDigest: command.payloadDigest,
    salt: command.salt,
    createdAt: command.createdAt,
    contextKey: input.contextKey,
  } satisfies PurchaseRestartRetryAuthorization
}

export function matchesPurchaseRestartRetryAuthorization(input: {
  authorization: PurchaseRestartRetryAuthorization | null
  retained: RetainedPurchaseCommand | null
  scope: { actorUserId: string; tenantId: string; bookId: string }
  contextKey: string
  operation: PurchaseRestartRetryOperation
}) {
  const authorization = input.authorization
  const retained = input.retained
  const command = retained?.command
  return Boolean(
    authorization &&
      retained &&
      command &&
      retained.rejectedCode === undefined &&
      authorization.operation === input.operation &&
      command.operation === input.operation &&
      authorization.actorUserId === input.scope.actorUserId &&
      authorization.tenantId === input.scope.tenantId &&
      authorization.bookId === input.scope.bookId &&
      command.actorUserId === input.scope.actorUserId &&
      command.tenantId === input.scope.tenantId &&
      command.bookId === input.scope.bookId &&
      authorization.clientCommandId === command.clientCommandId &&
      authorization.payloadDigest === command.payloadDigest &&
      authorization.salt === command.salt &&
      authorization.createdAt === command.createdAt &&
      authorization.contextKey === input.contextKey,
  )
}

export function canConfirmRetainedPurchaseCommand(input: {
  authorization: PurchaseRestartRetryAuthorization | null
  retained: RetainedPurchaseCommand | null
  scope: { actorUserId: string; tenantId: string; bookId: string }
  contextKey: string
  operation: PurchaseRestartRetryOperation
  hasLiveExactPayload: boolean
  liveIdentity: PurchaseRestartRetryAuthorization | null
  pending: boolean
}) {
  if (input.pending || !input.retained) return false
  if (
    matchesPurchaseRestartRetryAuthorization({
      authorization: input.authorization,
      retained: input.retained,
      scope: input.scope,
      contextKey: input.contextKey,
      operation: input.operation,
    })
  )
    return true
  return Boolean(
    input.hasLiveExactPayload &&
      matchesPurchaseRestartRetryAuthorization({
        authorization: input.liveIdentity,
        retained: input.retained,
        scope: input.scope,
        contextKey: input.contextKey,
        operation: input.operation,
      }),
  )
}

export type PurchaseRecognitionEventView = {
  id: string
  stage: "INVOICE" | "OWNERSHIP" | "RECEIPT"
  sequence: string
  reversalOfId: string | null
  reversalId: string | null
}

export type PurchaseRecognitionListPageView = {
  bookId: string
  supplierId: string
  currencyCode: string
  nextCursor: string | null
  items: {
    id: string
    bookId: string
    supplierId: string
    storeId: string
    agreedAt: Date | string
    description: string
    amountMinor: string
  }[]
}

export function purchaseRecognitionPagesMatchScope(
  pages: PurchaseRecognitionListPageView[],
  scope: { bookId: string; supplierId: string; currencyCode: string },
) {
  return (
    pages.length > 0 &&
    pages.every(
      (page) =>
        page.bookId === scope.bookId &&
        page.supplierId === scope.supplierId &&
        page.currencyCode === scope.currencyCode &&
        page.items.every(
          (item) =>
            Boolean(item.id) &&
            Boolean(item.storeId) &&
            item.bookId === scope.bookId &&
            item.supplierId === scope.supplierId &&
            typeof item.description === "string" &&
            typeof item.amountMinor === "string" &&
            (item.agreedAt instanceof Date ||
              (typeof item.agreedAt === "string" &&
                Number.isFinite(Date.parse(item.agreedAt)))),
        ),
    )
  )
}

export function purchaseRecognitionPagesAreComplete(
  pages: PurchaseRecognitionListPageView[],
  pageParams: unknown[],
) {
  if (pages.length === 0 || pageParams.length !== pages.length) return false
  const ids = new Set<string>()
  const cursors = new Set<string>()
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]
    if (!page) return false
    if (index > 0 && pageParams[index] !== pages[index - 1]?.nextCursor)
      return false
    for (const item of page.items) {
      if (ids.has(item.id)) return false
      ids.add(item.id)
    }
    const cursor = page.nextCursor
    if (cursor !== null) {
      if (cursors.has(cursor) || !page.items.some((item) => item.id === cursor))
        return false
      cursors.add(cursor)
    }
  }
  return true
}

export function availablePurchaseRecognitionStages(
  events: PurchaseRecognitionEventView[],
  corrected: boolean,
) {
  if (corrected) return [] as const
  const active = new Set(
    events
      .filter((event) => event.reversalOfId === null && !event.reversalId)
      .map((event) => event.stage),
  )
  return (["INVOICE", "OWNERSHIP", "RECEIPT"] as const).filter(
    (stage) =>
      !active.has(stage) && !(stage === "OWNERSHIP" && active.has("RECEIPT")),
  )
}

export function canReversePurchaseRecognitionEvent(
  event: PurchaseRecognitionEventView,
  events: PurchaseRecognitionEventView[],
) {
  return (
    event.reversalOfId === null &&
    event.reversalId === null &&
    event.stage !== "RECEIPT" &&
    !events.some(
      (candidate) =>
        candidate.reversalOfId === null &&
        !candidate.reversalId &&
        BigInt(candidate.sequence) > BigInt(event.sequence),
    )
  )
}

export function matchPurchaseBalance<
  T extends {
    balanceSourceId: string
    storeId: string
    inventoryUnitId: string
    configurationVersionId: string
  },
>(input: {
  rows: T[]
  balanceSourceId: string
  storeId: string
  inventoryUnitId: string
  configurationVersionId: string
}) {
  return input.rows.find(
    (row) =>
      row.balanceSourceId === input.balanceSourceId &&
      row.storeId === input.storeId &&
      row.inventoryUnitId === input.inventoryUnitId &&
      row.configurationVersionId === input.configurationVersionId,
  )
}

export function buildPurchaseRegistrationLine(input: {
  balance: {
    balanceSourceId: string
    configurationVersionId: string
    inventoryUnitId: string
    inventoryUnitTransactionScale: number
  }
  description: string
  enteredQuantity: string
  amount: string
  categories: StockCategoryDraft[]
  categoryInput: string
}) {
  return {
    balanceSourceId: input.balance.balanceSourceId,
    expectedConfigurationVersionId: input.balance.configurationVersionId,
    enteredInventoryUnitId: input.balance.inventoryUnitId,
    enteredQuantity: parseExactDecimal(input.enteredQuantity, {
      allowZero: false,
      maxScale: input.balance.inventoryUnitTransactionScale,
    }),
    categories: stockCategorySelectors(
      collectStockCategoryDraft(input.categories, input.categoryInput),
    ),
    description: input.description.trim(),
    amountMinor: parseFinanceMoney(input.amount),
  }
}
