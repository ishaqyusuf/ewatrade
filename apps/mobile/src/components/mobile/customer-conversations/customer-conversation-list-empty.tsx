import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { ActivityIndicator } from "react-native"
import { resolveCustomerConversationListEmptyPresentation } from "./customer-conversation-list-empty-presentation"

export function CustomerConversationListEmpty({
  credentialRejected,
  error,
  loading,
  onRetry,
  retrying = false,
}: {
  credentialRejected: boolean
  error: boolean
  loading: boolean
  onRetry: () => void
  retrying?: boolean
}) {
  const largeTextLayout = useLargeTextLayout()
  const presentation = resolveCustomerConversationListEmptyPresentation({
    credentialRejected,
    error,
    loading,
    retrying,
  })

  if (presentation.mode === "loading") {
    return (
      <View className="flex-1 items-center justify-center p-8">
        <ActivityIndicator accessibilityLabel="Loading conversations" />
      </View>
    )
  }
  if (presentation.mode === "hidden") return <View className="flex-1" />

  if (presentation.mode === "empty") {
    return (
      <View
        className={
          largeTextLayout
            ? "flex-1 items-center px-8 pt-14"
            : "flex-1 items-center px-8 pt-28"
        }
      >
        <View className="size-13 items-center justify-center rounded-full bg-primary/10">
          <Icon className="size-md text-primary" name={presentation.icon} />
        </View>
        <Text
          accessibilityRole="header"
          className="mt-4 text-center text-xl font-extrabold tracking-tight text-foreground"
        >
          {presentation.title}
        </Text>
        <Text className="mt-1.5 max-w-72 text-center text-sm leading-5 text-muted-foreground">
          {presentation.message}
        </Text>
        <View className="mt-4 flex-row items-center gap-1.5">
          <Icon className="size-sm text-primary" name="Link" />
          <Text className="text-xs font-bold text-primary">
            {presentation.sourceLabel}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View
      className={
        largeTextLayout
          ? "flex-1 items-center px-8 pt-14"
          : "flex-1 items-center px-8 pt-28"
      }
    >
      <View className="size-12 items-center justify-center rounded-full bg-warn/10">
        <Icon className="size-md text-warn" name={presentation.icon} />
      </View>
      <Text
        accessibilityRole="header"
        className="mt-4 text-center text-lg font-bold tracking-tight text-foreground"
      >
        {presentation.title}
      </Text>
      <Text className="mt-1.5 max-w-72 text-center text-sm leading-5 text-muted-foreground">
        {presentation.message}
      </Text>
      <Pressable
        accessibilityLabel={presentation.actionLabel}
        accessibilityRole="button"
        accessibilityState={{ busy: retrying, disabled: retrying }}
        className="mt-5 min-h-11 min-w-32 items-center justify-center rounded-xl bg-primary px-6 active:bg-primary/90 disabled:opacity-60"
        disabled={retrying}
        haptic
        onPress={onRetry}
        transition
      >
        {retrying ? (
          <ActivityIndicator
            accessibilityLabel="Retrying conversations"
            className="text-primary-foreground"
          />
        ) : (
          <Text className="text-sm font-bold text-primary-foreground">
            {presentation.actionLabel}
          </Text>
        )}
      </Pressable>
    </View>
  )
}
