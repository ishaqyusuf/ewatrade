"use client"
import { useFinanceForm } from "@/components/finance/form-context"
import {
  FinanceCommandNotSentError,
  FinanceCommandRecoveryError,
  type FinanceCommandRecoveryMetadata,
  type PendingFinanceCommand,
  canDiscardFinanceRejection,
  clearPendingFinanceCommand,
  createPendingFinanceCommand,
  discardRejectedFinanceCommand,
  financeCommandStorageKey,
  hasRejectedFinanceCommandReceipt,
  matchesPendingFinanceCommand,
  readPendingFinanceCommand,
  retainedFinanceCommandIsResolved,
  withFinanceCommandLock,
  writePendingFinanceCommand,
} from "@/lib/finance-command-recovery"
import { useTRPC } from "@/trpc/client"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type FinanceCommandRequest = {
  payload: unknown
  recoveryMetadata?: FinanceCommandRecoveryMetadata
  write: (clientCommandId: string) => Promise<unknown>
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function useFinanceCommand(
  complete: () => Promise<void>,
  bookId: string,
  operation: string,
) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const {
    actorUserId,
    recoveryRefresh,
    refreshRecovery,
    setRecoveryNotice,
    tenantId,
  } = useFinanceForm()
  const scope = useMemo(
    () => ({ actorUserId, tenantId, bookId }),
    [actorUserId, bookId, tenantId],
  )
  const busy = useRef(false)
  const madeUncertainWrite = useRef(false)
  const localPending = useRef<PendingFinanceCommand | null>(null)
  const [pending, setPending] = useState(false)
  const [ready, setReady] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recoveryMetadata, setRecoveryMetadata] =
    useState<FinanceCommandRecoveryMetadata | null>(null)

  const retainedCommandResolution = useCallback(
    async (retained: PendingFinanceCommand) => {
      const status = await client.fetchQuery(
        trpc.finance.commandStatus.queryOptions(
          {
            bookId: retained.bookId,
            clientCommandId: retained.clientCommandId,
          },
          { staleTime: 0 },
        ),
      )
      if (
        status.status === "NOT_FOUND" &&
        hasRejectedFinanceCommandReceipt(window.localStorage, retained)
      )
        return "REJECTED" as const
      const completed = await retainedFinanceCommandIsResolved(
        retained,
        status.status,
        (sourceBookId, countId) =>
          client.fetchQuery(
            trpc.finance.cashCount.queryOptions(
              { bookId: sourceBookId, countId },
              { staleTime: 0 },
            ),
          ),
      )
      return completed ? "COMPLETED" : null
    },
    [client, trpc],
  )

  useEffect(() => {
    if (recoveryRefresh < 0) return
    try {
      if (typeof window !== "undefined") {
        const stored = readPendingFinanceCommand(window.localStorage, scope)
        if (stored) {
          localPending.current = stored
          madeUncertainWrite.current = true
          setUncertain(true)
          if (stored.operation === operation) {
            setRecoveryMetadata(stored.recoveryMetadata ?? null)
          }
        }
      }
    } catch (failure) {
      setUncertain(true)
      setError(message(failure, "Saved submission status is unreadable."))
    } finally {
      setReady(true)
    }
    const key = financeCommandStorageKey(scope)
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== key || typeof window === "undefined") return
      try {
        const stored = readPendingFinanceCommand(window.localStorage, scope)
        if (stored) {
          setUncertain(true)
          setRecoveryMetadata(
            stored.operation === operation
              ? (stored.recoveryMetadata ?? null)
              : null,
          )
          return
        }
        const retained = localPending.current
        if (retained && madeUncertainWrite.current) {
          void withFinanceCommandLock(scope, async () => {
            const resolution = await retainedCommandResolution(retained)
            if (resolution) {
              localPending.current = null
              madeUncertainWrite.current = false
              setRecoveryMetadata(null)
              setRecoveryNotice(null)
              if (resolution === "REJECTED") {
                setUncertain(false)
                setError(
                  "The earlier submission was rejected. Review corrected details before submitting again.",
                )
              } else if (retained.operation === operation) {
                setSaved(true)
                setUncertain(false)
                await complete()
              } else {
                setUncertain(false)
              }
            }
          }).catch((failure) => {
            setError(message(failure, "Saved submission status is unreadable."))
          })
        } else {
          setUncertain(false)
          setRecoveryMetadata(null)
          setRecoveryNotice(null)
        }
      } catch (failure) {
        setUncertain(true)
        setError(message(failure, "Saved submission status is unreadable."))
      }
    }
    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [
    complete,
    retainedCommandResolution,
    operation,
    recoveryRefresh,
    scope,
    setRecoveryNotice,
  ])

  useEffect(() => {
    if (!pending && !uncertain) return
    const preventAbandoningCommand = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", preventAbandoningCommand)
    return () =>
      window.removeEventListener("beforeunload", preventAbandoningCommand)
  }, [pending, uncertain])

  const run = useCallback(
    async (next: FinanceCommandRequest) => {
      if (busy.current || saved) return
      if (!ready) {
        setError("Checking saved submission status. Wait before confirming.")
        return
      }
      busy.current = true
      setPending(true)
      setError(null)
      try {
        await withFinanceCommandLock(scope, async () => {
          let current: PendingFinanceCommand
          const stored =
            typeof window === "undefined"
              ? null
              : readPendingFinanceCommand(window.localStorage, scope)
          if (stored) {
            if (
              stored.operation !== operation ||
              !(await matchesPendingFinanceCommand(stored, {
                operation,
                payload: next.payload,
              }))
            ) {
              setUncertain(true)
              throw new FinanceCommandRecoveryError(
                "An unresolved submission already exists in this book. Only its exact original details can be retried or acknowledged.",
              )
            }
            current = stored
            localPending.current = stored
            setRecoveryMetadata(stored.recoveryMetadata ?? null)
            const status = await client.fetchQuery(
              trpc.finance.commandStatus.queryOptions(
                {
                  bookId: current.bookId,
                  clientCommandId: current.clientCommandId,
                },
                { staleTime: 0 },
              ),
            )
            if (status.status === "COMMITTED") {
              setUncertain(true)
              setRecoveryNotice(
                `Submission ${current.clientCommandId} is already recorded. Acknowledge it before leaving this recovery state.`,
              )
              throw new FinanceCommandRecoveryError(
                "This submission is already recorded. Use the recovery acknowledgement before continuing.",
              )
            }
            if (
              hasRejectedFinanceCommandReceipt(window.localStorage, current)
            ) {
              refreshRecovery()
              throw new FinanceCommandRecoveryError(
                "This submission was rejected. Acknowledge the saved rejection before reviewing corrected details.",
              )
            }
          } else {
            const locallyRetained = localPending.current
            if (locallyRetained) {
              if (
                locallyRetained.operation !== operation ||
                !(await matchesPendingFinanceCommand(locallyRetained, {
                  operation,
                  payload: next.payload,
                }))
              ) {
                setUncertain(true)
                throw new FinanceCommandRecoveryError(
                  "This tab still has an unresolved command identity. Re-enter its exact details before any new submission.",
                )
              }
              const resolution =
                await retainedCommandResolution(locallyRetained)
              if (resolution) {
                localPending.current = null
                madeUncertainWrite.current = false
                setUncertain(false)
                setRecoveryMetadata(null)
                if (resolution === "REJECTED") {
                  setError(
                    "The earlier submission was rejected. Review corrected details before submitting again.",
                  )
                  return
                }
                setSaved(true)
                try {
                  await complete()
                } catch {
                  setError(
                    "This submission was already recorded. Refresh the finance sheet to see the updated records.",
                  )
                }
                return
              }
              current = locallyRetained
              if (typeof window === "undefined") {
                throw new FinanceCommandRecoveryError(
                  "Browser storage is unavailable. No finance command was sent.",
                )
              }
              writePendingFinanceCommand(window.localStorage, current)
            } else {
              current = await createPendingFinanceCommand(scope, {
                operation,
                payload: next.payload,
                recoveryMetadata: next.recoveryMetadata,
              })
            }
            if (typeof window === "undefined") {
              throw new FinanceCommandRecoveryError(
                "Browser storage is unavailable. No finance command was sent.",
              )
            }
            writePendingFinanceCommand(window.localStorage, current)
            localPending.current = current
          }

          const retryOfUncertainAttempt =
            madeUncertainWrite.current || Boolean(stored)
          try {
            await next.write(current.clientCommandId)
            try {
              if (typeof window !== "undefined") {
                clearPendingFinanceCommand(window.localStorage, scope, current)
              }
            } catch (clearError) {
              setUncertain(true)
              setError(
                message(
                  clearError,
                  "Recorded, but recovery status could not be cleared.",
                ),
              )
              setRecoveryNotice(
                `Submission ${current.clientCommandId} was recorded. Acknowledge the saved result to clear its recovery marker.`,
              )
              refreshRecovery()
              return
            }
            setSaved(true)
            setUncertain(false)
            localPending.current = null
            madeUncertainWrite.current = false
            refreshRecovery()
            try {
              await complete()
            } catch {
              setError(
                "Recorded successfully. Refresh the finance sheet to see the updated records.",
              )
            }
          } catch (writeError) {
            setUncertain(true)
            madeUncertainWrite.current = true
            setRecoveryMetadata(current.recoveryMetadata ?? null)
            const status = await client
              .fetchQuery(
                trpc.finance.commandStatus.queryOptions(
                  {
                    bookId: current.bookId,
                    clientCommandId: current.clientCommandId,
                  },
                  { staleTime: 0 },
                ),
              )
              .catch(() => null)
            if (status?.status === "COMMITTED") {
              refreshRecovery()
              setRecoveryNotice(
                `Submission ${current.clientCommandId} was recorded. Acknowledge the saved result before starting another command.`,
              )
              setError(
                "The result was recorded; use the acknowledgement to finish recovery.",
              )
              return
            }
            const errorCode =
              writeError instanceof FinanceCommandNotSentError
                ? "BAD_REQUEST"
                : writeError instanceof Error && "data" in writeError
                  ? (writeError as { data?: { code?: string } }).data?.code
                  : undefined
            if (
              canDiscardFinanceRejection({
                retryOfUncertainAttempt,
                status: status?.status ?? null,
                errorCode,
              })
            ) {
              discardRejectedFinanceCommand(
                window.localStorage,
                scope,
                current,
                {
                  retryOfUncertainAttempt,
                  status: status?.status ?? null,
                  errorCode,
                },
              )
              setUncertain(false)
              localPending.current = null
              madeUncertainWrite.current = false
              refreshRecovery()
            }
            setError(message(writeError, "The result could not be confirmed."))
            refreshRecovery()
            if (status?.status !== "NOT_FOUND") {
              setRecoveryNotice(
                `Submission ${current.clientCommandId} remains unresolved. Retry only the exact same details.`,
              )
            }
          }
        })
      } catch (failure) {
        const text = message(
          failure,
          "Finance submission could not be started.",
        )
        setError(text)
        if (failure instanceof FinanceCommandRecoveryError) {
          setUncertain(true)
          refreshRecovery()
        }
      } finally {
        busy.current = false
        setPending(false)
      }
    },
    [
      client,
      complete,
      retainedCommandResolution,
      operation,
      ready,
      saved,
      scope,
      setRecoveryNotice,
      refreshRecovery,
      trpc,
    ],
  )

  return {
    pending,
    ready,
    saved,
    uncertain,
    error,
    recoveryMetadata,
    run,
  }
}
