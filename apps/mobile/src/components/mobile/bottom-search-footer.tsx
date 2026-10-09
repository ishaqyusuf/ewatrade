import { FormField } from "@/components/mobile/form-field"
import { useColors } from "@/hooks/use-color"
import { shouldShowListSearch } from "@/lib/list-pagination"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import type { ReactNode } from "react"
import { useEffect } from "react"
import { View } from "react-native"
import { KeyboardStickyView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"

type BottomSearchFooterProps = {
  accessibilityLabel: string
  alwaysShowSearch?: boolean
  autoFocus?: boolean
  bottomOffset?: number
  children?: ReactNode
  includeSafeArea?: boolean
  label?: string
  layout?: "inline" | "stacked"
  maxLength?: number
  localSearch?: boolean
  onChangeText: (value: string) => void
  onHeightChange?: (height: number) => void
  placeholder: string
  showDisabledOfflineSearch?: boolean
  searchVisible?: boolean
  totalCount: number
  value: string
  /** action-bar: Green Till card bar with a rounded top for step actions. */
  variant?: "default" | "market-day" | "action-bar"
}

export function BottomSearchFooter({
  accessibilityLabel,
  alwaysShowSearch = false,
  autoFocus = false,
  bottomOffset = 0,
  children,
  includeSafeArea = true,
  label = "Search",
  layout = "stacked",
  maxLength,
  localSearch = false,
  onChangeText,
  onHeightChange,
  placeholder,
  searchVisible = true,
  showDisabledOfflineSearch = false,
  totalCount,
  value,
  variant = "default",
}: BottomSearchFooterProps) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const marketDay = useMarketDayPalette()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const paddingBottom = includeSafeArea ? Math.max(insets.bottom, 8) : 8

  const effectiveSearchVisible =
    (!isOffline || localSearch || showDisabledOfflineSearch) &&
    searchVisible &&
    (alwaysShowSearch || shouldShowListSearch(totalCount))

  useEffect(() => {
    if (!localSearch && !showDisabledOfflineSearch && isOffline && value)
      onChangeText("")
  }, [isOffline, localSearch, onChangeText, value, showDisabledOfflineSearch])

  if (!children && !effectiveSearchVisible) return null

  return (
    <KeyboardStickyView
      offset={{ closed: -bottomOffset, opened: 0 }}
      pointerEvents="box-none"
      style={{
        bottom: 0,
        left: 0,
        position: "absolute",
        right: 0,
        zIndex: 20,
      }}
      testID="bottom-search-footer"
    >
      <View
        onLayout={
          onHeightChange
            ? (event) => onHeightChange(event.nativeEvent.layout.height)
            : undefined
        }
        style={
          variant === "action-bar"
            ? {
                backgroundColor: colors.card,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                boxShadow: "0 -10px 30px rgba(24, 36, 32, 0.10)",
              }
            : {
                backgroundColor:
                  variant === "market-day"
                    ? marketDay.canvas
                    : colors.background,
              }
        }
      >
        <View style={{ paddingBottom }}>
          <View
            className={
              variant === "action-bar"
                ? "gap-3 px-4 pb-2 pt-3"
                : "gap-3 px-4 pb-2 pt-2"
            }
          >
            <View
              className={
                layout === "inline" ? "flex-row items-center gap-3" : "gap-3"
              }
            >
              {effectiveSearchVisible ? (
                <FormField
                  accessibilityLabel={accessibilityLabel}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus={autoFocus}
                  editable={!isOffline || localSearch}
                  containerClassName={
                    layout === "inline" ? "min-w-0 flex-1" : undefined
                  }
                  label={label}
                  leadingIcon="Search"
                  maxLength={maxLength}
                  onChangeText={onChangeText}
                  placeholder={placeholder}
                  returnKeyType="search"
                  value={value}
                  variant={
                    variant === "market-day" ? "market-search" : "search"
                  }
                />
              ) : null}
              {children}
            </View>
          </View>
        </View>
      </View>
    </KeyboardStickyView>
  )
}
