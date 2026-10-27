import { useTRPC } from "@/trpc/client"
import { Badge, Button, cn } from "@ewatrade/ui"
import {
  type AlertDeliveryStatus,
  alertChannel,
  channelName,
  deliveryBadge,
  retryingBadge,
} from "@ewatrade/utils/payment-alerts-view"
import {
  Mail01Icon,
  RefreshIcon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

export type PaymentAlertDelivery = {
  userId: string
  name: string
  channel: string
  status: AlertDeliveryStatus
  /**
   * Only the server decides: a definite failure, on a report still waiting, for an Owner or
   * Admin. Missing (an older server) means no.
   */
  canRetry?: boolean
}

/**
 * "Payment alert · Email": whether each chosen person's alert for this report went out (Banking
 * 02 v9). Names and states only, never a destination or provider detail. Only an alert the
 * server marks retryable offers "Try again"; unconfirmed, sending and sent alerts never do.
 */
export function PaymentAlertDeliveries({
  reportId,
  deliveries: all,
}: {
  reportId: string
  /** Missing from an older server's report: nothing to show. */
  deliveries?: PaymentAlertDelivery[]
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const retry = useMutation(
    trpc.businessBanking.retryAlert.mutationOptions({
      // Stay pending until the report shows the alert's new state.
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.businessBanking.report.queryKey({ reportId }),
        }),
    }),
  )
  // One channel per account, so one header; an unknown channel isn't shown.
  const deliveries = (all ?? []).filter((row) => alertChannel(row.channel))
  const channel = alertChannel(deliveries[0]?.channel)
  if (!channel) return null
  const failed = deliveries.some((row) => row.status === "failed")
  const unconfirmed = deliveries.some((row) => row.status === "unknown")
  return (
    <section
      aria-label="Payment alert delivery"
      className="grid gap-2 rounded-lg border border-border p-3 text-sm"
    >
      <header className="flex items-center gap-1.5 font-medium">
        <HugeiconsIcon
          icon={channel === "email" ? Mail01Icon : WhatsappIcon}
          className="size-4"
          aria-hidden
        />
        Payment alert · {channelName(channel)}
      </header>
      <ul className="grid gap-1.5">
        {deliveries.map((row) => {
          const retrying =
            retry.isPending && retry.variables?.recipientUserId === row.userId
          const badge = retrying ? retryingBadge : deliveryBadge(row.status)
          return (
            <li key={row.userId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              <Badge
                variant="outline"
                className={cn(
                  badge.tone === "ok" &&
                    "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
                  badge.tone === "bad" &&
                    "border-destructive/50 text-destructive",
                  badge.tone === "warn" &&
                    "border-amber-500/40 text-amber-700 dark:text-amber-400",
                  badge.tone === "none" && "text-muted-foreground",
                )}
              >
                {badge.label}
              </Badge>
              {row.canRetry === true && !retrying ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={retry.isPending}
                  onClick={() =>
                    retry.mutate({ reportId, recipientUserId: row.userId })
                  }
                >
                  <HugeiconsIcon icon={RefreshIcon} aria-hidden />
                  Try again
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>
      {retry.error ? (
        <p role="alert" className="text-xs text-destructive">
          {retry.error.message}
        </p>
      ) : null}
      {failed || unconfirmed ? (
        <p className="text-xs text-muted-foreground">
          {failed ? "An alert couldn't be sent. " : ""}
          {unconfirmed
            ? "EwaTrade couldn't confirm one alert went out, so it won't send it again. "
            : ""}
          This payment is still in Payments to check.
        </p>
      ) : null}
    </section>
  )
}
