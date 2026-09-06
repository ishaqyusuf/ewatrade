import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { MOBILE_OPERATIONAL_BOTTOM_TAB_TOKENS } from "@/lib/design-foundation"
import { DISPLAY_TEXT_FONT_SCALE_CAP } from "@/lib/mobile-accessibility-layout"
import { cn } from "@/lib/utils"
import { Text as RNText, View as RNView } from "react-native"
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
  const largeTextLayout = useLargeTextLayout()
  const shouldShowLabel = showLabel || (showLabelOnActive && isActive)
  const isHorizontal = labelStack === "horizontal"
  const isReference = variant === "reference"
  const isOperationalDetail = variant === "operational-detail"
  const isAction = tab.kind === "action"
  const isOperationalNavigation = isOperationalDetail && !isAction
  const accessibilityRole = isAction ? "button" : "tab"
  const inactiveForeground = isReference
    ? colors.foreground
    : colors.mutedForeground

  return (
    <Pressable
      accessibilityLabel={tab.accessibilityLabel ?? tab.label}
      accessibilityRole={accessibilityRole}
      accessibilityState={{
        disabled: tab.disabled,
        selected: isAction ? undefined : isActive,
      }}
      allowOverflow={Boolean(tab.render) || (isOperationalDetail && isAction)}
      className={cn(
        "min-h-11 min-w-11 items-center justify-center rounded-full active:opacity-85",
        isOperationalNavigation && "w-full",
        largeTextLayout && !isAction && "min-h-14",
      )}
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
      testID={tab.testID}
      transition={!isOperationalDetail}
    >
      {tab.render ? (
        tab.render({ active: isActive })
      ) : isOperationalDetail && isAction ? (
        <RNView
          style={{
            alignItems: "center",
            height: 44,
            justifyContent: "center",
            overflow: "visible",
            opacity: tab.disabled ? 0.45 : 1,
            position: "relative",
            width: 44,
          }}
          testID="operational-bottom-tab-action"
        >
          <RNView
            style={{
              alignItems: "center",
              backgroundColor:
                MOBILE_OPERATIONAL_BOTTOM_TAB_TOKENS.centerSurface,
              borderColor: MOBILE_OPERATIONAL_BOTTOM_TAB_TOKENS.centerAccent,
              borderRadius: 26,
              borderWidth: 2,
              elevation: 6,
              height: 52,
              justifyContent: "center",
              position: "absolute",
              shadowColor: MOBILE_OPERATIONAL_BOTTOM_TAB_TOKENS.centerAccent,
              shadowOffset: { height: 2, width: 0 },
              shadowOpacity: 0.22,
              shadowRadius: 8,
              top: -4,
              width: 52,
            }}
          >
            <Icon
              className="size-[22px]"
              color={MOBILE_OPERATIONAL_BOTTOM_TAB_TOKENS.centerForeground}
              name={tab.icon}
            />
          </RNView>
        </RNView>
      ) : isOperationalDetail ? (
        <RNView
          style={{
            alignItems: "center",
            gap: 4,
            justifyContent: "center",
            minHeight: largeTextLayout ? 60 : 44,
            minWidth: 44,
            opacity: tab.disabled ? 0.45 : 1,
          }}
          testID={`operational-bottom-tab-${tab.label.toLowerCase().replaceAll(" ", "-")}`}
        >
          <Icon
            className="size-[20px]"
            color={
              isActive
                ? MOBILE_OPERATIONAL_BOTTOM_TAB_TOKENS.activeForeground
                : MOBILE_OPERATIONAL_BOTTOM_TAB_TOKENS.inactiveForeground
            }
            name={tab.icon}
          />
          <RNText
            adjustsFontSizeToFit={!largeTextLayout}
            maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
            minimumFontScale={largeTextLayout ? undefined : 0.9}
            numberOfLines={largeTextLayout ? 2 : 1}
            style={{
              color: isActive
                ? MOBILE_OPERATIONAL_BOTTOM_TAB_TOKENS.activeForeground
                : MOBILE_OPERATIONAL_BOTTOM_TAB_TOKENS.inactiveForeground,
              fontSize: 10,
              fontWeight: "600",
              lineHeight: 12,
              textAlign: "center",
              textAlignVertical: "center",
              width: "100%",
            }}
          >
            {tab.label}
          </RNText>
        </RNView>
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
              maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
              numberOfLines={largeTextLayout ? 2 : 1}
            >
              {tab.label}
            </Text>
          ) : null}
        </RNView>
      )}
    </Pressable>
  )
}
