import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet"
import type { ReactNode } from "react"
import { Keyboard, Modal as NativeModal, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

/**
 * A form that takes typing, opened over the current screen. Bottom sheets are
 * only for a few choices, confirmations and keyboard-free controls; anything
 * with a text field or search opens here instead, with the same chrome as the
 * app's full-screen workflow views. Android Back closes it.
 */
export function FullScreenForm({
  visible,
  title,
  closeLabel,
  onClose,
  children,
}: {
  visible: boolean
  title: string
  closeLabel: string
  onClose: () => void
  children: ReactNode
}) {
  const insets = useSafeAreaInsets()
  const close = () => {
    Keyboard.dismiss()
    onClose()
  }
  return (
    <NativeModal
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      visible={visible}
      onRequestClose={close}
    >
      {/* Pickers inside the form (country, options) still present sheets. */}
      <BottomSheetModalProvider>
        <MobileWorkflowChrome
          hideHeader={false}
          keyboardBottomOffset={96}
          title={title}
          closeLabel={closeLabel}
          onClose={close}
        >
          <View className="flex-1" style={{ paddingBottom: insets.bottom }}>
            {children}
          </View>
        </MobileWorkflowChrome>
      </BottomSheetModalProvider>
    </NativeModal>
  )
}
