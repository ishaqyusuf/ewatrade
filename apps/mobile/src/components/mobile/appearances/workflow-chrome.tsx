import type { WorkflowModalChromeProps } from "@/components/mobile/workflow-modal-screen"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors, useColorScheme } from "@/hooks/use-color"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import type { MobileDesignScreen } from "@/lib/mobile-design/screens"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { cn } from "@/lib/utils"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
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
}: WorkflowModalChromeProps & { screen: MobileDesignScreen }) {
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
        {!hideHeader ? (
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
