import {
  type FinanceCashCommandSource,
  FinanceCommandNotSentError,
  FinanceCommandRecoveryError,
  type FinanceCommandRecoveryMetadata,
  type FinanceCommandScope,
  type PendingFinanceCommand,
  canDiscardFinanceRejection,
  financeCommandDigestSource,
  financeCommandStorageKey,
  isFinanceCommandRecoveryMetadata,
  supersededCashCommandRecord,
  validatePendingFinanceCommand,
} from "@ewatrade/utils/finance-command-identity"

type Stored = { command: PendingFinanceCommand; rejectedCode?: string }
export type FinanceCommandStorage = {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}
type Status = "COMMITTED" | "NOT_FOUND"
type Runtime = {
  storage: FinanceCommandStorage
  uuid: () => string
  hash: (value: string) => Promise<string>
  status: (clientCommandId: string) => Promise<Status>
  cashSource?: (
    bookId: string,
    countId: string,
  ) => Promise<FinanceCashCommandSource>
  isCurrent: () => boolean
  withLock: <T>(action: () => Promise<T>) => Promise<T>
}

/** Metadata-only recovery. An absent result never authorizes a replacement. */
export function createFinanceCommandRunner(
  scope: FinanceCommandScope,
  runtime: Runtime,
) {
  const key = `${financeCommandStorageKey(scope)}:mobile`
  let retained: Stored | null = null
  let acknowledgedVersion = 0
  function guard() {
    if (!runtime.isCurrent())
      throw new FinanceCommandRecoveryError(
        "Return online to the original account and business with owner/admin permission.",
      )
  }
  async function read(): Promise<Stored | null> {
    guard()
    const raw = await runtime.storage.getItem(key)
    // Storage can settle after sign-out, permission loss or an offline change.
    // Do not expose the retained command under the obsolete actor's authority.
    guard()
    if (raw === null) return null
    try {
      const parsed = JSON.parse(raw)
      const command = validatePendingFinanceCommand(parsed.command, scope)
      if (
        parsed.rejectedCode !== undefined &&
        !canDiscardFinanceRejection({
          retryOfUncertainAttempt: false,
          status: "NOT_FOUND",
          errorCode: parsed.rejectedCode,
        })
      )
        throw new Error("Invalid rejection")
      return {
        command,
        ...(parsed.rejectedCode ? { rejectedCode: parsed.rejectedCode } : {}),
      }
    } catch {
      throw new FinanceCommandRecoveryError(
        "Saved submission is unreadable. Do not start another financial submission in this book.",
      )
    }
  }
  function same(a: Stored, b: Stored) {
    return (
      a.command.clientCommandId === b.command.clientCommandId &&
      a.command.operation === b.command.operation &&
      a.command.payloadDigest === b.command.payloadDigest &&
      a.command.salt === b.command.salt &&
      a.command.createdAt === b.command.createdAt &&
      financeCommandDigestSource(
        "retry-metadata",
        a.command.recoveryMetadata ?? null,
        "",
      ) ===
        financeCommandDigestSource(
          "retry-metadata",
          b.command.recoveryMetadata ?? null,
          "",
        )
    )
  }
  async function save(value: Stored) {
    guard()
    await runtime.storage.setItem(key, JSON.stringify(value))
    const saved = await read()
    if (
      !saved ||
      !same(saved, value) ||
      saved.rejectedCode !== value.rejectedCode
    )
      throw new FinanceCommandRecoveryError(
        "Submission identity could not be saved. No finance command was sent.",
      )
  }
  async function clear(value: Stored) {
    guard()
    const current = await read()
    if (current && !same(current, value))
      throw new FinanceCommandRecoveryError(
        "Another submission needs recovery. Its identity was retained.",
      )
    await runtime.storage.removeItem(key)
    if (await read())
      throw new FinanceCommandRecoveryError(
        "Recorded result could not be acknowledged. Check it again before continuing.",
      )
    retained = null
    acknowledgedVersion++
  }
  async function inspect() {
    const version = acknowledgedVersion
    const current = await read()
    if (version !== acknowledgedVersion) return retained
    if (retained && current && !same(retained, current))
      throw new FinanceCommandRecoveryError(
        "Saved and retained submission identities disagree.",
      )
    retained = current ?? retained
    return retained
  }
  async function acknowledge() {
    return runtime.withLock(async () => {
      const current = await inspect()
      if (!current) return "NONE" as const
      const status = await runtime.status(current.command.clientCommandId)
      guard()
      if (status === "COMMITTED") {
        await clear(current)
        return "RECORDED" as const
      }
      if (current.rejectedCode) {
        await clear(current)
        return "REJECTED" as const
      }
      throw new FinanceCommandRecoveryError(
        "No recorded result is confirmed yet. Re-enter only the exact original details to retry; do not create a replacement.",
      )
    })
  }
  async function completedCashRecord(current: Stored, status: Status) {
    const countId = current.command.recoveryMetadata?.countId
    if (
      status !== "NOT_FOUND" ||
      !countId ||
      !runtime.cashSource ||
      !["adjustCashCount", "cashAdjustmentReversal"].includes(
        current.command.operation,
      )
    )
      return null
    const source = await runtime.cashSource(scope.bookId, countId)
    guard()
    return supersededCashCommandRecord(current.command, source)
  }
  async function acknowledgeSuperseded(reviewedRecordId: string) {
    return runtime.withLock(async () => {
      const current = await inspect()
      if (!current) return "NONE" as const
      const status = await runtime.status(current.command.clientCommandId)
      guard()
      if (status === "COMMITTED") {
        await clear(current)
        return "RECORDED" as const
      }
      if (
        !reviewedRecordId ||
        (await completedCashRecord(current, status)) !== reviewedRecordId
      )
        throw new FinanceCommandRecoveryError(
          "The completed cash action changed. Its saved submission was not cleared.",
        )
      await clear(current)
      return "SUPERSEDED" as const
    })
  }
  async function run(
    operation: string,
    payload: unknown,
    write: (id: string) => Promise<unknown>,
    options: { recoveryMetadata?: FinanceCommandRecoveryMetadata } = {},
  ) {
    return runtime.withLock(async () => {
      guard()
      if (
        options.recoveryMetadata !== undefined &&
        (!isFinanceCommandRecoveryMetadata(options.recoveryMetadata) ||
          (options.recoveryMetadata.purchaseReceipt !== undefined &&
            operation !== "recognizePurchase"))
      )
        throw new FinanceCommandRecoveryError(
          "This submission contains unsupported retry metadata. No command was sent.",
        )
      // Snapshot generated facts before any awaited hashing/storage/status work.
      const recoveryMetadata = options.recoveryMetadata
        ? {
            ...options.recoveryMetadata,
            ...(options.recoveryMetadata.purchaseReceipt
              ? {
                  purchaseReceipt: {
                    ...options.recoveryMetadata.purchaseReceipt,
                    receipts:
                      options.recoveryMetadata.purchaseReceipt.receipts.map(
                        (line) => ({ ...line }),
                      ),
                  },
                }
              : {}),
          }
        : undefined
      let current = await inspect()
      const uncertainRetry = Boolean(current)
      if (current) {
        const digest = await runtime.hash(
          financeCommandDigestSource(operation, payload, current.command.salt),
        )
        guard()
        if (
          current.command.operation !== operation ||
          current.command.payloadDigest !== digest
        )
          throw new FinanceCommandRecoveryError(
            "An unresolved submission exists. Retry only its exact original details or acknowledge the saved result.",
          )
        const status = await runtime.status(current.command.clientCommandId)
        guard()
        if (status === "COMMITTED" || current.rejectedCode)
          throw new FinanceCommandRecoveryError(
            "Check and acknowledge the earlier result before submitting again.",
          )
        if (await completedCashRecord(current, status))
          throw new FinanceCommandRecoveryError(
            "This cash action is already completed. Review its existing record before acknowledging; no command was sent.",
          )
      } else {
        const salt = runtime.uuid()
        current = {
          command: {
            ...scope,
            version: 1,
            operation,
            salt,
            clientCommandId: runtime.uuid(),
            payloadDigest: await runtime.hash(
              financeCommandDigestSource(operation, payload, salt),
            ),
            createdAt: new Date().toISOString(),
            ...(recoveryMetadata ? { recoveryMetadata } : {}),
          },
        }
      }
      await save(current)
      retained = current
      guard()
      try {
        await write(current.command.clientCommandId)
      } catch (failure) {
        if (failure instanceof FinanceCommandNotSentError && !uncertainRetry) {
          await clear(current)
          throw failure
        }
        // Recovered retries remain uncertain even after a later rejection.
        const status = await runtime
          .status(current.command.clientCommandId)
          .catch(() => null)
        const errorCode =
          failure instanceof Error && "data" in failure
            ? (failure as { data?: { code?: string } }).data?.code
            : undefined
        if (
          canDiscardFinanceRejection({
            retryOfUncertainAttempt: uncertainRetry,
            status,
            errorCode,
          })
        ) {
          const rejected = { ...current, rejectedCode: errorCode }
          await save(rejected)
          retained = rejected
        }
        throw failure
      }
      await clear(current)
      return "RECORDED" as const
    })
  }
  return { inspect, acknowledge, acknowledgeSuperseded, run }
}
