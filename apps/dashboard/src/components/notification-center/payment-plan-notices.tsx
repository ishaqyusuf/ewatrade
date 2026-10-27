"use client"

import { formatReportTime } from "@/components/business-banking/payment-report-review"
import { useTRPC } from "@/trpc/client"
import {
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { Button, cn } from "@ewatrade/ui"
import {
  type NoticeReview,
  noticeReview,
  noticeTone,
} from "@ewatrade/utils/payment-alerts-view"
import {
  Alert02Icon,
  InformationCircleIcon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"

/**
 * Payment alert plan changes for this Business (Banking 02 v9): one notice per plan revision,
 * naming what changed and what happens next. In-app only; never a payment claim. Each mounted
 * consumer owns its read, like Payments to check.
 */
export function usePaymentPlanNotices() {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  return useQuery(
    mountOwnedRead(
      trpc.businessBanking.notificationChanges.queryOptions(
        { limit: 5 },
        {
          retry: false,
          staleTime: 0,
          gcTime: 0,
          refetchOnMount: "always",
          refetchInterval: 60_000,
          trpc: { abortOnUnmount: true },
        },
      ),
      mount,
    ),
  )
}

/**
 * Review settings opens the exact bank account only when the notice names one account in the
 * book Money accounts opens on; otherwise it opens Money accounts and says what to check.
 */
function reviewHref(review: NoticeReview) {
  return review.kind === "account"
    ? `/finance/accounts?financeSheet=bank-details&paymentAccountId=${encodeURIComponent(review.accountId)}`
    : "/finance/accounts"
}

const TONE = {
  bad: {
    box: "border-destructive/40 bg-destructive/5",
    icon: "text-destructive",
  },
  warn: {
    box: "border-amber-500/30 bg-amber-500/5",
    icon: "text-amber-700 dark:text-amber-300",
  },
  info: { box: "border-border bg-muted/40", icon: "text-muted-foreground" },
} as const

/** Unread plan-change notices, in the bell or at the top of Money accounts. */
export function PaymentPlanNotices({
  timeZone,
  onNavigate,
  appearance,
  bookId,
}: {
  timeZone: string
  onNavigate?: () => void
  appearance: "bell" | "page"
  /** The book Money accounts is showing; read here when not given. */
  bookId?: string
}) {
  const trpc = useTRPC()
  const notices = usePaymentPlanNotices()
  // The book Money accounts opens on. Unknown (loading, no access) never deep-links.
  const book = useQuery(
    trpc.finance.book.queryOptions(undefined, {
      enabled: bookId === undefined,
      retry: false,
    }),
  )
  const currentBookId = bookId ?? book.data?.id
  const dismiss = useMutation(
    trpc.businessBanking.markNotificationChangesRead.mutationOptions({
      onSettled: () => void notices.refetch(),
    }),
  )
  const items = notices.isSuccess
    ? notices.data.items.filter((item) => !item.readAt)
    : []
  if (!items.length) return null
  return (
    <section
      aria-label="Payment alert plan changes"
      className={cn(
        "grid gap-2",
        appearance === "bell" && "border-b px-3.5 py-2.5",
      )}
    >
      {appearance === "bell" ? (
        <p className="text-xs font-medium text-muted-foreground">
          Payment alerts
        </p>
      ) : null}
      {items.map((item) => {
        const tone = noticeTone(item.kind)
        const review = noticeReview(item, currentBookId)
        return (
          <article
            key={item.id}
            aria-labelledby={`plan-notice-${item.id}`}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border p-3 text-sm",
              TONE[tone].box,
            )}
          >
            <HugeiconsIcon
              icon={
                item.kind === "whatsapp_available"
                  ? WhatsappIcon
                  : tone === "info"
                    ? InformationCircleIcon
                    : Alert02Icon
              }
              className={cn("mt-0.5 size-4 shrink-0", TONE[tone].icon)}
              aria-hidden
            />
            <span className="grid min-w-0 flex-1 gap-1">
              <b id={`plan-notice-${item.id}`} className="font-medium">
                {item.title}
              </b>
              <span className="whitespace-pre-line">{item.description}</span>
              <small className="text-xs text-muted-foreground">
                Plan updated {formatReportTime(item.createdAt, timeZone)}
              </small>
              {review.kind === "accounts" ? (
                <span className="text-xs text-muted-foreground">
                  {review.message}
                </span>
              ) : null}
              <span className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  render={
                    <Link href={reviewHref(review)} onClick={onNavigate} />
                  }
                >
                  {review.kind === "account"
                    ? "Review settings"
                    : "Open Money accounts"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={dismiss.isPending}
                  onClick={() => dismiss.mutate({ ids: [item.id] })}
                >
                  Dismiss
                </Button>
              </span>
            </span>
          </article>
        )
      })}
    </section>
  )
}
