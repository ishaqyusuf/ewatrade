import { ActionButton } from "@/components/mobile/action-button"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useWindowDimensions } from "react-native"
import type { CatalogSetupModel } from "./use-catalog-setup"

export function CatalogSetupConfirmation({
  model,
}: { model: CatalogSetupModel }) {
  const { height } = useWindowDimensions()
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
        <View className="gap-3 px-5 pt-4 pb-5">
          <Text
            accessibilityRole="header"
            className="text-xl font-extrabold text-foreground"
          >
            {confirmationCopy.title}
          </Text>
          <Text className="text-sm [-rn-line-height:22] text-muted-foreground">
            {confirmationCopy.message}
          </Text>
        </View>
        <View className="gap-2 px-5 pb-6">
          <ActionButton onPress={confirmSetupChange} disabled={locked}>
            {confirmationCopy.action}
          </ActionButton>
          <ActionButton onPress={cancelSetupConfirmation} variant="outline">
            Keep editing
          </ActionButton>
        </View>
      </BottomSheetScrollView>
    </Modal>
  )
}
