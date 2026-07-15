import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { View as RNView } from "react-native"
import type {
  MobileBottomTab,
  MobileBottomTabsProps,
} from "./bottom-tabs.types"

type MobileBottomTabItemProps = {
  haptic: boolean
  index: number
  isActive: boolean
  labelStack: NonNullable<MobileBottomTabsProps["labelStack"]>
  onTabPress?: MobileBottomTabsProps["onTabPress"]
  showLabel: boolean
  showLabelOnActive: boolean
  tab: MobileBottomTab
  variant: NonNullable<MobileBottomTabsProps["variant"]>
}

export function MobileBottomTabItem({
  haptic,
  index,
  isActive,
  labelStack,
  onTabPress,
  showLabel,
  showLabelOnActive,
  tab,
  variant,
}: MobileBottomTabItemProps) {
  const colors = useColors()
  const shouldShowLabel = showLabel || (showLabelOnActive && isActive)
  const isHorizontal = labelStack === "horizontal"
  const isReference = variant === "reference"
  const inactiveForeground = isReference
    ? colors.foreground
    : colors.mutedForeground

  return (
    <Pressable
      accessibilityLabel={tab.label}
      accessibilityRole="tab"
      allowOverflow={Boolean(tab.render)}
      className="min-h-11 min-w-11 items-center justify-center rounded-full active:opacity-85"
      disabled={tab.disabled}
      haptic={haptic && !tab.disabled}
      href={tab.disabled ? undefined : tab.href}
      onPress={
        tab.disabled
          ? undefined
          : () => {
              tab.onPress?.()
              onTabPress?.(tab, { active: isActive, index })
            }
      }
      transition
    >
      {tab.render ? (
        tab.render({ active: isActive })
      ) : (
        <RNView
          style={{
            alignItems: "center",
            backgroundColor: isActive ? colors.primary : "transparent",
            borderRadius: 999,
            flexDirection: isHorizontal ? "row" : "column",
            gap: isHorizontal ? 4 : 2,
            justifyContent: "center",
            minHeight: isReference ? 38 : 40,
            minWidth: isActive ? (isReference ? 82 : 86) : 44,
            opacity: tab.disabled ? 0.45 : 1,
            paddingHorizontal: shouldShowLabel ? (isReference ? 12 : 13) : 0,
          }}
        >
          <Icon
            className={
              isActive
                ? isReference
                  ? "size-xs text-primary-foreground"
                  : "size-sm text-primary-foreground"
                : "size-sm"
            }
            color={isActive ? undefined : inactiveForeground}
            name={tab.icon}
          />
          {shouldShowLabel ? (
            <Text
              className={
                isActive
                  ? isReference
                    ? "text-[11px] font-bold text-primary-foreground"
                    : "text-[11px] font-extrabold text-primary-foreground"
                  : isReference
                    ? "text-[11px] font-bold text-foreground"
                    : "text-[11px] font-bold text-muted-foreground"
              }
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          ) : null}
        </RNView>
      )}
    </Pressable>
  )
}
