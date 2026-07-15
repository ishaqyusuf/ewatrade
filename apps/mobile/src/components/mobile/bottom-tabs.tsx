import { useColors } from "@/hooks/use-color"
import { useEffect } from "react"
import { View as RNView } from "react-native"
import Animated, {
  useAnimatedStyle,
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
  const insets = useSafeAreaInsets()
  const isReference = variant === "reference"
  const safeBottom = safeArea ? insets.bottom : 0
  const shouldHide = hideOnScroll && isHidden
  const hiddenProgress = useSharedValue(shouldHide ? 1 : 0)
  const hiddenTranslateY = floating
    ? Math.max(safeBottom + 76, 92)
    : Math.max(safeBottom + 72, 88)

  useEffect(() => {
    hiddenProgress.value = withTiming(shouldHide ? 1 : 0, { duration: 220 })
  }, [hiddenProgress, shouldHide])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - hiddenProgress.value,
    transform: [{ translateY: hiddenProgress.value * hiddenTranslateY }],
  }))
  const tabStates = tabs.map((tab, index) => ({
    index,
    isActive:
      tab.label === activeLabel ||
      (activeHref !== undefined && tab.href === activeHref),
    tab,
  }))

  return (
    <Animated.View
      pointerEvents={shouldHide ? "none" : "box-none"}
      style={[
        floating
          ? {
              bottom: Math.max(safeBottom - 12, 6),
              left: 20,
              overflow: "visible",
              position: "absolute",
              right: 20,
            }
          : { overflow: "visible", width: "100%" },
        animatedStyle,
      ]}
    >
      <RNView
        style={{
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: floating ? 999 : 0,
          borderTopWidth: floating || isReference ? 0 : 1,
          elevation: floating ? (isReference ? 10 : 8) : 0,
          paddingBottom: floating ? 0 : Math.max(safeBottom, 8),
          overflow: "visible",
          shadowColor: colors.foreground,
          shadowOffset: { height: floating ? 7 : 0, width: 0 },
          shadowOpacity: floating ? (isReference ? 0.14 : 0.08) : 0,
          shadowRadius: floating ? (isReference ? 16 : 12) : 0,
        }}
      >
        <RNView
          style={{
            alignItems: "center",
            flexDirection: "row",
            height: 56,
            overflow: "visible",
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          {tabStates.map(({ index, isActive, tab }) => (
            <RNView
              key={tab.label}
              style={{
                alignItems: getTabSlotAlignment(index, tabs.length),
                flexBasis: `${100 / tabs.length}%`,
                flexGrow: 0,
                flexShrink: 0,
                justifyContent: "center",
                minHeight: 44,
                overflow: "visible",
                zIndex: tab.render ? 20 : 1,
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

function getTabSlotAlignment(index: number, tabCount: number) {
  if (tabCount !== 3) return "center"
  if (index === 0) return "flex-start"
  if (index === tabCount - 1) return "flex-end"
  return "center"
}
