export type FinanceCommandScope = {
  actorUserId: string
  tenantId: string
  bookId: string
}

export type FinanceCommandRecoveryMetadata = {
  asOf?: string
  accountId?: string
  countId?: string
  entryId?: string
  expectedSnapshotSequence?: string
  action?: "CLOSE" | "REOPEN"
  periodId?: string
  through?: string
  purchaseReceipt?: {
    recognitionId: string
    storeId: string
    receipts: { lineId: string; expectedBalanceRevision: number }[]
  }
}

export type PendingFinanceCommand = FinanceCommandScope & {
  version: 1
  operation: string
  clientCommandId: string
  salt: string
  payloadDigest: string
  createdAt: string
  recoveryMetadata?: FinanceCommandRecoveryMetadata
}

export type FinanceCashCommandSource = {
  id: string
  adjustment: { id: string; reversal: { id: string } | null } | null
}

/** Original source uniqueness prevents a delayed cash command posting again. */
export function supersededCashCommandRecord(
  pending: PendingFinanceCommand,
  count: FinanceCashCommandSource,
) {
  const metadata = pending.recoveryMetadata
  if (metadata?.countId !== count.id || !count.adjustment) return null
  if (pending.operation === "adjustCashCount") return count.adjustment.id
  if (
    pending.operation === "cashAdjustmentReversal" &&
    metadata.entryId === count.adjustment.id
  )
    return count.adjustment.reversal?.id ?? null
  return null
}

export class FinanceCommandRecoveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FinanceCommandRecoveryError"
  }
}

export class FinanceCommandLockUnavailableError extends FinanceCommandRecoveryError {
  constructor() {
    super(
      "Another tab is processing a finance submission for this book. This attempt was not queued or sent.",
    )
    this.name = "FinanceCommandLockUnavailableError"
  }
}

/** An absent result cannot settle an earlier request that may still be in flight. */
export function canDiscardFinanceRejection(input: {
  retryOfUncertainAttempt: boolean
  status: "COMMITTED" | "NOT_FOUND" | null
  errorCode: string | undefined
}) {
  return (
    !input.retryOfUncertainAttempt &&
    input.status === "NOT_FOUND" &&
    ["BAD_REQUEST", "CONFLICT", "FORBIDDEN", "NOT_FOUND"].includes(
      input.errorCode ?? "",
    )
  )
}

export function financeCommandStorageKey(scope: FinanceCommandScope) {
  return [
    "ewatrade",
    "finance-command",
    "v1",
    scope.actorUserId,
    scope.tenantId,
    scope.bookId,
  ]
    .map(encodeURIComponent)
    .join(":")
}

export function financeCommandLockName(scope: FinanceCommandScope) {
  return `${financeCommandStorageKey(scope)}:lock`
}

