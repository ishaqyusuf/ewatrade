"use client"
import { orderMoney } from "@/components/orders/order-draft"
import { useTRPC } from "@/trpc/client"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { Button, cn } from "@ewatrade/ui"
import { Alert02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { errorCode } from "./business-banking-model"
import {
  type ReceiptAssessment,
  type ReceiptExtraction,
  receiptCheckSummary,
  receiptExtractionRows,
  receiptFindingWords,
  receiptRetryOffered,
} from "./receipt-evidence-model"

/**
 * The saved receipt check beside the customer's claim. It helps the person
 * checking their bank; it never confirms money arrived, fills in what
 * arrived or stands in for "I checked the bank account".
 */
export function ReceiptEvidence({
  hasReceipt,
  assessment,
  extraction,
  retry,
}: {
  hasReceipt: boolean
  /** Missing from an older server, or null when nothing was checked. */
  assessment: ReceiptAssessment | null | undefined
  extraction: ReceiptExtraction | null | undefined
  /** An open report can ask for the check again; then its report is reread. */
  retry?: { reportId: string; onDone: () => Promise<unknown> }
}) {
  const current = assessment ?? null
  const summary = receiptCheckSummary(current, hasReceipt)
  if (!summary) return null
  const complete = current?.state === "complete" ? current : null
  const shown =
    complete && complete.amountMinor !== null && complete.currencyCode
      ? [
          `Receipt shows ${orderMoney(complete.amountMinor, complete.currencyCode)}`,
          complete.recipientLast4
            ? `to an account ending ${complete.recipientLast4}`
            : null,
        ]
          .filter(Boolean)
          .join(" ")
      : null
  const rows = extraction ? receiptExtractionRows(extraction) : []
  return (
    <section
      aria-label="Receipt check"
      className={cn(
        "grid gap-2 rounded-lg border px-3 py-2.5 text-sm",
        summary.tone === "review"
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-sky-500/30 bg-sky-500/5",
      )}
    >
      <p className="flex items-start gap-2">
        <HugeiconsIcon
          icon={summary.tone === "review" ? Alert02Icon : InformationCircleIcon}
          className="mt-0.5 size-4 shrink-0"
          aria-hidden
        />
        <span className="grid gap-0.5">
          <b className="font-medium">{summary.title}</b>
          <span className="text-muted-foreground">{summary.detail}</span>
        </span>
      </p>
      {shown ? <p>{shown}.</p> : null}
      {complete?.findings.length ? (
        <ul className="grid gap-1">
          {complete.findings.map((finding, index) => (
            <li
              key={`${finding.code}:${index}`}
              className={cn(
                "flex items-start gap-1.5",
                finding.severity === "review"
                  ? "text-amber-800 dark:text-amber-200"
                  : "text-muted-foreground",
              )}
            >
              <span aria-hidden>•</span>
              {receiptFindingWords(finding.code)}
            </li>
          ))}
        </ul>
      ) : null}
      {retry && receiptRetryOffered(current, hasReceipt) ? (
        <ReceiptCheckRetry {...retry} />
      ) : null}
      {rows.length ? (
        <details className="group">
          <summary className="cursor-pointer text-xs text-muted-foreground underline-offset-4 hover:underline">
            What the receipt shows
          </summary>
          <dl className="mt-2 grid gap-1 text-xs">
            {rows.map(([label, value]) => (
              <div
                key={label}
                className="grid grid-cols-[minmax(6rem,35%)_minmax(0,1fr)] gap-2"
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="min-w-0 break-words">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            Read from the customer’s receipt. Compare it with your bank app;
            nothing here is filled in for you.
          </p>
        </details>
      ) : null}
    </section>
  )
}

/**
 * Asks the saved receipt check to run again. Nothing here starts a payment
 * check or changes the payment: the reread report shows what was saved.
 */
function ReceiptCheckRetry({
  reportId,
  onDone,
}: {
  reportId: string
  onDone: () => Promise<unknown>
}) {
  const trpc = useTRPC()
  const context = useQuery(
    trpc.tenant.current.queryOptions(undefined, { retry: false }),
  )
  const role = normalizeRole(context.data?.membership.role)
  const allowed = context.isSuccess && role !== null && canManageTenant(role)
  const retry = useMutation(
    trpc.businessBanking.retryReportReceiptAssessment.mutationOptions({
      onSuccess: () => onDone(),
    }),
  )
  const failed = retry.error
    ? errorCode(retry.error) === "FORBIDDEN"
      ? "Receipt checks aren’t available with your current Finance access. Check your bank directly."
      : "The receipt couldn’t be checked again. Check your bank directly."
    : null
  const after = retry.data?.receiptAssessment
  if (!allowed) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={retry.isPending}
        onClick={() => {
          if (allowed) retry.mutate({ reportId })
        }}
      >
        {retry.isPending ? "Asking…" : "Check the receipt again"}
      </Button>
      <output aria-live="polite" className="text-xs text-muted-foreground">
        {failed ??
          (retry.isSuccess
            ? after?.state === "complete"
              ? "The receipt check finished. Review its saved details above."
              : after?.state === "pending" || after?.state === "checking"
                ? "Asked for another check. It may take a moment."
                : "No new receipt check is available. Check your bank directly."
            : "")}
      </output>
    </div>
  )
}
