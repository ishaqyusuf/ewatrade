import { useColors } from "@/hooks/use-color";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type MobileScreenProps = {
  children: ReactNode;
  contentClassName?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardBottomOffset?: number;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scroll?: boolean;
};

export function MobileScreen({
  children,
  contentClassName,
  contentContainerStyle,
  keyboardBottomOffset = 88,
  onScroll,
  scroll = true,
}: MobileScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom + 24, 40);

  return (
    <View
      style={{
        backgroundColor: colors.background,
        flex: 1,
        paddingTop: insets.top,
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
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
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
  );
}
