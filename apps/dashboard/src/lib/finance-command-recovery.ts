export * from "@ewatrade/utils/finance-command-identity"
import {
  type FinanceCashCommandSource,
  FinanceCommandLockUnavailableError,
  FinanceCommandRecoveryError,
  type FinanceCommandRecoveryMetadata,
  type FinanceCommandScope,
  type PendingFinanceCommand,
  canDiscardFinanceRejection,
  financeCommandDigestSource,
  financeCommandLockName,
  financeCommandStorageKey,
  isFinanceCommandRecoveryMetadata,
  supersededCashCommandRecord,
  validatePendingFinanceCommand,
} from "@ewatrade/utils/finance-command-identity"

export async function financeCommandPayloadDigest(
  operation: string,
  payload: unknown,
  salt: string,
) {
  const bytes = new TextEncoder().encode(
    financeCommandDigestSource(operation, payload, salt),
  )
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

export function readPendingFinanceCommand(
  storage: Storage,
  scope: FinanceCommandScope,
): PendingFinanceCommand | null {
  let raw: string | null
  try {
    raw = storage.getItem(financeCommandStorageKey(scope))
  } catch {
    throw new FinanceCommandRecoveryError(
      "Saved submission status is unavailable. No new finance command was sent.",
    )
  }
  if (raw === null) return null
  try {
    return validatePendingFinanceCommand(JSON.parse(raw), scope)
  } catch (error) {
    if (error instanceof FinanceCommandRecoveryError) throw error
    throw new FinanceCommandRecoveryError(
      "A saved finance submission is corrupt. Do not start another submission in this book.",
    )
  }
}

export async function createPendingFinanceCommand(
  scope: FinanceCommandScope,
  input: {
    operation: string
    payload: unknown
    recoveryMetadata?: FinanceCommandRecoveryMetadata
  },
  options: { clientCommandId?: string; salt?: string; now?: Date } = {},
): Promise<PendingFinanceCommand> {
  const operation = input.operation.trim()
  if (!operation) {
    throw new FinanceCommandRecoveryError(
      "A finance command needs a stable operation name.",
    )
  }
  if (
    input.recoveryMetadata !== undefined &&
    !isFinanceCommandRecoveryMetadata(input.recoveryMetadata)
  ) {
    throw new FinanceCommandRecoveryError(
      "This submission contains unsupported retry metadata.",
    )
  }
  const salt = options.salt ?? globalThis.crypto.randomUUID()
  return {
    ...scope,
    version: 1,
    operation,
    clientCommandId: options.clientCommandId ?? globalThis.crypto.randomUUID(),
    salt,
    payloadDigest: await financeCommandPayloadDigest(
      operation,
      input.payload,
      salt,
    ),
    createdAt: (options.now ?? new Date()).toISOString(),
    ...(input.recoveryMetadata
      ? { recoveryMetadata: input.recoveryMetadata }
      : {}),
  }
}

export async function matchesPendingFinanceCommand(
  pending: PendingFinanceCommand,
  input: { operation: string; payload: unknown },
) {
  if (pending.operation !== input.operation.trim()) return false
  return (
    pending.payloadDigest ===
    (await financeCommandPayloadDigest(
      input.operation.trim(),
      input.payload,
      pending.salt,
    ))
  )
}

export function writePendingFinanceCommand(
  storage: Storage,
  pending: PendingFinanceCommand,
) {
  try {
    storage.setItem(financeCommandStorageKey(pending), JSON.stringify(pending))
  } catch {
    throw new FinanceCommandRecoveryError(
      "This browser could not save the submission identity. No finance command was sent.",
    )
  }
}

/** Clear only the exact attempt that the caller has confirmed. */
export function clearPendingFinanceCommand(
  storage: Storage,
  scope: FinanceCommandScope,
  expected: PendingFinanceCommand,
) {
  const current = readPendingFinanceCommand(storage, scope)
  if (!current) return
  if (
    current.clientCommandId !== expected.clientCommandId ||
    current.operation !== expected.operation ||
    current.payloadDigest !== expected.payloadDigest
  ) {
    throw new FinanceCommandRecoveryError(
      "Another finance submission is being recovered in another tab. No new command was sent.",
    )
  }
  try {
    storage.removeItem(financeCommandStorageKey(scope))
  } catch {
    throw new FinanceCommandRecoveryError(
      "The result was confirmed, but its recovery marker could not be cleared. Keep using the same details until recovery finishes.",
    )
  }
}

export function rejectedFinanceCommandStorageKey(
  pending: PendingFinanceCommand,
) {
  return `${financeCommandStorageKey(pending)}:rejected:${encodeURIComponent(pending.clientCommandId)}`
}

/** Retained tabs need durable proof of a sibling's definitive first rejection. */
export function hasRejectedFinanceCommandReceipt(
  storage: Storage,
  expected: PendingFinanceCommand,
) {
  try {
    const raw = storage.getItem(rejectedFinanceCommandStorageKey(expected))
    if (raw === null) return false
    const receipt = JSON.parse(raw)
    if (
      receipt?.version !== 1 ||
      receipt.actorUserId !== expected.actorUserId ||
      receipt.tenantId !== expected.tenantId ||
      receipt.bookId !== expected.bookId ||
      receipt.clientCommandId !== expected.clientCommandId ||
      receipt.operation !== expected.operation ||
      receipt.payloadDigest !== expected.payloadDigest ||
      !canDiscardFinanceRejection({
        retryOfUncertainAttempt: false,
        status: receipt.status,
        errorCode: receipt.errorCode,
      })
    )
      throw new Error("Invalid rejection receipt")
    return true
  } catch {
    throw new FinanceCommandRecoveryError(
      "The rejected submission receipt cannot be verified. Its identity remains unresolved.",
    )
  }
}

/** Call under the browser lock after a definitive first-attempt server rejection. */
export function discardRejectedFinanceCommand(
  storage: Storage,
  scope: FinanceCommandScope,
  expected: PendingFinanceCommand,
  evidence: Parameters<typeof canDiscardFinanceRejection>[0],
) {
  const current = readPendingFinanceCommand(storage, scope)
  if (
    !canDiscardFinanceRejection(evidence) ||
    !current ||
    current.clientCommandId !== expected.clientCommandId ||
    current.operation !== expected.operation ||
    current.payloadDigest !== expected.payloadDigest
  )
    throw new FinanceCommandRecoveryError(
      "This submission has no definitive first-attempt rejection. Its identity remains.",
    )
  try {
    storage.setItem(
      rejectedFinanceCommandStorageKey(current),
      JSON.stringify({
        version: 1,
        actorUserId: current.actorUserId,
        tenantId: current.tenantId,
        bookId: current.bookId,
        clientCommandId: current.clientCommandId,
        operation: current.operation,
        payloadDigest: current.payloadDigest,
        status: evidence.status,
        errorCode: evidence.errorCode,
      }),
    )
    if (!hasRejectedFinanceCommandReceipt(storage, current)) throw new Error()
  } catch {
    throw new FinanceCommandRecoveryError(
      "The rejected submission could not be saved for other tabs. Its recovery marker remains.",
    )
  }
  clearPendingFinanceCommand(storage, scope, current)
}

/** Caller must recheck commandStatus under the book lock before acknowledging. */
export function acknowledgeCommittedFinanceCommand(
  storage: Storage,
  scope: FinanceCommandScope,
  expected: PendingFinanceCommand,
  status: "COMMITTED" | "NOT_FOUND",
) {
  if (status !== "COMMITTED") {
    throw new FinanceCommandRecoveryError(
      "The saved command is not confirmed as recorded, so its recovery marker remains.",
    )
  }
  clearPendingFinanceCommand(storage, scope, expected)
}

type CashCommandSource = FinanceCashCommandSource

/** Call under the book's browser lock when its storage marker is absent. */
export async function retainedFinanceCommandIsResolved(
  pending: PendingFinanceCommand,
  status: "COMMITTED" | "NOT_FOUND" | null,
  readCashSource: (
    bookId: string,
    countId: string,
  ) => Promise<CashCommandSource>,
) {
  if (status === "COMMITTED") return true
  const countId = pending.recoveryMetadata?.countId
  if (
    status !== "NOT_FOUND" ||
    !countId ||
    !["adjustCashCount", "cashAdjustmentReversal"].includes(pending.operation)
  )
    return false
  return Boolean(
    supersededCashCommandRecord(
      pending,
      await readCashSource(pending.bookId, countId),
    ),
  )
}

export function acknowledgeSupersededCashCommand(
  storage: Storage,
  scope: FinanceCommandScope,
  expected: PendingFinanceCommand,
  source: CashCommandSource,
  reviewedRecordId: string,
) {
  if (supersededCashCommandRecord(expected, source) !== reviewedRecordId) {
    throw new FinanceCommandRecoveryError(
      "The completed cash action changed. Its saved submission was not cleared.",
    )
  }
  clearPendingFinanceCommand(storage, scope, expected)
}

export async function withFinanceCommandLock<T>(
  scope: FinanceCommandScope,
  callback: () => Promise<T>,
  locks: LockManager | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator.locks,
): Promise<T> {
  if (!locks) {
    throw new FinanceCommandRecoveryError(
      "This browser cannot safely coordinate finance submissions across tabs. No command was sent.",
    )
  }
  return locks.request(
    financeCommandLockName(scope),
    { ifAvailable: true, mode: "exclusive" },
    (lock) => {
      if (!lock) throw new FinanceCommandLockUnavailableError()
      return callback()
    },
  )
}

/** Queue a read-only recovery inspection behind any active book operation. */
export async function withFinanceCommandInspectionLock<T>(
  scope: FinanceCommandScope,
  callback: () => Promise<T>,
  locks: LockManager | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator.locks,
): Promise<T> {
  if (!locks) {
    throw new FinanceCommandRecoveryError(
      "This browser cannot safely inspect finance recovery across tabs. Saved submission status remains unresolved.",
    )
  }
  return locks.request(
    financeCommandLockName(scope),
    { mode: "exclusive" },
    () => callback(),
  )
}
