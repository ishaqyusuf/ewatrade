import type { ReactNode } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { SearchFooterScope, SearchFooterSpacer } from "../search-footer-scope"

export function FinanceFormBody({ children }: { children: ReactNode }) {
  return (
    <SearchFooterScope>
      <KeyboardAwareScrollView
        className="flex-1"
        bottomOffset={120}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        disableScrollOnKeyboardHide
      >
        <View className="gap-4 px-[18px] pb-12">
          {children}
          <SearchFooterSpacer />
        </View>
      </KeyboardAwareScrollView>
    </SearchFooterScope>
  )
}
