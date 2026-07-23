import { FormField } from "@/components/mobile/form-field"
import { shouldShowListSearch } from "@/lib/list-pagination"
import type { ReactNode } from "react"
import { View } from "react-native"
import { KeyboardStickyView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"

type BottomSearchFooterProps = {
  accessibilityLabel: string
  children?: ReactNode
  includeSafeArea?: boolean
  label?: string
  onChangeText: (value: string) => void
  placeholder: string
  searchVisible?: boolean
  totalCount: number
  value: string
}

export function BottomSearchFooter({
  accessibilityLabel,
  children,
  includeSafeArea = true,
  label = "Search",
  onChangeText,
  placeholder,
  searchVisible = true,
  totalCount,
  value,
}: BottomSearchFooterProps) {
  const insets = useSafeAreaInsets()
  const paddingBottom = includeSafeArea ? Math.max(insets.bottom, 8) : 8

  const effectiveSearchVisible =
    searchVisible && shouldShowListSearch(totalCount)

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
          {children}
          {effectiveSearchVisible ? (
            <FormField
              accessibilityLabel={accessibilityLabel}
              autoCapitalize="none"
              autoCorrect={false}
              label={label}
              leadingIcon="Search"
              onChangeText={onChangeText}
              placeholder={placeholder}
              returnKeyType="search"
              value={value}
              variant="search"
            />
          ) : null}
        </View>
      </View>
    </KeyboardStickyView>
  )
}
