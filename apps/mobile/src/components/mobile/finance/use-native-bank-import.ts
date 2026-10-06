import { readFreshFinanceCommand } from "@/lib/finance-command-read"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import {
  onlineManager,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import {
  type NativeBankImportDraft,
  prepareNativeBankImportReview,
  submitNativeBankImportReview,
} from "./finance-bank-import-command"
import type { NativeFinanceBankStatementImportPreview } from "./finance-bank-import-state"
import type { FinanceWorkspace } from "./finance-workspace-gate"
import { useMobileFinanceCommand } from "./use-mobile-finance-command"

type Review = {
  preview: NativeFinanceBankStatementImportPreview
  generation: number
}

/** Used by the dedicated native import sheet; CSV/draft data never enters storage. */
export function useNativeBankImport(workspace: FinanceWorkspace) {
  const { book, actorUserId, tenantId } = workspace
  const trpc = useTRPC()
  const client = useQueryClient()
  const mutation = useMutation(
    trpc.finance.bankStatements.import.mutationOptions(),
  )
  const command = useMobileFinanceCommand({
    actorUserId,
    tenantId,
    bookId: book.id,
  })
  const [review, setReview] = useState<Review | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(false)
  const generation = useRef(0)
  const initialScope = useRef(
    JSON.stringify([actorUserId, tenantId, book.id, book.currencyCode]),
  )
  const currentScope = useRef(initialScope.current)
  currentScope.current = JSON.stringify([
    actorUserId,
    tenantId,
    book.id,
    book.currencyCode,
  ])

  function invalidate() {
    generation.current += 1
    setReview(null)
    setPreparing(false)
  }

  useEffect(() => {
    mounted.current = true
    const invalidateConnection = () => {
      generation.current += 1
      setReview(null)
      setPreparing(false)
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

  async function readSource(accountId: string, token: number) {
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
      currentBook.currencyCode !== book.currencyCode
    )
      throw new Error(
        "The active finance book changed. Reopen the import sheet.",
      )
    const account = currentBook.accounts.find(
      (candidate) =>
        candidate.id === accountId &&
        candidate.bookId === book.id &&
        candidate.kind === "ASSET" &&
        ["BANK", "CLEARING"].includes(candidate.purpose) &&
        candidate.archivedAt === null,
    )
    if (!account)
      throw new Error("Choose an active bank or clearing account in this book.")
    const history = await readFreshFinanceCommand(
      client,
      trpc.finance.bankStatements.history.queryOptions(
        { bookId: book.id, accountId, limit: 1 },
        { retry: false },
      ),
      current,
    )
    if (history.bookId !== book.id || history.accountId !== accountId)
      throw new Error(
        "The bank history no longer belongs to this finance scope.",
      )
    return {
      book: currentBook,
      account,
      bankRevision: history.snapshotRevision,
    }
  }

  async function prepare(draft: NativeBankImportDraft) {
    if (!command.ready || command.pending || preparing) return
    const token = ++generation.current
    setPreparing(true)
    setReview(null)
    setError(null)
    try {
      const preview = await prepareNativeBankImportReview({
        draft,
        readSource: () => readSource(draft.selectedAccountId, token),
        retained: command.retained?.command,
        isCurrent: () => isCurrent(token),
      })
      if (isCurrent(token)) setReview({ preview, generation: token })
    } catch (failure) {
      if (isCurrent(token))
        setError(
          failure instanceof Error
            ? failure.message
            : "Review the statement details.",
        )
    } finally {
      if (isCurrent(token)) setPreparing(false)
    }
  }

  async function confirm() {
    if (!review || preparing || command.pending || !command.ready) return false
    const attempt = review
    setError(null)
    try {
      const recorded = await submitNativeBankImportReview({
        preview: attempt.preview,
        readSource: () =>
          readSource(attempt.preview.accountId, attempt.generation),
        isCurrent: () => isCurrent(attempt.generation),
        run: (operation, payload, write, options) =>
          command.run(
            operation,
            payload,
            write,
            "Bank statement imported. Original rows retained.",
            options?.recoveryMetadata,
          ),
        write: (payload) => mutation.mutateAsync(payload),
      })
      if (recorded && isCurrent(attempt.generation)) {
        invalidate()
        return true
      }
    } catch (failure) {
      if (isCurrent(attempt.generation))
        setError(
          failure instanceof Error
            ? failure.message
            : "The import could not be confirmed.",
        )
    }
    return false
  }

  return { command, review, preparing, error, prepare, confirm, invalidate }
}
