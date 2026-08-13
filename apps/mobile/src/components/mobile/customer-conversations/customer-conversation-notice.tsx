import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

type Requests =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationTimeline"]["requests"]

export function CustomerConversationNotice({
  canLoadOlder,
  loadingOlder,
  message,
  onDismiss,
  onLoadOlder,
  requests,
}: {
  canLoadOlder: boolean
  loadingOlder: boolean
  message: string | null
  onDismiss: () => void
  onLoadOlder: () => void
  requests: Requests
}) {
  return (
    <View className="gap-3 pb-2">
      {message ? (
        <StatusBanner
          actionLabel="Dismiss"
          message={message}
          onActionPress={onDismiss}
          tone="warning"
        />
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
        <View className="gap-2 rounded-2xl border border-border bg-card p-3">
          <Text className="font-bold text-foreground">Requests</Text>
          {requests.map((request) => (
            <View className="flex-row justify-between gap-3" key={request.id}>
              <Text
                className="flex-1 text-sm text-foreground"
                numberOfLines={1}
              >
                {request.label}
              </Text>
              <Text className="text-xs capitalize text-muted-foreground">
                {request.status.replaceAll("_", " ")}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}
