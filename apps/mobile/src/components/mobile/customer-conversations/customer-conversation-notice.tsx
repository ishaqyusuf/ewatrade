import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { projectCustomerConversationAvailability } from "./customer-conversation-availability-presentation"
import { projectCustomerConversationNotice } from "./customer-conversation-notice-presentation"
import { projectCustomerConversationRestriction } from "./customer-conversation-restriction-presentation"

type Requests =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationTimeline"]["requests"]
type Availability =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationTimeline"]["availability"]
type Moderation =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationTimeline"]["conversation"]["moderation"]

export function CustomerConversationNotice({
  availability,
  canLoadOlder,
  loadingOlder,
  moderation,
  onLoadOlder,
  onRecover,
  requests,
}: {
  availability: Availability
  canLoadOlder: boolean
  loadingOlder: boolean
  moderation: Moderation
  onLoadOlder: () => void
  onRecover?: () => void
  requests: Requests
}) {
  const availabilityPresentation = projectCustomerConversationAvailability({
    available: availability.available,
    customerMessage: availability.customerMessage,
    hasUnsentDraft: false,
    reopensAt: availability.reopensAt,
  })
  const restrictionPresentation =
    projectCustomerConversationRestriction(moderation)

  return (
    <View className="gap-3 pb-2">
      {restrictionPresentation ? (
        <View
          accessible={!restrictionPresentation.recoveryAction}
          accessibilityLabel={restrictionPresentation.accessibilityLabel}
          accessibilityLiveRegion="polite"
          className="min-h-16 flex-row items-start gap-3 border-y border-warn/30 py-3"
        >
          <View className="size-9 shrink-0 items-center justify-center rounded-full bg-warn/15">
            <Icon className="size-sm text-warn" name="ShieldCheck" />
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-sm font-bold text-foreground">
              {restrictionPresentation.title}
            </Text>
            <Text className="text-xs leading-4 text-muted-foreground">
              {restrictionPresentation.detail}
            </Text>
            {restrictionPresentation.recoveryAction && onRecover ? (
              <Pressable
                accessibilityLabel={restrictionPresentation.recoveryLabel}
                accessibilityRole="button"
                className="min-h-11 self-start justify-center rounded-full border border-warn/40 px-4 active:bg-warn/10"
                haptic
                onPress={onRecover}
              >
                <Text className="text-xs font-bold text-warn">
                  {restrictionPresentation.recoveryLabel}
                </Text>
              </Pressable>
            ) : (
              <Text className="pt-0.5 text-[11px] font-bold uppercase tracking-wide text-warn">
                {restrictionPresentation.recoveryLabel}
              </Text>
            )}
          </View>
        </View>
      ) : null}
      {availabilityPresentation ? (
        <View
          accessibilityLabel={availabilityPresentation.accessibilityLabel}
          accessibilityLiveRegion="polite"
          className="min-h-16 flex-row items-center gap-2.5 rounded-2xl border border-warn/30 bg-warn/10 px-2.5 py-2"
        >
          <View className="size-9 shrink-0 items-center justify-center rounded-full bg-warn/10">
            <Icon
              className="size-sm text-warn"
              name={availabilityPresentation.icon}
            />
          </View>
          <View className="min-w-0 flex-1">
            <Text
              className="text-sm font-bold text-foreground"
              numberOfLines={1}
            >
              {availabilityPresentation.title}
            </Text>
            <Text
              className="text-xs leading-4 text-muted-foreground"
              numberOfLines={2}
            >
              {availabilityPresentation.detail}
            </Text>
          </View>
        </View>
      ) : null}
      {canLoadOlder ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-11 items-center justify-center rounded-full border border-border"
          disabled={loadingOlder}
          onPress={onLoadOlder}
        >
          <Text className="text-sm font-bold text-foreground">
            {loadingOlder ? "Loading…" : "Load older messages"}
          </Text>
        </Pressable>
      ) : null}
      {requests.length > 0 ? (
        <View
          accessibilityLabel={`${requests.length} conversation ${requests.length === 1 ? "request" : "requests"}`}
          className="gap-2 rounded-xl bg-muted px-3 py-2.5"
        >
          {requests.map((request) => (
            <View
              className="min-h-9 flex-row items-center gap-3"
              key={request.id}
            >
              <View className="size-2 rounded-full bg-primary" />
              <View className="min-w-0 flex-1">
                <Text
                  className="text-sm font-bold text-foreground"
                  numberOfLines={1}
                >
                  {request.label}
                </Text>
                <Text
                  className="text-xs capitalize text-muted-foreground"
                  numberOfLines={1}
                >
                  {request.status.replaceAll("_", " ")}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const transientNoticeContainerClasses = {
  muted: "border-border bg-muted/60",
  success: "border-success/30 bg-success/10",
  warning: "border-warn/30 bg-warn/10",
} as const

const transientNoticeIconClasses = {
  muted: "bg-background/70 text-muted-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warn/10 text-warn",
} as const

export function CustomerConversationTransientNotice({
  message,
  onDismiss,
  soundEnabled,
  storeName,
}: {
  message: string
  onDismiss: () => void
  soundEnabled: boolean
  storeName: string
}) {
  const presentation = projectCustomerConversationNotice({
    message,
    soundEnabled,
    storeName,
  })

  return (
    <View
      accessibilityLiveRegion="polite"
      className={cn(
        "min-h-14 flex-row items-center gap-2 rounded-2xl border py-1.5 pl-2.5 pr-1.5",
        transientNoticeContainerClasses[presentation.tone],
      )}
    >
      <View
        className={cn(
          "size-9 shrink-0 items-center justify-center rounded-full",
          transientNoticeIconClasses[presentation.tone],
        )}
      >
        <Icon className="size-sm" name={presentation.icon} />
      </View>
      <View
        accessible
        accessibilityLabel={[presentation.title, presentation.detail]
          .filter(Boolean)
          .join(". ")}
        className="min-w-0 flex-1"
      >
        {presentation.title ? (
          <Text className="text-sm font-bold text-foreground" numberOfLines={1}>
            {presentation.title}
          </Text>
        ) : null}
        <Text className="text-xs text-muted-foreground" numberOfLines={2}>
          {presentation.detail}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={presentation.dismissLabel}
        accessibilityRole="button"
        className="size-11 shrink-0 items-center justify-center rounded-full active:bg-background/70"
        haptic
        onPress={onDismiss}
        transition
      >
        <Icon className="size-sm text-muted-foreground" name="X" />
      </Pressable>
    </View>
  )
}
