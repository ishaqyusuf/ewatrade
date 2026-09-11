import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import type { MobileDesign } from "@/lib/mobile-design/screens"
import { cn } from "@/lib/utils"

export function SignUpChoice({
  appearance,
  label,
  onPress,
  selected,
  multiple = false,
}: {
  appearance: MobileDesign
  label: string
  onPress: () => void
  selected: boolean
  multiple?: boolean
}) {
  const largeText = useLargeTextLayout()
  const market = appearance === "market-day"
  return (
    <Pressable
      accessibilityRole={multiple ? "checkbox" : "button"}
      accessibilityState={multiple ? { checked: selected } : { selected }}
      className={cn(
        "items-center justify-center px-4 active:opacity-80",
        largeText
          ? "min-h-14 w-full rounded-2xl py-3"
          : "min-h-11 rounded-full py-2",
        selected ? (market ? "bg-market-palm" : "bg-primary") : "bg-muted",
      )}
      haptic
      onPress={onPress}
    >
      <Text
        className={cn(
          "text-center text-sm font-bold [-rn-line-height:20] [-rn-include-font-padding:false] [-rn-text-align-vertical:center]",
          selected
            ? market
              ? "text-market-on-palm"
              : "text-primary-foreground"
            : "text-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}
