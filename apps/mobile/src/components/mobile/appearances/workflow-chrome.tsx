import type { WorkflowModalChromeProps } from "@/components/mobile/workflow-modal-screen"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import type { MobileDesignScreen } from "@/lib/mobile-design/screens"
import { cn } from "@/lib/utils"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import type { ReactNode } from "react"
import { useSafeAreaInsets } from "react-native-safe-area-context"

// One stable shell type keeps the feature controller mounted on appearance changes.
// WorkflowModalScreen retains the shared authentication, role and close-route policy.
export function MobileWorkflowChrome({
  screen,
  children,
  closeLabel,
  hideHeader,
  title,
  onClose,
  onBack,
  backLabel,
  trailing,
}: WorkflowModalChromeProps & {
  screen: MobileDesignScreen
  /** Replaces the X with a back chevron for a nested view (Green Till). */
  onBack?: () => void
  backLabel?: string
  /** A 44pt control in the right slot, balancing the left button. */
  trailing?: ReactNode
}) {
  const market = useMobileDesign(screen) === "market-day"
  const insets = useSafeAreaInsets()
  const palette = useMarketDayPalette()
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  return (
    <VariableContextProvider value={{ "--workflow-shell-top": insets.top }}>
      <View
        className={cn(
          "flex-1 pt-[var(--workflow-shell-top)]",
          market ? "bg-market-palm" : "bg-background",
        )}
      >
        <StatusBar
          animated
          backgroundColor={market ? palette.palm : colors.background}
          style={market || colorScheme === "dark" ? "light" : "dark"}
        />
        {!hideHeader && !market ? (
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
        {!hideHeader && market ? (
          <View
            className={cn(
              "flex-row items-center justify-between gap-3 px-4",
              market ? "pb-3 pt-3" : "mb-4 pt-6",
            )}
          >
            <Text
              accessibilityRole="header"
              className={cn(
                "min-w-0 flex-1 font-extrabold",
                market
                  ? "font-market-mono text-[11px] uppercase tracking-[1.3px] text-market-on-palm-muted"
                  : "text-2xl text-foreground",
              )}
            >
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              onPress={onClose}
              haptic
              className={cn(
                "size-11 items-center justify-center rounded-full",
                market
                  ? "border border-market-hero-hairline active:bg-market-hero-pressed"
                  : "bg-muted active:bg-accent",
              )}
            >
              <Icon
                name="X"
                className={cn(
                  "size-sm",
                  market ? "text-market-on-palm" : "text-foreground",
                )}
              />
            </Pressable>
          </View>
        ) : null}
        <View
          className={cn(
            "min-h-0 flex-1",
            market ? "bg-market-canvas" : "bg-background",
          )}
        >
          {children}
        </View>
      </View>
    </VariableContextProvider>
  )
}
