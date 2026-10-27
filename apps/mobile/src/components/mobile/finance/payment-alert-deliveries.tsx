import { ActionButton } from "@/components/mobile/action-button"
import {
  StatusPill,
  type StatusPillTone,
} from "@/components/mobile/green-till/kit"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import {
  type AlertDeliveryStatus,
  alertChannel,
  channelName,
  deliveryBadge,
  retryingBadge,
} from "@ewatrade/utils/payment-alerts-view"
import { useMutation, useQueryClient } from "@tanstack/react-query"

export type PaymentAlertDelivery = {
  userId: string
  name: string
  channel: string
  status: AlertDeliveryStatus
  /**
   * Only the server decides: a definite failure, on a report still waiting, for an Owner or
   * Admin. Missing (an older server or a cached report) means no.
   */
  canRetry?: boolean
}

const PILL_TONES: Record<
  ReturnType<typeof deliveryBadge>["tone"],
  StatusPillTone
> = {
  bad: "danger",
  info: "info",
  none: "muted",
  ok: "ok",
  warn: "warn",
}

/**
 * "Payment alert · Email" on a payment review (Banking 02 v9): whether each chosen person's
 * alert went out. Names and states only, never a destination. Only an alert the server marks
 * retryable offers "Try again"; unconfirmed, sending and sent alerts never do.
 */
export function PaymentAlertDeliveries({
  reportId,
  deliveries: all,
}: {
  reportId: string
  /** Missing from an older server's or a cached report: nothing to show. */
  deliveries?: PaymentAlertDelivery[]
}) {
  const colors = useColors()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
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
  const title = `Payment alert · ${channelName(channel)}`
  return (
    <View
      accessibilityLabel="Payment alert delivery"
      className="gap-2 rounded-[14px] border border-border px-3 py-2.5"
    >
      <View className="flex-row items-center gap-1.5">
        <Icon
          className="size-[16px]"
          color={colors.foreground}
          name={channel === "email" ? "Mail" : "WhatsApp"}
        />
        <Text
          accessibilityRole="header"
          className="text-sm font-bold text-foreground"
        >
          {title}
        </Text>
      </View>
      {deliveries.map((row) => {
        const retrying =
          retry.isPending && retry.variables?.recipientUserId === row.userId
        const badge = retrying ? retryingBadge : deliveryBadge(row.status)
        return (
          <View
            key={row.userId}
            className="min-h-9 flex-row items-center gap-2"
          >
            <View
              accessible
              accessibilityLabel={`${row.name}: ${badge.label}`}
              className="min-w-0 flex-1 flex-row items-center justify-between gap-2"
            >
              <Text
                className="min-w-0 flex-1 text-sm text-foreground"
                numberOfLines={1}
              >
                {row.name}
              </Text>
              <StatusPill label={badge.label} tone={PILL_TONES[badge.tone]} />
            </View>
            {row.canRetry === true && !retrying ? (
              <ActionButton
                accessibilityLabel={`Try again for ${row.name}`}
                disabled={offline || retry.isPending}
                icon="RefreshCw"
                size="sm"
                variant="outline"
                onPress={() =>
                  retry.mutate({ reportId, recipientUserId: row.userId })
                }
              >
                Try again
              </ActionButton>
            ) : null}
          </View>
        )
      })}
      {retry.error ? (
        <Text accessibilityRole="alert" className="text-xs text-destructive">
          {retry.error.message}
        </Text>
      ) : null}
      {failed || unconfirmed ? (
        <Text className="text-xs text-muted-foreground">
          {`${failed ? "An alert couldn't be sent. " : ""}${unconfirmed ? "EwaTrade couldn't confirm one alert went out, so it won't send it again. " : ""}This payment is still in Payments to check.`}
        </Text>
      ) : null}
    </View>
  )
}
