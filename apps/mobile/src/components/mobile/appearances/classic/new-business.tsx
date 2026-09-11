import { SetupSection, SetupSummaryRow } from "@/components/mobile/setup-flow"
import { StatusBadge } from "@/components/mobile/status-badge"
import { Text } from "@/components/ui/text"
import { Pressable } from "@/components/ui/pressable"
import { View } from "react-native"
import { cn } from "@/lib/utils"
import {
  BUSINESS_SETUP_STEPS,
  BUSINESS_SETUP_TITLES,
} from "@/components/mobile/new-business/new-business-model"
import type {
  BusinessChoiceProps,
  BusinessProfileRowProps,
} from "@/components/mobile/new-business/new-business-presentation"

export const BusinessSection = SetupSection
export const BusinessSummary = SetupSummaryRow
export function BusinessHeader({ step }: { step: number }) {
  return (
    <View className="gap-5">
      <StatusBadge icon="Building2" label="New business" tone="primary" />
      <View className="gap-2">
        <Text
          accessibilityRole="header"
          className="text-2xl font-extrabold text-foreground [-rn-line-height:32]"
        >
          {BUSINESS_SETUP_TITLES[step - 1]}
        </Text>
        <Text className="text-sm text-muted-foreground [-rn-line-height:20]">
          Set up a separate workspace with its own catalog, customers, staff,
          and reports.
        </Text>
      </View>
      <View className="flex-row gap-2">
        {BUSINESS_SETUP_STEPS.map((label, index) => (
          <View className="min-w-0 flex-1 gap-2" key={label}>
            <View
              className={cn(
                "h-1.5 rounded-full",
                index < step ? "bg-primary" : "bg-muted",
              )}
            />
            <Text
              className={cn(
                "text-[11px] font-bold uppercase tracking-[1px]",
                index === step - 1 ? "text-primary" : "text-muted-foreground",
              )}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
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
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={profile.title}
      disabled={disabled}
      onPress={onPress}
      haptic
      className={cn(
        "min-h-16 gap-1 border-b border-border px-2 py-4",
        selected ? "bg-primary/10" : "active:bg-muted",
      )}
    >
      <Text className="font-bold text-foreground">{profile.title}</Text>
      <Text className="text-xs text-muted-foreground [-rn-line-height:20]">
        {profile.description}
      </Text>
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
      accessibilityState={
        multiple ? { checked: selected, disabled } : { selected, disabled }
      }
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      haptic
      className={cn(
        "min-h-11 items-center justify-center rounded-full px-4 py-2",
        selected ? "bg-primary" : "border border-border bg-background",
      )}
    >
      <Text
        className={cn(
          "text-xs font-bold [-rn-line-height:20] [-rn-include-font-padding:false] [-rn-text-align-vertical:center]",
          selected ? "text-primary-foreground" : "text-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}
