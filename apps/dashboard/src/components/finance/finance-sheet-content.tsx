"use client"
import { FormFeedback } from "@/components/forms/form-feedback"

import { FinanceContent } from "@/components/finance/finance-content"
import { financeSheetTitles } from "@/components/finance/finance-sheet-header"
import { useFinanceForm } from "@/components/finance/form-context"
import { FinanceSupplierModalContent } from "@/components/modals/finance-supplier-modal-content"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useFinanceInvalidation } from "@/hooks/use-finance-invalidation"
import { useFinanceParams } from "@/hooks/use-finance-params"
import {
  FinanceCommandRecoveryError,
  acknowledgeCommittedFinanceCommand,
  acknowledgeSupersededCashCommand,
  clearPendingFinanceCommand,
  financeCommandStorageKey,
  hasRejectedFinanceCommandReceipt,
  readPendingFinanceCommand,
  supersededCashCommandRecord,
  withFinanceCommandInspectionLock,
  withFinanceCommandLock,
} from "@/lib/finance-command-recovery"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

type FinanceSheetContentProps = {
  closeError: string | null
  closeLockedRef: { current: boolean }
  onClose: () => Promise<void>
  storeId: string
}

const commandLabels: Record<string, string> = {
  importBankStatement: "bank statement import",
  matchBankStatement: "bank statement match",
  unmatchBankStatement: "bank statement release",
  recordExpense: "expense",
  payBill: "expense payment",
  reverseBillPayment: "payment reversal",
  voidExpense: "expense cancellation",
  recordMoney: "money movement",
  reverseMoney: "money movement reversal",
  recordCashCount: "cash count",
  adjustCashCount: "cash-count adjustment",
  cashAdjustmentReversal: "cash adjustment reversal",
  changePeriod: "period change",
  createSupplier: "supplier creation",
  recordSupplierOpening: "supplier opening",
  recordSupplierAdvance: "supplier advance",
  reverseSupplierEntry: "supplier entry reversal",
  reversePurchasePayment: "purchase payment reversal",
}

