import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"

import type { CustomerConversationChannelBoundary as Boundary } from "./customer-conversation-detail-presentation"

export function CustomerConversationChannelBoundary({
  detail,
  label,
  source,
}: Pick<Boundary, "detail" | "label" | "source">) {
  const whatsApp = source === "whatsapp"

  return (
    <View
      accessibilityLabel={detail ? `${label}. ${detail}.` : label}
      accessibilityRole="text"
      accessible
      className="w-full py-1"
    >
      <View className="flex-row items-center gap-3">
        <View className="h-px min-w-6 flex-1 bg-border" />
        <Text
          className={
            whatsApp
              ? "text-center text-[10px] font-bold uppercase tracking-[1.2px] text-primary"
              : "text-center text-[10px] font-bold uppercase tracking-[1.2px] text-muted-foreground"
          }
        >
          {label}
        </Text>
        <View className="h-px min-w-6 flex-1 bg-border" />
      </View>
      {detail ? (
        <Text className="mt-1 text-center text-[10px] text-muted-foreground">
          {detail}
        </Text>
      ) : null}
    </View>
  )
}
