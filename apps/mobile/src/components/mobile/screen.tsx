import { useColors } from "@/hooks/use-color"
import { cn } from "@/lib/utils"
import type { ReactElement, ReactNode } from "react"
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type RefreshControlProps,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"

type MobileScreenProps = {
  backgroundColor?: string
  children: ReactNode
  contentClassName?: string
  contentContainerStyle?: StyleProp<ViewStyle>
  keyboardAutoScrollEnabled?: boolean
  keyboardBottomOffset?: number
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  refreshControl?: ReactElement<RefreshControlProps>
  safeAreaColor?: string
  scroll?: boolean
  testID?: string
}

export function MobileScreen({
  backgroundColor,
  children,
  contentClassName,
  contentContainerStyle,
  keyboardAutoScrollEnabled = true,
  keyboardBottomOffset = 88,
  onScroll,
  refreshControl,
  safeAreaColor,
  scroll = true,
  testID,
}: MobileScreenProps) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const bottomPadding = Math.max(insets.bottom + 24, 40)

  return (
    <View
      style={{
        backgroundColor: safeAreaColor ?? backgroundColor ?? colors.background,
        flex: 1,
        paddingTop: insets.top,
      }}
      testID={testID}
    >
      <View
        style={{
          backgroundColor: backgroundColor ?? colors.background,
          flex: 1,
        }}
      >
        {scroll ? (
          <KeyboardAwareScrollView
            className="flex-1"
            bottomOffset={keyboardBottomOffset}
            contentContainerStyle={[
              { flexGrow: 1, paddingBottom: bottomPadding },
              contentContainerStyle,
            ]}
            disableScrollOnKeyboardHide
            enabled={keyboardAutoScrollEnabled}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            refreshControl={refreshControl}
            scrollEventThrottle={onScroll ? 16 : undefined}
          >
            <View className={cn("min-h-full px-6 py-6", contentClassName)}>
              {children}
            </View>
          </KeyboardAwareScrollView>
        ) : (
          <View className={cn("flex-1 px-6 py-6", contentClassName)}>
            <View
              style={[
                { flex: 1, paddingBottom: bottomPadding },
                contentContainerStyle,
              ]}
            >
              {children}
            </View>
          </View>
        )}
      </View>
    </View>
  )
}
