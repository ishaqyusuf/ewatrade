"use client"

import { useTRPC } from "@/trpc/client"
import { cn } from "@/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { ReactNode } from "react"
import type { PublicReportStatus } from "./payment-format"
import { cardClass } from "./payment-parts"
import {
  type ReceiptCheckStage,
  type ReceiptCheckTone,
  receiptCheckView,
} from "./receipt-assessment"

const toneBorder: Record<ReceiptCheckTone, string> = {
  info: "border-l-info-border",
  wait: "border-l-warning-border",
  warn: "border-l-warning",
}

/**
 * The automatic receipt check, before the final submit (draft) or while the business is checking
 * a report. Evidence only: it never confirms a payment or submits anything, and "Check again" asks
 * the server to retry the same receipt check.
 */
export function ReceiptCheck({
  reportToken,
  status,
  businessName,
  accountNumber,
  hasReceipt,
  stage = "submitted",
  timedOut = false,
  inline = false,
  children,
  onRetry,
}: {
  reportToken: string
  status: PublicReportStatus
  businessName: string
  accountNumber: string
  hasReceipt: boolean
  stage?: ReceiptCheckStage
  timedOut?: boolean
  /** Inside the "I have paid" step rather than a card of its own. */
  inline?: boolean
  /** Explicit choices the customer can make about the check. */
  children?: ReactNode
  onRetry?: () => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const statusKey = trpc.businessBanking.reportStatus.queryKey({ reportToken })
  const retry = useMutation({
    ...trpc.businessBanking.retryReceiptAssessment.mutationOptions(),
    onSuccess: () => onRetry?.(),
    // The status read is the only source of what the check now says.
    onSettled: () => queryClient.invalidateQueries({ queryKey: statusKey }),
  })
  const view = receiptCheckView({
    assessment: status.receiptAssessment,
    hasReceipt,
    businessName,
    claimedAmountMinor: status.claimedAmountMinor,
    currencyCode: status.currencyCode,
    accountNumber,
    stage,
    timedOut,
  })
  if (!view) return null
  return (
    <section
      className={cn(
        !inline && cardClass,
        "flex flex-col gap-1 border-l-4 px-3.5 py-3 text-sm leading-relaxed",
        inline && "rounded-xl bg-muted/50",
        toneBorder[view.tone],
      )}
      aria-live="polite"
    >
      <b>{view.title}</b>
      {view.points.length ? (
        <ul className="list-disc pl-4.5 text-foreground">
          {view.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      ) : null}
      <span className="text-muted-foreground">{view.body}</span>
      {children}
      {view.canRetry ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-2.5 text-[13px] font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60"
            disabled={retry.isPending}
            onClick={() => retry.mutate({ reportToken })}
          >
            {retry.isPending ? "Checking again…" : "Check again"}
          </button>
          {retry.isError ? (
            <span role="alert" className="text-[13px] text-destructive">
              Couldn't start the check. {businessName} can still check it.
            </span>
          ) : retry.isSuccess &&
            retry.data.receiptAssessment?.state === "unavailable" ? (
            <span className="text-[13px] text-muted-foreground">
              The check is still unavailable.
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
