import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet"
import type { ReactNode } from "react"
import { Keyboard, Modal, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

export type RetainedEditor = {
  key: string
  title: string
  content: ReactNode
  footer?: ReactNode
}

/** Ancestors keep their native scroll views mounted until the child is closed. */
export function RetainedEditorStack({
  editors,
  onBack,
  children,
  bottomOffset = 96,
  obscured = false,
  onScrollTouch,
}: {
  editors: RetainedEditor[]
  onBack: () => void
  children?: ReactNode
  bottomOffset?: number
  obscured?: boolean
  onScrollTouch?: () => void
}) {
  const back = () => {
    Keyboard.dismiss()
    onBack()
  }
  return (
    <Modal
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      visible={editors.length > 0}
      onRequestClose={back}
    >
      <BottomSheetModalProvider>
        <MobileWorkflowChrome
          screen="first-product"
          hideHeader
          title="Item details"
          closeLabel="Back to item"
          keyboardBottomOffset={bottomOffset}
          onClose={back}
        >
          <View className="flex-1 bg-background">
            {editors.map((editor, index) => {
              const active = index === editors.length - 1
              return (
                <View
                  key={editor.key}
                  className={
                    active
                      ? "absolute inset-0 bg-background"
                      : "absolute inset-0 bg-background opacity-0"
                  }
                  pointerEvents={active && !obscured ? "auto" : "none"}
                  accessibilityElementsHidden={!active || obscured}
                  importantForAccessibility={
                    active && !obscured ? "auto" : "no-hide-descendants"
                  }
                >
                  <View className="flex-row items-center gap-3 border-b border-border px-3 py-2">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Back from ${editor.title}`}
                      className="size-11 items-center justify-center rounded-full active:bg-accent"
                      onPress={back}
                    >
                      <Icon
                        name="ArrowLeft"
                        className="size-sm text-foreground"
                      />
                    </Pressable>
                    <Text
                      accessibilityRole="header"
                      className="min-w-0 flex-1 text-lg font-bold text-foreground"
                    >
                      {editor.title}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Done with ${editor.title}`}
                      className="min-h-11 justify-center rounded-full px-4 active:bg-accent"
                      onPress={back}
                    >
                      <Text className="font-bold text-primary">Done</Text>
                    </Pressable>
                  </View>
                  <KeyboardAwareScrollView
                    enabled={active && !obscured}
                    className="flex-1"
                    bottomOffset={bottomOffset}
                    extraKeyboardSpace={0}
                    disableScrollOnKeyboardHide
                    keyboardDismissMode="interactive"
                    keyboardShouldPersistTaps="handled"
                    onTouchStart={onScrollTouch}
                  >
                    <View className="gap-5 px-4 pt-5 pb-32">
                      {editor.content}
                    </View>
                  </KeyboardAwareScrollView>
                  {editor.footer}
                </View>
              )
            })}
            {children}
          </View>
        </MobileWorkflowChrome>
      </BottomSheetModalProvider>
    </Modal>
  )
}
