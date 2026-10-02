import type { ReactNode } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

export function FinanceFormBody({ children }: { children: ReactNode }) {
  return (
    <KeyboardAwareScrollView
      className="flex-1"
      bottomOffset={120}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      disableScrollOnKeyboardHide
    >
      <View className="gap-4 px-4 pb-12">{children}</View>
    </KeyboardAwareScrollView>
  )
}
