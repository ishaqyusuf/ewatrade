import type { WorkflowModalChromeProps } from "@/components/mobile/workflow-modal-screen"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import type { ReactNode } from "react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { SearchFooterScope } from "../search-footer-scope"

// WorkflowModalScreen retains the shared authentication, role and close-route policy.
export function MobileWorkflowChrome({
  children,
  closeLabel,
  hideHeader,
  title,
  onClose,
  onBack,
  backLabel,
  trailing,
}: WorkflowModalChromeProps & {
  /** Replaces the X with a back chevron for a nested view (Green Till). */
  onBack?: () => void
  backLabel?: string
  /** A 44pt control in the right slot, balancing the left button. */
  trailing?: ReactNode
}) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  return (
    <VariableContextProvider value={{ "--workflow-shell-top": insets.top }}>
      <View className="flex-1 bg-background pt-[var(--workflow-shell-top)]">
        <StatusBar
          animated
          backgroundColor={colors.background}
          style={colorScheme === "dark" ? "light" : "dark"}
        />
        {!hideHeader ? (
          // Green Till: X on the left, centred title, balancing spacer.
          <View className="flex-row items-center gap-2.5 px-4 pb-3.5 pt-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={onBack ? (backLabel ?? "Back") : closeLabel}
              onPress={onBack ?? onClose}
              haptic
              className="size-11 items-center justify-center rounded-full bg-card shadow-sm active:bg-accent"
            >
              <Icon
                name={onBack ? "ChevronLeft" : "X"}
                className={
                  onBack
                    ? "size-[20px] text-foreground"
                    : "size-[18px] text-foreground"
                }
              />
            </Pressable>
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              className="min-w-0 flex-1 text-center text-base font-extrabold tracking-tight text-foreground"
            >
              {title}
            </Text>
            {trailing ?? <View className="size-11" />}
          </View>
        ) : null}
        <SearchFooterScope className="min-h-0 flex-1 bg-background">
          {children}
        </SearchFooterScope>
      </View>
    </VariableContextProvider>
  )
}
