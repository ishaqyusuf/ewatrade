import { useColorScheme, useColors } from "@/hooks/use-color"
import { MOBILE_OPERATIONAL_BOTTOM_TAB_TOKENS } from "@/lib/design-foundation"
import { useEffect } from "react"
import { View as RNView } from "react-native"
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { MobileBottomTabItem } from "./bottom-tab-item"
import type { MobileBottomTabsProps } from "./bottom-tabs.types"
export type {
  MobileBottomTab,
  MobileBottomTabsProps,
} from "./bottom-tabs.types"

export function MobileBottomTabs({
  activeHref,
  activeLabel,
  floating = false,
  hideOnScroll = floating,
  haptic = true,
  isHidden = false,
  labelStack = "vertical",
  onTabPress,
  safeArea = true,
  showLabel = true,
  showLabelOnActive = false,
  tabs,
  variant = "default",
}: MobileBottomTabsProps) {
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const insets = useSafeAreaInsets()
  const isReference = variant === "reference"
  const isOperationalDetail = variant === "operational-detail"
  const reduceMotion = useReducedMotion()
  const safeBottom = safeArea ? insets.bottom : 0
  const shouldHide = hideOnScroll && isHidden
  const hiddenProgress = useSharedValue(shouldHide ? 1 : 0)
  const hiddenTranslateY = isOperationalDetail
    ? Math.max(safeBottom + 96, 112)
    : floating
      ? Math.max(safeBottom + 76, 92)
      : Math.max(safeBottom + 72, 88)

  useEffect(() => {
    hiddenProgress.value = withTiming(shouldHide ? 1 : 0, {
      duration: reduceMotion ? 0 : 220,
    })
  }, [hiddenProgress, reduceMotion, shouldHide])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - hiddenProgress.value,
    transform: [{ translateY: hiddenProgress.value * hiddenTranslateY }],
  }))
  const tabStates = tabs.map((tab, index) => ({
    index,
    isActive:
      tab.isActive ??
      (tab.label === activeLabel ||
        (activeHref !== undefined && tab.href === activeHref)),
    tab,
  }))

  return (
    <Animated.View
      pointerEvents={shouldHide ? "none" : "box-none"}
      style={[
        floating
          ? {
              bottom: isOperationalDetail
                ? Math.max(safeBottom - 4, 12)
                : Math.max(safeBottom - 12, 6),
              left: isOperationalDetail ? 24 : 20,
              overflow: "visible",
              position: "absolute",
              right: isOperationalDetail ? 24 : 20,
            }
          : { overflow: "visible", width: "100%" },
        animatedStyle,
      ]}
    >
      <RNView
        style={{
          backgroundColor: isOperationalDetail
            ? MOBILE_OPERATIONAL_BOTTOM_TAB_TOKENS.surface
            : colors.card,
          borderColor:
            isOperationalDetail && colorScheme === "dark"
              ? MOBILE_OPERATIONAL_BOTTOM_TAB_TOKENS.darkBorder
              : colors.border,
          borderRadius: isOperationalDetail ? 36 : floating ? 999 : 0,
          borderTopWidth:
            isOperationalDetail && colorScheme === "dark"
              ? 1
              : floating || isReference
                ? 0
                : 1,
          borderWidth:
            isOperationalDetail && colorScheme === "dark" ? 1 : undefined,
          elevation: floating
            ? isOperationalDetail
              ? 12
              : isReference
                ? 10
                : 8
            : 0,
          paddingBottom: floating ? 0 : Math.max(safeBottom, 8),
          overflow: "visible",
          shadowColor: isOperationalDetail
            ? MOBILE_OPERATIONAL_BOTTOM_TAB_TOKENS.shadow
            : colors.foreground,
          shadowOffset: {
            height: floating ? (isOperationalDetail ? 6 : 7) : 0,
            width: 0,
          },
          shadowOpacity: floating
            ? isOperationalDetail
              ? 0.28
              : isReference
                ? 0.14
                : 0.08
            : 0,
          shadowRadius: floating
            ? isOperationalDetail
              ? 16
              : isReference
                ? 16
                : 12
            : 0,
        }}
      >
        <RNView
          style={{
            alignItems: "center",
            flexDirection: "row",
            height: isOperationalDetail ? 72 : 56,
            overflow: "visible",
            paddingHorizontal: isOperationalDetail ? 10 : 12,
            paddingVertical: isOperationalDetail ? 0 : 6,
          }}
        >
          {tabStates.map(({ index, isActive, tab }) => (
            <RNView
              key={tab.label}
              style={{
                alignItems: getTabSlotAlignment(
                  index,
                  tabs.length,
                  isOperationalDetail,
                ),
                flexBasis: `${100 / tabs.length}%`,
                flexGrow: 0,
                flexShrink: 0,
                justifyContent: "center",
                minHeight: 44,
                overflow: "visible",
                zIndex: tab.kind === "action" || tab.render ? 20 : 1,
              }}
            >
              <MobileBottomTabItem
                haptic={haptic}
                isActive={isActive}
                labelStack={labelStack}
                onTabPress={onTabPress}
                index={index}
                showLabel={showLabel}
                showLabelOnActive={showLabelOnActive}
                tab={tab}
                variant={variant}
              />
            </RNView>
          ))}
        </RNView>
      </RNView>
    </Animated.View>
  )
}

function getTabSlotAlignment(
  index: number,
  tabCount: number,
  isOperationalDetail: boolean,
) {
  if (isOperationalDetail || tabCount !== 3) return "center"
  if (index === 0) return "flex-start"
  if (index === tabCount - 1) return "flex-end"
  return "center"
}
