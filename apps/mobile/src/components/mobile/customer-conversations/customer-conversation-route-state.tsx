import { EmptyState } from "@/components/mobile/empty-state"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { ActivityIndicator } from "react-native"

export function CustomerConversationRouteState({
  credentialRejected,
  loading,
  message,
  onRetry,
  unavailable,
}: {
  credentialRejected: boolean
  loading: boolean
  message: string | null
  onRetry: () => void
  unavailable: boolean
}) {
  if (unavailable) {
    return (
      <CenteredState>
        <EmptyState
          icon="TriangleAlert"
          message="Open a valid Store link or choose a saved conversation."
          title="Conversation link unavailable"
        />
      </CenteredState>
    )
  }
  if (loading) {
    return (
      <CenteredState>
        <ActivityIndicator accessibilityLabel="Opening Store conversation" />
        <Text className="text-center text-muted-foreground">
          Opening your secure Store conversation…
        </Text>
      </CenteredState>
    )
  }
  return (
    <CenteredState>
      <StatusBanner
        actionLabel={credentialRejected ? undefined : "Try again"}
        icon="RefreshCw"
        message={
          credentialRejected
            ? "This device's guest access cannot be recovered by phone or email. Sign in for conversations already linked to your account, or scan the Store QR code to start a new request."
            : (message ?? "Check your connection and try again.")
        }
        onActionPress={credentialRejected ? undefined : onRetry}
        title={
          credentialRejected
            ? "Personal session ended"
            : "Conversation unavailable"
        }
        tone="warning"
      />
    </CenteredState>
  )
}

function CenteredState({ children }: { children: React.ReactNode }) {
  return <View className="flex-1 justify-center gap-4 p-6">{children}</View>
}
