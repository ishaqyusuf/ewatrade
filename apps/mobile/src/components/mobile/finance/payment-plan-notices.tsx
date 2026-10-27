import { StatusBanner } from "@/components/mobile/status-banner"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { noticeReview, noticeTone } from "@ewatrade/utils/payment-alerts-view"
import { useMutation, useQuery } from "@tanstack/react-query"
import { View } from "react-native"

const TONE = {
  bad: { tone: "destructive", icon: "TriangleAlert" },
  warn: { tone: "warning", icon: "TriangleAlert" },
  info: { tone: "primary", icon: "Info" },
} as const

/**
 * Payment alert plan changes for this Business (Banking 02 v9): one notice per plan revision,
 * naming what changed and what happens next. In-app only, never a payment claim. Review
 * settings opens the exact bank account only when the notice names one account in this book;
 * otherwise it says what to check here on Money accounts instead of guessing one.
 */
export function PaymentPlanNotices({
  bookId,
  onReview,
}: {
  /** The book Money accounts is showing. */
  bookId: string
  onReview: (accountId: string) => void
}) {
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const trpc = useTRPC()
  const notices = useQuery(
    trpc.businessBanking.notificationChanges.queryOptions(
      { limit: 5 },
      {
        retry: false,
        staleTime: 0,
        refetchOnMount: "always",
        enabled: !offline,
      },
    ),
  )
  const dismiss = useMutation(
    trpc.businessBanking.markNotificationChangesRead.mutationOptions({
      onSettled: () => void notices.refetch(),
    }),
  )
  const items = notices.isSuccess
    ? notices.data.items.filter((item) => !item.readAt)
    : []
  if (offline || !items.length) return null
  return (
    <View className="gap-2">
      {items.map((item) => {
        const look = TONE[noticeTone(item.kind)]
        const review = noticeReview(item, bookId)
        return (
          <StatusBanner
            key={item.id}
            icon={look.icon}
            tone={look.tone}
            title={item.title}
            message={
              review.kind === "accounts"
                ? `${item.description}\n${review.message}`
                : item.description
            }
            actionLabel={
              review.kind === "account" ? "Review settings" : undefined
            }
            onActionPress={
              review.kind === "account"
                ? () => onReview(review.accountId)
                : undefined
            }
            linkLabel="Dismiss"
            onLinkPress={
              dismiss.isPending
                ? undefined
                : () => dismiss.mutate({ ids: [item.id] })
            }
          />
        )
      })}
    </View>
  )
}
