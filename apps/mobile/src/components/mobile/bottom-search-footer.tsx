import { FormField } from "@/components/mobile/form-field"
import { shouldShowListSearch } from "@/lib/list-pagination"
import type { ReactNode } from "react"
import { View } from "react-native"
import { KeyboardStickyView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"

type BottomSearchFooterProps = {
  accessibilityLabel: string
  alwaysShowSearch?: boolean
  children?: ReactNode
  includeSafeArea?: boolean
  label?: string
  layout?: "inline" | "stacked"
  onChangeText: (value: string) => void
  placeholder: string
  searchVisible?: boolean
  totalCount: number
  value: string
}

export function BottomSearchFooter({
  accessibilityLabel,
  alwaysShowSearch = false,
  children,
  includeSafeArea = true,
  label = "Search",
  layout = "stacked",
  onChangeText,
  placeholder,
  searchVisible = true,
  totalCount,
  value,
}: BottomSearchFooterProps) {
  const insets = useSafeAreaInsets()
  const paddingBottom = includeSafeArea ? Math.max(insets.bottom, 8) : 8

  const effectiveSearchVisible =
    searchVisible && (alwaysShowSearch || shouldShowListSearch(totalCount))

  if (!children && !effectiveSearchVisible) return null

  return (
    <KeyboardStickyView
      offset={{ closed: 0, opened: 0 }}
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
      <View style={{ paddingBottom }}>
        <View className="gap-3 bg-background px-4 pt-2">
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
                containerClassName={
                  layout === "inline" ? "min-w-0 flex-1" : undefined
                }
                label={label}
                leadingIcon="Search"
                onChangeText={onChangeText}
                placeholder={placeholder}
                returnKeyType="search"
                value={value}
                variant="search"
              />
            ) : null}
            {children}
          </View>
        </View>
      </View>
    </KeyboardStickyView>
  )
}