function canonicalize(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new FinanceCommandRecoveryError(
        "This submission contains an invalid date.",
      )
    }
    return JSON.stringify(value.toISOString())
  }
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value)
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new FinanceCommandRecoveryError(
        "This submission contains a non-finite number.",
      )
    }
    return JSON.stringify(value)
  }
  if (Array.isArray(value))
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(",")}}`
  }
  throw new FinanceCommandRecoveryError(
    "This submission cannot be safely fingerprinted.",
  )
}

export function financeCommandDigestSource(
  operation: string,
  payload: unknown,
  salt: string,
) {
  return `${salt}\n${operation}\n${canonicalize(payload)}`
}

export function validatePendingFinanceCommand(
  value: unknown,
  scope: FinanceCommandScope,
): PendingFinanceCommand {
  if (!value || typeof value !== "object") {
    throw new FinanceCommandRecoveryError(
      "A saved finance submission is unreadable. Do not start another submission in this book.",
    )
  }
  const record = value as Partial<PendingFinanceCommand>
  if (
    record.version !== 1 ||
    record.actorUserId !== scope.actorUserId ||
    record.tenantId !== scope.tenantId ||
    record.bookId !== scope.bookId ||
    typeof record.operation !== "string" ||
    !record.operation ||
    typeof record.clientCommandId !== "string" ||
    !record.clientCommandId ||
    typeof record.salt !== "string" ||
    !record.salt ||
    typeof record.payloadDigest !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.payloadDigest) ||
    typeof record.createdAt !== "string" ||
    Number.isNaN(Date.parse(record.createdAt))
  ) {
    throw new FinanceCommandRecoveryError(
      "A saved finance submission is invalid. Do not start another submission in this book.",
    )
  }
  const metadata = record.recoveryMetadata
  if (
    metadata !== undefined &&
    (!isFinanceCommandRecoveryMetadata(metadata) ||
      (metadata.purchaseReceipt !== undefined &&
        record.operation !== "recognizePurchase"))
  ) {
    throw new FinanceCommandRecoveryError(
      "A saved finance submission has invalid retry metadata. Do not start another submission in this book.",
    )
  }
  return record as PendingFinanceCommand
}

export function isFinanceCommandRecoveryMetadata(
  value: unknown,
): value is FinanceCommandRecoveryMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const metadata = value as Record<string, unknown>
  const allowedKeys = new Set([
    "asOf",
    "accountId",
    "countId",
    "entryId",
    "expectedSnapshotSequence",
    "action",
    "periodId",
    "through",
    "purchaseReceipt",
  ])
  if (Object.keys(metadata).some((key) => !allowedKeys.has(key))) return false
  for (const key of ["accountId", "countId", "entryId", "periodId"]) {
    if (
      metadata[key] !== undefined &&
      (typeof metadata[key] !== "string" || !metadata[key])
    )
      return false
  }
  if (
    metadata.expectedSnapshotSequence !== undefined &&
    (typeof metadata.expectedSnapshotSequence !== "string" ||
      !/^\d+$/.test(metadata.expectedSnapshotSequence))
  )
    return false
  if (
    metadata.asOf !== undefined &&
    (typeof metadata.asOf !== "string" ||
      Number.isNaN(Date.parse(metadata.asOf)) ||
      new Date(metadata.asOf).toISOString() !== metadata.asOf)
  )
    return false
  if (
    metadata.through !== undefined &&
    (typeof metadata.through !== "string" ||
      Number.isNaN(Date.parse(metadata.through)) ||
      new Date(metadata.through).toISOString() !== metadata.through)
  )
    return false
  if (
    metadata.action !== undefined &&
    metadata.action !== "CLOSE" &&
    metadata.action !== "REOPEN"
  )
    return false
  if (metadata.purchaseReceipt !== undefined) {
    const receipt = metadata.purchaseReceipt
    if (!receipt || typeof receipt !== "object" || Array.isArray(receipt))
      return false
    const record = receipt as Record<string, unknown>
    if (
      Object.keys(record).some(
        (key) => !["recognitionId", "storeId", "receipts"].includes(key),
      ) ||
      [record.recognitionId, record.storeId].some(
        (id) => typeof id !== "string" || !id || id.length > 160,
      ) ||
      !Array.isArray(record.receipts) ||
      record.receipts.length < 1 ||
      record.receipts.length > 10
    )
      return false
    const ids = new Set<string>()
    for (const line of record.receipts) {
      if (!line || typeof line !== "object" || Array.isArray(line)) return false
      const entry = line as Record<string, unknown>
      if (
        Object.keys(entry).some(
          (key) => !["lineId", "expectedBalanceRevision"].includes(key),
        ) ||
        typeof entry.lineId !== "string" ||
        !entry.lineId ||
        entry.lineId.length > 160 ||
        ids.has(entry.lineId) ||
        typeof entry.expectedBalanceRevision !== "number" ||
        !Number.isInteger(entry.expectedBalanceRevision) ||
        entry.expectedBalanceRevision < 0 ||
        entry.expectedBalanceRevision > 2_147_483_646
      )
        return false
      ids.add(entry.lineId)
    }
  }
  return true
}
