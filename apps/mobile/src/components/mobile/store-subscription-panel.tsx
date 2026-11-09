import { Text } from "@/components/ui/text"
export function StoreSubscriptionPanel() {
  return (
    <Text className="text-sm text-muted-foreground">
      Store subscriptions are available in the iOS and Android apps.
    </Text>
  )
}

export function useSubscriptionPlanPanel(_options: {
  currentPlanId: string | null
  onCompleted?: () => Promise<void> | void
}) {
  return { content: <StoreSubscriptionPanel />, footer: null }
}
