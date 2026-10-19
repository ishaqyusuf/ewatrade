import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/utils"
import {
  type ProductUsage,
  productUsageDescriptions,
  productUsageLabels,
  productUsages,
} from "@ewatrade/utils/product-usage"
import { View } from "react-native"

/** For sale · Internal use · Both, with the chosen usage explained below. */
export function ProductUsagePicker({
  disabled = false,
  onChange,
  value,
}: {
  disabled?: boolean
  onChange: (usage: ProductUsage) => void
  value: ProductUsage
}) {
  return (
    <View className="gap-2">
      <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
        Product usage
      </Text>
      <View
        accessibilityLabel="Product usage"
        accessibilityRole="radiogroup"
        className="flex-row flex-wrap gap-2"
      >
        {productUsages.map((usage) => {
          const selected = usage === value
          return (
            <Pressable
              accessibilityHint={productUsageDescriptions[usage]}
              accessibilityLabel={productUsageLabels[usage]}
              accessibilityRole="radio"
              accessibilityState={{ disabled, selected }}
              // Keep the border width constant: Android drops the label of a
              // picked chip when its border appears or disappears.
              className={cn(
                "min-h-9 justify-center rounded-full border-[1.5px] px-3.5",
                selected
                  ? "border-primary bg-accent"
                  : "border-transparent bg-muted",
                disabled && "opacity-60",
              )}
              disabled={disabled}
              haptic
              hitSlop={4}
              key={usage}
              onPress={() => onChange(usage)}
            >
              <Text
                className={cn(
                  "text-xs font-bold",
                  selected ? "text-primary" : "text-foreground",
                )}
              >
                {productUsageLabels[usage]}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <Text className="text-xs [-rn-line-height:22] text-muted-foreground">
        {productUsageDescriptions[value]}
      </Text>
    </View>
  )
}
