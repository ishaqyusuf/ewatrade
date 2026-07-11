import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import {
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type MobileScreenProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardBottomOffset?: number;
  scroll?: boolean;
};

export function MobileScreen({
  children,
  className,
  contentClassName,
  contentContainerStyle,
  keyboardBottomOffset = 88,
  scroll = true,
}: MobileScreenProps) {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom + 24, 40);

  return (
    <View
      className={cn("flex-1 bg-background", className)}
      style={{ paddingTop: insets.top }}
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
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          <View className={cn("min-h-full px-6 py-6", contentClassName)}>
            {children}
          </View>
        </KeyboardAwareScrollView>
      ) : (
        <View
          className={cn("flex-1 px-6 py-6", contentClassName)}
          style={[{ paddingBottom: bottomPadding }, contentContainerStyle]}
        >
          {children}
        </View>
      )}
    </View>
  );
}
