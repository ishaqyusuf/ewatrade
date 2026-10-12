import { ActionButton } from "@/components/mobile/action-button"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"

export function MoreApprovalCard({
  actorName,
  disabled,
  onApprove,
  onReject,
}: {
  actorName: string
  disabled: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const largeText = useLargeTextLayout()
  return (
    <View className="gap-3 rounded-2xl bg-tint-amber p-4">
      <View className="flex-row items-start gap-3">
        <View className="size-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <Icon name="ReceiptText" className="size-[20px] text-primary" />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-extrabold text-foreground">
            Staff order awaiting approval
          </Text>
          <Text className="text-xs text-muted-foreground">{actorName}</Text>
        </View>
      </View>
      <View className={largeText ? "gap-2" : "flex-row gap-2"}>
        <ActionButton
          className={largeText ? "w-full" : "w-auto flex-1"}
          disabled={disabled}
          variant="default"
          onPress={onApprove}
        >
          Approve
        </ActionButton>
        <ActionButton
          className={largeText ? "w-full" : "w-auto flex-1"}
          disabled={disabled}
          variant="outline"
          onPress={onReject}
        >
          Reject
        </ActionButton>
      </View>
    </View>
  )
}
