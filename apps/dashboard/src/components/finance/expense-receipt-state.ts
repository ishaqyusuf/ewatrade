export const EXPENSE_RECEIPT_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const

export const EXPENSE_RECEIPT_MAX_BYTES = 10_000_000

export type ExpenseReceiptLifecycle = {
  uploadState: string
  safetyState: string
  attachmentState: string
  bytesDeletedAt: Date | string | null
}

export type ExpenseReceiptRecoveryScope = {
  actorUserId: string
  tenantId: string
  bookId: string
  billId: string
}

const EXPENSE_RECEIPT_COMMAND_ID = /^[a-zA-Z0-9_-]{8,128}$/

function expenseReceiptRecoveryKey(
  scope: ExpenseReceiptRecoveryScope,
  operation: "intent" | "attach" | "withdraw",
  identity: string,
) {
  return [
    "ewatrade",
    "finance",
    "expense-receipt-command-v1",
    scope.actorUserId,
    scope.tenantId,
    scope.bookId,
    scope.billId,
    operation,
    identity,
  ]
    .map(encodeURIComponent)
    .join(":")
}

export class ExpenseReceiptReadGeneration {
  #current = 0
  #requestId = 0
  #activeRequestId: number | null = null

  invalidate() {
    this.#current += 1
    this.#activeRequestId = null
  }

  begin(dataUpdatedAt: number) {
    const requestId = ++this.#requestId
    this.#activeRequestId = requestId
    return { generation: this.#current, requestId, dataUpdatedAt }
  }

  isCurrent(request: { generation: number; requestId: number }) {
    return (
      request.generation === this.#current &&
      request.requestId === this.#activeRequestId
    )
  }

  async read<T>(
    request: { generation: number; requestId: number },
    fetchPage: () => Promise<T>,
    canContinue: () => boolean,
  ): Promise<T> {
    if (!this.isCurrent(request) || !canContinue())
      throw new Error("Receipt access changed. Refresh the current expense.")
    const page = await fetchPage()
    if (!this.isCurrent(request) || !canContinue())
      throw new Error("Receipt access changed. Refresh the current expense.")
    return page
  }

  accepts(
    request: { generation: number; requestId: number; dataUpdatedAt: number },
    currentDataUpdatedAt: number,
  ) {
    return (
      this.isCurrent(request) && currentDataUpdatedAt > request.dataUpdatedAt
    )
  }
}

export function getExpenseReceiptCommandId(
  storage: Pick<Storage, "getItem" | "setItem">,
  scope: ExpenseReceiptRecoveryScope,
  operation: "intent" | "attach" | "withdraw",
  identity: string,
  createId = () => globalThis.crypto.randomUUID(),
) {
  const key = expenseReceiptRecoveryKey(scope, operation, identity)
  try {
    const saved = storage.getItem(key)
    if (saved !== null) {
      if (EXPENSE_RECEIPT_COMMAND_ID.test(saved)) return saved
      throw new Error("Corrupt expense receipt command identity.")
    }
    const commandId = createId()
    if (!EXPENSE_RECEIPT_COMMAND_ID.test(commandId))
      throw new Error("Invalid expense receipt command identity.")
    storage.setItem(key, commandId)
    return commandId
  } catch {
    throw new Error(
      "This browser could not save the receipt retry identity. No receipt command was sent.",
    )
  }
}

export function clearExpenseReceiptCommandId(
  storage: Pick<Storage, "removeItem">,
  scope: ExpenseReceiptRecoveryScope,
  operation: "intent" | "attach" | "withdraw",
  identity: string,
) {
  try {
    const key = expenseReceiptRecoveryKey(scope, operation, identity)
    storage.removeItem(key)
    if (operation === "intent") storage.removeItem(`${key}:asset`)
  } catch {
    // Keeping a confirmed command ID is safe: the API treats it as an exact retry.
  }
}

export function associateExpenseReceiptIntentAsset(
  storage: Pick<Storage, "getItem" | "setItem">,
  scope: ExpenseReceiptRecoveryScope,
  identity: string,
  assetId: string,
) {
  const key = expenseReceiptRecoveryKey(scope, "intent", identity)
  try {
    if (!EXPENSE_RECEIPT_COMMAND_ID.test(storage.getItem(key) ?? ""))
      throw new Error("Receipt intent command is missing.")
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(assetId))
      throw new Error("Receipt intent asset ID is invalid.")
    storage.setItem(`${key}:asset`, assetId)
  } catch {
    throw new Error(
      "This browser could not save the receipt recovery link. No further receipt action was sent.",
    )
  }
}

