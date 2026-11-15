import { RowDivider } from "@/components/mobile/green-till/kit"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import {
  type ProductUsage,
  productUsageDescriptions,
  productUsageLabels,
  productUsages,
} from "@ewatrade/utils/product-usage"
import { BottomSheetView } from "@gorhom/bottom-sheet"

/**
 * Item usage as a select field: shows the chosen usage like an input and opens
 * a sheet of the four usages (few choices, no typing, so a sheet fits).
 */
export function ProductUsageSelect({
  disabled = false,
  onChange,
  value,
}: {
  disabled?: boolean
  onChange: (usage: ProductUsage) => void
  value: ProductUsage
}) {
  const sheet = useModal()
  const largeTextLayout = useLargeTextLayout()
  return (
    <View className="gap-2.5">
      <Text className="text-xs font-bold [-rn-line-height:22] text-muted-foreground">
        Item usage
      </Text>
      <Pressable
        accessibilityHint="Opens the usage choices."
        accessibilityLabel={`Item usage, ${productUsageLabels[value]}`}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        className={cn(
          "flex-row items-center gap-2.5 rounded-[14px] border border-border bg-muted px-3.5",
          largeTextLayout ? "min-h-16 py-1.5" : "min-h-[50px]",
          disabled && "opacity-60",
        )}
        disabled={disabled}
        haptic
        onPress={() => sheet.present()}
      >
        <Text className="min-w-0 flex-1 text-base font-semibold text-foreground">
          {productUsageLabels[value]}
        </Text>
        <Icon
          className="size-[18px] text-muted-foreground"
          name="ChevronDown"
        />
      </Pressable>
      <Text className="text-xs [-rn-line-height:20] text-muted-foreground">
        {productUsageDescriptions[value]}
      </Text>
      <Modal enableDynamicSizing ref={sheet.ref} title="Item usage">
        <BottomSheetView>
          <View
            accessibilityLabel="Item usage"
            accessibilityRole="radiogroup"
            className="mx-4 mb-6 overflow-hidden rounded-[20px] bg-background"
          >
            {productUsages.map((usage, index) => {
              const selected = usage === value
              return (
                <Pressable
                  accessibilityHint={productUsageDescriptions[usage]}
                  accessibilityLabel={productUsageLabels[usage]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  className={cn(
                    "min-h-16 flex-row gap-3 px-3.5 py-3",
                    largeTextLayout ? "items-start" : "items-center",
                  )}
                  haptic
                  key={usage}
                  onPress={() => {
                    onChange(usage)
                    sheet.dismiss()
                  }}
                >
                  {index > 0 ? <RowDivider position="top" /> : null}
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text
                      className={cn(
                        "text-base font-bold [-rn-line-height:22]",
                        selected ? "text-primary" : "text-foreground",
                      )}
                    >
                      {productUsageLabels[usage]}
                    </Text>
                    <Text className="text-xs [-rn-line-height:18] text-muted-foreground">
                      {productUsageDescriptions[usage]}
                    </Text>
                  </View>
                  {/* Keep the slot so labels don't shift as the pick moves. */}
                  <View className="size-6 items-center justify-center">
                    {selected ? (
                      <Icon className="size-[20px] text-primary" name="Check" />
                    ) : null}
                  </View>
                </Pressable>
              )
            })}
          </View>
        </BottomSheetView>
      </Modal>
    </View>
  )
}