export function FinanceSheetContent({
  storeId,
  closeError,
  closeLockedRef,
  onClose,
}: FinanceSheetContentProps) {
  const {
    financeSheet,
    statementId,
    bankSourceEntryId,
    bankSourceAccountId,
    billId,
    countId,
    moneyEntryId,
    supplierId,
  } = useFinanceParams()
  const {
    actorUserId,
    locked,
    recoveryRefresh,
    recoveryAcknowledgement,
    recoveryNotice,
    refreshRecovery,
    setRecoveryAcknowledgement,
    setRecoveryNotice,
    tenantId,
  } = useFinanceForm()
  useEffect(() => {
    closeLockedRef.current = locked
  }, [closeLockedRef, locked])
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const invalidateFinance = useFinanceInvalidation()
  const book = useQuery(
    trpc.finance.book.queryOptions(undefined, {
      enabled: Boolean(financeSheet),
      retry: false,
    }),
  )

  useEffect(() => {
    if (recoveryRefresh < 0) return
    if (!financeSheet || !book.data?.id || typeof window === "undefined") return
    let active = true
    const scope = { actorUserId, tenantId, bookId: book.data.id }
    const key = financeCommandStorageKey(scope)
    async function inspect() {
      try {
        await withFinanceCommandInspectionLock(scope, async () => {
          if (!active) return
          const pending = readPendingFinanceCommand(window.localStorage, scope)
          if (!pending) {
            if (active) {
              setRecoveryAcknowledgement(null)
              setRecoveryNotice(null)
            }
            return
          }
          const current = readPendingFinanceCommand(window.localStorage, scope)
          if (
            !current ||
            current.clientCommandId !== pending.clientCommandId ||
            current.operation !== pending.operation ||
            current.payloadDigest !== pending.payloadDigest
          ) {
            throw new FinanceCommandRecoveryError(
              "The saved finance submission changed while recovery was starting.",
            )
          }
          const status = await queryClient.fetchQuery(
            trpc.finance.commandStatus.queryOptions(
              {
                bookId: current.bookId,
                clientCommandId: current.clientCommandId,
              },
              { staleTime: 0 },
            ),
          )
          if (!active) return
          const label = commandLabels[current.operation] ?? "finance action"
          const rejectedReceipt =
            status.status === "NOT_FOUND" &&
            hasRejectedFinanceCommandReceipt(window.localStorage, current)
          const sourceCountId = current.recoveryMetadata?.countId
          const completedCashRecord =
            status.status === "NOT_FOUND" &&
            !rejectedReceipt &&
            sourceCountId &&
            ["adjustCashCount", "cashAdjustmentReversal"].includes(
              current.operation,
            )
              ? supersededCashCommandRecord(
                  current,
                  await queryClient.fetchQuery(
                    trpc.finance.cashCount.queryOptions(
                      { bookId: current.bookId, countId: sourceCountId },
                      { staleTime: 0 },
                    ),
                  ),
                )
              : null
          if (!active) return
          if (
            status.status === "COMMITTED" ||
            completedCashRecord ||
            rejectedReceipt
          ) {
            const result = status.status === "COMMITTED" ? status.result : null
            const recordId =
              result &&
              typeof result === "object" &&
              !Array.isArray(result) &&
              typeof result.id === "string"
                ? result.id
                : null
            setRecoveryNotice(
              rejectedReceipt
                ? `Your ${label} was rejected. Acknowledge saved attempt ${current.clientCommandId}, then review corrected details before submitting again.`
                : completedCashRecord
                  ? `This ${label} is already completed by record ${completedCashRecord}. Acknowledge that record to resolve saved attempt ${current.clientCommandId}; no additional entry will be posted.`
                  : `Your ${label} was recorded.${recordId ? ` Record ${recordId}.` : ""} Reference ${current.clientCommandId}. Acknowledge this result before recording another action.`,
            )
            setRecoveryAcknowledgement(async () => {
              try {
                await withFinanceCommandLock(scope, async () => {
                  const latest = readPendingFinanceCommand(
                    window.localStorage,
                    scope,
                  )
                  if (
                    !latest ||
                    latest.clientCommandId !== current.clientCommandId ||
                    latest.operation !== current.operation ||
                    latest.payloadDigest !== current.payloadDigest
                  ) {
                    throw new FinanceCommandRecoveryError(
                      "The saved submission changed. Its recovery marker was not cleared.",
                    )
                  }
                  const latestStatus = await queryClient.fetchQuery(
                    trpc.finance.commandStatus.queryOptions(
                      {
                        bookId: latest.bookId,
                        clientCommandId: latest.clientCommandId,
                      },
                      { staleTime: 0 },
                    ),
                  )
                  if (latestStatus.status === "COMMITTED") {
                    acknowledgeCommittedFinanceCommand(
                      window.localStorage,
                      scope,
                      latest,
                      latestStatus.status,
                    )
                  } else if (
                    rejectedReceipt &&
                    hasRejectedFinanceCommandReceipt(
                      window.localStorage,
                      latest,
                    )
                  ) {
                    clearPendingFinanceCommand(
                      window.localStorage,
                      scope,
                      latest,
                    )
                  } else if (
                    completedCashRecord &&
                    latest.recoveryMetadata?.countId
                  ) {
                    const source = await queryClient.fetchQuery(
                      trpc.finance.cashCount.queryOptions(
                        {
                          bookId: latest.bookId,
                          countId: latest.recoveryMetadata.countId,
                        },
                        { staleTime: 0 },
                      ),
                    )
                    acknowledgeSupersededCashCommand(
                      window.localStorage,
                      scope,
                      latest,
                      source,
                      completedCashRecord,
                    )
                  } else {
                    throw new FinanceCommandRecoveryError(
                      "The saved result is still unresolved. Its submission identity remains.",
                    )
                  }
                })
                await invalidateFinance()
                setRecoveryAcknowledgement(null)
                setRecoveryNotice(null)
                refreshRecovery()
                await onClose()
              } catch (failure) {
                setRecoveryNotice(
                  failure instanceof Error
                    ? failure.message
                    : "The recorded result could not be acknowledged. Its recovery marker remains.",
                )
              }
            })
          } else {
            setRecoveryAcknowledgement(null)
            setRecoveryNotice(
              `Your ${label} is unresolved. Reference ${current.clientCommandId}. Re-enter only its exact original details to retry safely.`,
            )
          }
        })
      } catch (failure) {
        if (!active) return
        setRecoveryAcknowledgement(null)
        setRecoveryNotice(
          failure instanceof Error
            ? failure.message
            : "Saved submission status could not be checked. No new command was sent.",
        )
      }
    }
    void inspect()
    const handleStorage = (event: StorageEvent) => {
      if (event.key === key) void inspect()
    }
    window.addEventListener("storage", handleStorage)
    return () => {
      active = false
      window.removeEventListener("storage", handleStorage)
    }
  }, [
    actorUserId,
    book.data?.id,
    financeSheet,
    invalidateFinance,
    queryClient,
    recoveryRefresh,
    refreshRecovery,
    setRecoveryAcknowledgement,
    setRecoveryNotice,
    onClose,
    tenantId,
    trpc,
  ])
  const Frame =
    financeSheet === "supplier" ? FinanceSupplierModalContent : SheetFrame
  return (
    <Frame
      title={financeSheet ? financeSheetTitles[financeSheet] : "Finance"}
      description={
        locked
          ? "Keep this window open while the submission is confirmed."
          : undefined
      }
      closeDisabled={locked}
      popupClassName={
        financeSheet === "bank-statement" || financeSheet === "bank-import"
          ? "sm:w-[min(900px,100vw)] sm:max-w-[900px]"
          : undefined
      }
    >
      {closeError ? (
        <FormFeedback appearance="dashboard">{closeError}</FormFeedback>
      ) : null}
      {book.isPending ? (
        <output>Loading finance…</output>
      ) : book.isError ? (
        <FormFeedback appearance="dashboard">{book.error.message}</FormFeedback>
      ) : financeSheet ? (
        <>
          {recoveryNotice ? (
            <div className="mb-4 grid gap-2 text-sm" role="alert">
              <p className="text-destructive">{recoveryNotice}</p>
              {recoveryAcknowledgement ? (
                <Button
                  appearance="form"
                  className="w-fit"
                  disabled={locked}
                  onClick={() => void recoveryAcknowledgement()}
                >
                  Acknowledge saved result
                </Button>
              ) : null}
            </div>
          ) : null}
          <FinanceContent
            key={`${book.data?.id ?? "new"}:${financeSheet}:${statementId}:${bankSourceAccountId}:${bankSourceEntryId}:${billId}:${countId}:${moneyEntryId}:${supplierId}`}
            mode={financeSheet}
            book={book.data}
            statementId={statementId}
            bankSourceEntryId={bankSourceEntryId}
            bankSourceAccountId={bankSourceAccountId}
            billId={billId}
            countId={countId}
            moneyEntryId={moneyEntryId}
            supplierId={supplierId}
            storeId={storeId}
          />
        </>
      ) : null}
    </Frame>
  )
}
