import { Text } from "@/components/ui/text"
import { Pressable } from "@/components/ui/pressable"
import { Icon } from "@/components/ui/icon"
import { View } from "react-native"
import { cn } from "@/lib/utils"
import { BUSINESS_SETUP_STEPS } from "@/components/mobile/new-business/new-business-model"
import type {
  BusinessChoiceProps,
  BusinessProfileRowProps,
  BusinessSectionProps,
  BusinessSummaryProps,
} from "@/components/mobile/new-business/new-business-presentation"

const HEADINGS = [
  "Make room for more.",
  "Your way of trading.",
  "Give it an address.",
  "Ready to open.",
]
export function BusinessHeader({ step }: { step: number }) {
  return (
    <View className="gap-4 rounded-2xl border-b-[5px] border-market-marigold bg-market-palm px-5 py-5">
      <Text className="font-market-mono text-[11px] uppercase tracking-[1px] text-market-on-palm-muted">
        New business / {String(step).padStart(2, "0")} of 04
      </Text>
      <Text
        accessibilityRole="header"
        className="font-market-display text-[32px] text-market-on-palm [-rn-line-height:38]"
      >
        {HEADINGS[step - 1]}
      </Text>
      <Text className="text-sm text-market-on-palm-muted [-rn-line-height:21]">
        One more business. Its own Catalog, team and records.
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {BUSINESS_SETUP_STEPS.map((label, index) => (
          <Text
            key={label}
            className={cn(
              "rounded-full px-3 py-2 text-xs font-bold",
              index === step - 1
                ? "bg-market-marigold text-market-on-marigold"
                : "text-market-on-palm-muted",
            )}
          >
            {index + 1} · {label}
          </Text>
        ))}
      </View>
    </View>
  )
}
export function BusinessSection({
  title,
  description,
  children,
}: BusinessSectionProps) {
  return (
    <View className="gap-4">
      <View className="gap-1 border-l-[3px] border-market-marigold pl-3">
        <Text
          accessibilityRole="header"
          className="text-lg font-extrabold text-market-ink"
        >
          {title}
        </Text>
        {description ? (
          <Text className="text-xs text-market-muted-ink [-rn-line-height:20]">
            {description}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  )
}
export function BusinessProfileRow({
  profile,
  selected,
  disabled,
  onPress,
}: BusinessProfileRowProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={profile.title}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      haptic
      className={cn(
        "mb-3 min-h-20 flex-row items-start gap-3 rounded-2xl border px-4 py-4",
        selected
          ? "border-market-palm bg-market-soft-band"
          : "border-market-line bg-market-field",
      )}
    >
      <View className="size-10 shrink-0 items-center justify-center rounded-xl bg-market-marigold">
        <Icon name="Building2" className="size-sm text-market-on-marigold" />
      </View>
      <View className="min-w-0 flex-1 gap-2">
        <Text className="text-base font-extrabold text-market-ink">
          {profile.title}
        </Text>
        <Text className="text-xs text-market-muted-ink [-rn-line-height:20]">
          {profile.description}
        </Text>
      </View>
      <Icon
        name={selected ? "Check" : "ChevronRight"}
        className="mt-1 size-xs text-market-accent-ink"
      />
    </Pressable>
  )
}
export function BusinessChoice({
  label,
  selected,
  multiple,
  disabled,
  onPress,
}: BusinessChoiceProps) {
  return (
    <Pressable
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityLabel={label}
      accessibilityState={
        multiple ? { checked: selected, disabled } : { selected, disabled }
      }
      disabled={disabled}
      onPress={onPress}
      haptic
      className={cn(
        "min-h-12 flex-row items-center gap-2 rounded-xl border px-4 py-3",
        selected
          ? "border-market-palm bg-market-palm"
          : "border-market-line bg-market-field",
      )}
    >
      {selected ? (
        <Icon name="Check" className="size-xs text-market-on-palm" />
      ) : null}
      <Text
        className={cn(
          "shrink text-sm font-bold [-rn-line-height:20] [-rn-include-font-padding:false] [-rn-text-align-vertical:center]",
          selected ? "text-market-on-palm" : "text-market-ink",
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}
export function BusinessSummary({ label, value }: BusinessSummaryProps) {
  return (
    <View className="gap-1 border-b border-market-line py-3">
      <Text className="font-market-mono text-[11px] uppercase tracking-[1px] text-market-muted-ink">
        {label}
      </Text>
      <Text className="text-base font-bold text-market-ink">
        {value || "Not provided"}
      </Text>
    </View>
  )
}