export function getExpenseReceiptIntentAsset(
  storage: Pick<Storage, "getItem">,
  scope: ExpenseReceiptRecoveryScope,
  identity: string,
) {
  const key = `${expenseReceiptRecoveryKey(scope, "intent", identity)}:asset`
  try {
    const assetId = storage.getItem(key)
    return assetId && /^[A-Za-z0-9_-]{1,128}$/.test(assetId) ? assetId : null
  } catch {
    return null
  }
}

export function clearExpenseReceiptIntentForAsset(
  storage: Pick<Storage, "length" | "key" | "getItem" | "removeItem">,
  scope: ExpenseReceiptRecoveryScope,
  assetId: string,
) {
  const prefix = expenseReceiptRecoveryKey(scope, "intent", "")
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index)
      if (!key?.startsWith(prefix)) continue
      const commandKey = key.slice(0, -":asset".length)
      if (key.endsWith(":asset") && storage.getItem(key) === assetId) {
        storage.removeItem(commandKey)
        storage.removeItem(key)
      }
    }
  } catch {
    // A retained recovery identity is safe; exact command replay remains idempotent.
  }
}

export function validateExpenseReceiptFile(
  file: Pick<File, "type" | "size"> & Partial<Pick<File, "name">>,
) {
  if (
    !EXPENSE_RECEIPT_CONTENT_TYPES.some(
      (contentType) => contentType === file.type,
    )
  )
    return "Choose a JPEG, PNG, WebP, HEIC, HEIF or PDF file."
  if (file.size < 1 || file.size > EXPENSE_RECEIPT_MAX_BYTES)
    return "Receipt files must be between 1 byte and 10 MB."
  if (
    file.name !== undefined &&
    (file.name.length > 160 ||
      /[/\\\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(file.name) ||
      !file.name.trim() ||
      file.name.trim() === "." ||
      file.name.trim() === "..")
  )
    return "Choose a receipt with a valid file name."
  return null
}

export function canAttachExpenseReceipt(receipt: ExpenseReceiptLifecycle) {
  return (
    receipt.uploadState === "VERIFIED" &&
    receipt.safetyState === "SAFE" &&
    receipt.attachmentState === "UNATTACHED" &&
    receipt.bytesDeletedAt === null
  )
}

export function isExpenseReceiptReadCurrent(input: {
  online: boolean
  fetchedAfterMount: boolean
  fetchStatus: "idle" | "fetching" | "paused"
  isFetching: boolean
  isError: boolean
  requestCurrent: boolean
}) {
  return (
    input.online &&
    input.fetchedAfterMount &&
    input.fetchStatus === "idle" &&
    !input.isFetching &&
    !input.isError &&
    input.requestCurrent
  )
}

export function canDownloadExpenseReceipt(receipt: ExpenseReceiptLifecycle) {
  return (
    receipt.attachmentState === "ATTACHED" &&
    receipt.safetyState === "SAFE" &&
    receipt.bytesDeletedAt === null
  )
}

export function expenseReceiptStatus(receipt: ExpenseReceiptLifecycle) {
  if (receipt.bytesDeletedAt) return "Original unavailable"
  if (receipt.attachmentState === "WITHDRAWN") return "Withdrawn · retained"
  if (receipt.attachmentState === "ATTACHED") return "Attached"
  if (receipt.safetyState === "REJECTED") return "Rejected by safety review"
  if (receipt.uploadState === "VERIFIED" && receipt.safetyState === "SAFE")
    return "Ready to attach"
  if (receipt.uploadState === "VERIFIED") return "Safety review pending"
  if (receipt.uploadState === "RETRYABLE") return "Upload needs retry"
  if (
    receipt.uploadState === "CLEANUP_PENDING" ||
    receipt.uploadState === "DELETED"
  )
    return "Upload expired"
  return "Upload pending"
}
