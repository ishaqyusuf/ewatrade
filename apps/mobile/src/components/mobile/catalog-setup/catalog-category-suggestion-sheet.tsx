import { ActionButton } from "@/components/mobile/action-button"
import { Modal, type useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import type { CatalogCategorySuggestion } from "@ewatrade/utils/catalog-category-suggestions"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { Text as NativeText, useWindowDimensions } from "react-native"

/** Before Review item: the unused best-match category, one tap to use it. */
export function CatalogCategorySuggestionSheet({
  disabled,
  modalRef,
  onDismiss,
  onIgnore,
  onUse,
  suggestion,
}: {
  disabled: boolean
  modalRef: ReturnType<typeof useModal>["ref"]
  onDismiss: () => void
  onIgnore: () => void
  onUse: () => void
  suggestion: CatalogCategorySuggestion | null
}) {
  const { height } = useWindowDimensions()
  const largeTextLayout = useLargeTextLayout()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  return (
    <Modal
      ref={modalRef}
      hideHeader
      snapPoints={[]}
      enableDynamicSizing
      maxDynamicContentSize={height * (largeTextLayout ? 0.92 : 0.44)}
      onDismiss={onDismiss}
    >
      <BottomSheetScrollView keyboardShouldPersistTaps="handled">
        <View className="gap-3 px-5 pt-4 pb-5">
          <Text
            accessibilityRole="header"
            className="text-xl font-extrabold text-foreground"
          >
            Add the suggested category?
          </Text>
          {suggestion ? (
            <View
              style={{
                backgroundColor: palette.lilac,
                borderRadius: 13,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <NativeText
                style={{ color: palette.lilacForeground, fontSize: 16 }}
              >
                {"Best match · "}
                <NativeText style={{ fontWeight: "800" }}>
                  {suggestion.category.split(" / ").join(" › ")}
                </NativeText>
              </NativeText>
            </View>
          ) : null}
        </View>
        <View className="gap-2 px-5 pb-6">
          <ActionButton onPress={onUse} disabled={disabled || !suggestion}>
            Use category
          </ActionButton>
          <ActionButton onPress={onIgnore} variant="outline">
            Ignore
          </ActionButton>
        </View>
      </BottomSheetScrollView>
    </Modal>
  )
}
