import { EmptyState } from "@/components/mobile/empty-state"
import { StatusBanner } from "@/components/mobile/status-banner"
import { ActivityIndicator, View } from "react-native"

export function CustomerConversationListEmpty({
  credentialRejected,
  error,
  loading,
  onRetry,
}: {
  credentialRejected: boolean
  error: boolean
  loading: boolean
  onRetry: () => void
}) {
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center p-8">
        <ActivityIndicator accessibilityLabel="Loading conversations" />
      </View>
    )
  }
  if (error) {
    return (
      <View className="flex-1 justify-center p-6">
        <StatusBanner
          actionLabel={credentialRejected ? undefined : "Try again"}
          icon="RefreshCw"
          message={
            credentialRejected
              ? "Scan a Store QR code or open a Store link to start again."
              : "Check your connection, then reload your conversations."
          }
          onActionPress={credentialRejected ? undefined : onRetry}
          title={
            credentialRejected
              ? "Personal session ended"
              : "Conversations unavailable"
          }
          tone="warning"
        />
      </View>
    )
  }
  return (
    <View className="flex-1 justify-center p-6">
      <EmptyState
        icon="Mail"
        message="Scan a Store QR code or open a Store link to start. No sign-up is required."
        title="No conversations yet"
      />
    </View>
  )
}
