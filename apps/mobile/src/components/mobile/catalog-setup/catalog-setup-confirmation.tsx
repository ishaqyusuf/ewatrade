import { ActionButton } from "@/components/mobile/action-button"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { cn } from "@/lib/utils"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useWindowDimensions } from "react-native"
import type { CatalogSetupModel } from "./use-catalog-setup"

export function CatalogSetupConfirmation({
  model,
  market,
}: { model: CatalogSetupModel; market: boolean }) {
  const { height } = useWindowDimensions()
  const palette = useMarketDayPalette()
  const {
    confirmationCopy,
    locked,
    confirmSetupChange,
    cancelSetupConfirmation,
  } = model
  return (
    <Modal
      ref={model.replacementModal.ref}
      hideHeader
      snapPoints={[]}
      enableDynamicSizing
      maxDynamicContentSize={height * 0.44}
      onDismiss={model.dismissSetupConfirmation}
    >
      <BottomSheetScrollView keyboardShouldPersistTaps="handled">
        <View
          className={cn("gap-3 px-5 pt-4 pb-5", market && "bg-market-field")}
        >
          <Text
            accessibilityRole="header"
            className={cn(
              "text-xl font-extrabold",
              market ? "text-market-ink" : "text-foreground",
            )}
          >
            {confirmationCopy.title}
          </Text>
          <Text
            className={cn(
              "text-sm [-rn-line-height:21]",
              market ? "text-market-muted-ink" : "text-muted-foreground",
            )}
          >
            {confirmationCopy.message}
          </Text>
        </View>
        <View className="gap-2 px-5 pb-6">
          <ActionButton
            onPress={confirmSetupChange}
            disabled={locked}
            foregroundColor={market ? palette.onPalm : undefined}
            disabledForegroundColor={market ? palette.mutedInk : undefined}
            className={
              market
                ? locked
                  ? "bg-market-line active:bg-market-line"
                  : "bg-market-palm active:bg-market-hero-pressed"
                : undefined
            }
          >
            {confirmationCopy.action}
          </ActionButton>
          <ActionButton
            onPress={cancelSetupConfirmation}
            variant="outline"
            foregroundColor={market ? palette.ink : undefined}
            className={
              market
                ? "border-market-line bg-market-field active:bg-market-line"
                : undefined
            }
          >
            Keep editing
          </ActionButton>
        </View>
      </BottomSheetScrollView>
    </Modal>
  )
}
