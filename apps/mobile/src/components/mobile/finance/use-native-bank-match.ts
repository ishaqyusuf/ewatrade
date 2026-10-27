import { readFreshFinanceCommand } from "@/lib/finance-command-read"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import {
  onlineManager,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  isNativeBankStaleRefusal,
  nativeBankMatchRecovery,
  prepareNativeBankMatchReview,
  submitNativeBankMatchReview,
} from "./finance-bank-match-command"
import type { NativeBankMatchAction } from "./finance-bank-match-state"
import { validateNativeBankStatementDetail } from "./finance-bank-read-state"
import type { FinanceWorkspace } from "./finance-workspace-gate"
import { useMobileFinanceCommand } from "./use-mobile-finance-command"

/**
 * Match / unmatch on one native statement. Every step reads fresh, checks the
 * current owner/admin scope and connection, and sends through the shared
 * finance command runner. Reasons never enter storage.
 */
export function useNativeBankMatch(
  workspace: FinanceWorkspace,
  scope: { accountId: string; statementId: string },
) {
  const { book, actorUserId, tenantId } = workspace
  const { accountId, statementId } = scope
  const trpc = useTRPC()
  const client = useQueryClient()
  const matching = useMutation(
    trpc.finance.bankStatements.match.mutationOptions(),
  )
  const releasing = useMutation(
    trpc.finance.bankStatements.unmatch.mutationOptions(),
  )
  const command = useMobileFinanceCommand({
    actorUserId,
    tenantId,
    bookId: book.id,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const mounted = useRef(false)
  const generation = useRef(0)
  const scopeKey = JSON.stringify([
    actorUserId,
    tenantId,
    book.id,
    book.currencyCode,
    accountId,
    statementId,
  ])
  const initialScope = useRef(scopeKey)
  const currentScope = useRef(scopeKey)
  currentScope.current = scopeKey

  useEffect(() => {
    mounted.current = true
    const invalidateConnection = () => {
      generation.current += 1
      setBusy(false)
    }
    const unsubscribeMode = useOperationalModeStore.subscribe((next, prior) => {
      if (next.isOfflineMode !== prior.isOfflineMode) invalidateConnection()
    })
    const unsubscribeOnline = onlineManager.subscribe(invalidateConnection)
    return () => {
      mounted.current = false
      generation.current += 1
      unsubscribeMode()
      unsubscribeOnline()
    }
  }, [])

  function isCurrent(token: number) {
    const profile = getSession()?.profile
    return (
      mounted.current &&
      generation.current === token &&
      currentScope.current === initialScope.current &&
      profile?.id === actorUserId &&
      profile.businessId === tenantId &&
      ["OWNER", "ADMIN"].includes(profile.role?.trim().toUpperCase() ?? "") &&
      !useOperationalModeStore.getState().isOfflineMode &&
      onlineManager.isOnline()
    )
  }

  async function readSource(token: number) {
    const current = () => isCurrent(token)
    const currentBook = await readFreshFinanceCommand(
      client,
      trpc.finance.book.queryOptions(undefined, { retry: false }),
      current,
    )
    if (
      !currentBook ||
      currentBook.id !== book.id ||
      currentBook.tenantId !== tenantId ||
      currentBook.currencyCode !== book.currencyCode ||
      !currentBook.accounts.some(
        (account) =>
          account.id === accountId &&
          account.bookId === book.id &&
          account.kind === "ASSET" &&
          ["BANK", "CLEARING"].includes(account.purpose) &&
          account.archivedAt === null,
      )
    )
      throw new Error("The money account changed. Open this statement again.")
    const detail = await readFreshFinanceCommand(
      client,
      trpc.finance.bankStatements.get.queryOptions(
        { bookId: book.id, statementId },
        { retry: false },
      ),
      current,
    )
    return validateNativeBankStatementDetail({
      detail,
      bookId: book.id,
      currencyCode: book.currencyCode,
      accountId,
      statementId,
      bookStartsAt: currentBook.startsAt,
    })
  }

  async function readMatchEvent(token: number, matchRevision: string) {
    const history = await readFreshFinanceCommand(
      client,
      trpc.finance.bankStatements.history.queryOptions(
        {
          bookId: book.id,
          accountId,
          snapshotRevision: matchRevision,
          limit: 1,
        },
        { retry: false },
      ),
      () => isCurrent(token),
    )
    const event = history.items[0]
    if (history.bookId !== book.id || history.accountId !== accountId || !event)
      throw new Error("We couldn't check the original match.")
    return event
  }

  /** The saved, unconfirmed match on this statement, if any. */
  let recovery: ReturnType<typeof nativeBankMatchRecovery> = null
  let recoveryError: string | null = null
  try {
    recovery = nativeBankMatchRecovery(command.retained?.command, scope)
  } catch (failure) {
    recoveryError =
      failure instanceof Error
        ? failure.message
        : "Check the earlier submission first."
  }

  const clearStale = useCallback(() => setStale(false), [])
  const clearError = useCallback(() => setError(null), [])

  function invalidate() {
    generation.current += 1
    setBusy(false)
    setError(null)
  }

  /**
   * One tap on the sheet: fresh read and exact group check against the
   * revisions on screen, then the command. A saved retry keeps its own
   * revisions and selection; only the reason is typed again.
   */
  async function submit(
    action: NativeBankMatchAction,
    reason: string,
    reviewed: { expectedRevision: string; expectedSnapshotSequence: string },
  ) {
    if (!command.ready || command.pending || busy) return false
    const token = ++generation.current
    setBusy(true)
    setError(null)
    try {
      const review = await prepareNativeBankMatchReview({
        action,
        reason,
        bookId: book.id,
        accountId,
        statementId,
        retained: command.retained?.command,
        reviewed,
        readSource: () => readSource(token),
        readMatchEvent: (revision) => readMatchEvent(token, revision),
        isCurrent: () => isCurrent(token),
      })
      if (!isCurrent(token)) return false
      const recorded = await submitNativeBankMatchReview({
        review,
        readSource: () => readSource(token),
        readMatchEvent: (revision) => readMatchEvent(token, revision),
        isCurrent: () => isCurrent(token),
        onStale: () => {
          if (mounted.current) setStale(true)
        },
        run: (operation, payload, write, options) =>
          command.run(
            operation,
            payload,
            write,
            review.action.kind === "MATCH"
              ? "Matched. No money moved."
              : "Unmatched. The rows are back in Needs a match.",
            options?.recoveryMetadata,
          ),
        write: {
          match: (payload) => matching.mutateAsync(payload),
          unmatch: (payload) => releasing.mutateAsync(payload),
        },
      })
      return recorded === true && isCurrent(token)
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : "Check this match."
      if (mounted.current && isNativeBankStaleRefusal(message)) setStale(true)
      if (isCurrent(token)) setError(message)
      return false
    } finally {
      if (mounted.current && generation.current === token) setBusy(false)
    }
  }

  return {
    command,
    busy: busy || command.pending,
    error,
    stale,
    clearStale,
    clearError,
    recovery,
    recoveryError,
    submit,
    invalidate,
  }
}
