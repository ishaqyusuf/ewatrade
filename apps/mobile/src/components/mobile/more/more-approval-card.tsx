import { ActionButton } from "@/components/mobile/action-button"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import type { MobileDesign } from "@/lib/mobile-design/screens"
import { cn } from "@/lib/utils"

export function MoreApprovalCard({
  appearance,
  actorName,
  disabled,
  onApprove,
  onReject,
}: {
  appearance: MobileDesign
  actorName: string
  disabled: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const largeText = useLargeTextLayout()
  const market = appearance === "market-day"
  return (
    <View
      className={cn(
        "gap-3 border-b py-4",
        market ? "border-market-line" : "border-border",
      )}
    >
      <View className="flex-row items-start gap-3">
        <View
          className={cn(
            "size-9 shrink-0 items-center justify-center rounded-full",
            market ? "bg-market-field" : "bg-muted",
          )}
        >
          <Icon
            name="ReceiptText"
            className={cn(
              "size-sm",
              market ? "text-market-accent-ink" : "text-primary",
            )}
          />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text
            className={cn(
              "font-extrabold",
              market ? "text-market-ink" : "text-foreground",
            )}
          >
            Staff order awaiting approval
          </Text>
          <Text
            className={cn(
              "text-xs",
              market ? "text-market-muted-ink" : "text-muted-foreground",
            )}
          >
            {actorName}
          </Text>
        </View>
      </View>
      <View className={largeText ? "gap-2" : "flex-row gap-2"}>
        <ActionButton
          className={largeText ? "w-full" : "w-auto flex-1"}
          disabled={disabled}
          variant="outline"
          onPress={onApprove}
        >
          Approve
        </ActionButton>
        <ActionButton
          className={largeText ? "w-full" : "w-auto flex-1"}
          disabled={disabled}
          variant="destructive"
          onPress={onReject}
        >
          Reject
        </ActionButton>
      </View>
    </View>
  )
}
