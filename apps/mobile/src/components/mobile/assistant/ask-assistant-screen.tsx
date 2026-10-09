import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ActionButton } from "../action-button"
import { StatusBanner } from "../status-banner"
import { AskAssistantQa } from "./ask-assistant-qa"
import { AssistantHeader } from "./assistant-ui"
export function AskAssistantScreen() {
  const { qaState, view } = useLocalSearchParams<{
    qaState?: string
    view?: string
  }>()
  if (
    __DEV__ &&
    qaState &&
    [
      "normal",
      "loading",
      "offline",
      "allowance",
      "outage",
      "manager",
      "rep",
      "noaccess",
    ].includes(qaState)
  )
    return <AskAssistantQa state={qaState} initialView={view} />
  return <AskAssistantUnavailable />
}
function AskAssistantUnavailable() {
  const trpc = useTRPC()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const availability = useQuery(
    trpc.assistant.availability.queryOptions(undefined, {
      enabled: !offline,
      retry: false,
    }),
  )
  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <View className="flex-1 bg-background">
        <AssistantHeader title="Ask ẸwáTrade" />
        <View className="gap-4 px-[18px] py-4">
          {availability.isPending && !offline ? (
            <Skeleton className="h-32 rounded-[18px]" />
          ) : (
            <StatusBanner
              title="Assistant unavailable"
              message={
                offline
                  ? "Reconnect to check assistant availability."
                  : availability.isError
                    ? "Availability could not load. Try again."
                    : "Ask ẸwáTrade is being prepared for this business. You can search saved records or use the existing forms."
              }
              tone="warning"
            />
          )}
          <ActionButton
            variant="outline"
            onPress={() => router.push("/global-search")}
          >
            Open search
          </ActionButton>
          <ActionButton
            variant="outline"
            onPress={() => router.push("/create-sale-modal")}
          >
            Start a sale
          </ActionButton>
          {availability.isError && !offline ? (
            <ActionButton
              variant="ghost"
              onPress={() => void availability.refetch()}
            >
              Try again
            </ActionButton>
          ) : null}
          <Text className="text-xs text-muted-foreground">
            Nothing has been sent to the assistant or changed in your business.
          </Text>
        </View>
      </View>
    </View>
  )
}
