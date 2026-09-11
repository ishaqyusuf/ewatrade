import { MobileAppShell } from "@/components/mobile/app-shell"
import type { DashboardScreenProps } from "@/components/mobile/dashboard/dashboard-presentation"
import { useColorScheme } from "@/hooks/use-color"
import { useMarketDayPalette } from "@/lib/market-day-theme"

export function MarketDayDashboardScreen(props: DashboardScreenProps) {
  const palette = useMarketDayPalette()
  const { colorScheme } = useColorScheme()
  return (
    <MobileAppShell
      {...props}
      backgroundColor={palette.canvas}
      contentClassName="gap-[18px] bg-market-canvas px-5 pt-4"
      heroStatusBarStyle="dark"
      keyboardBottomOffset={12}
      scrolledStatusBarColor={palette.canvas}
      scrolledStatusBarStyle={colorScheme === "dark" ? "light" : "dark"}
      showHeader={false}
      statusBarColor={
        props.role === "attendant" ? palette.marigold : palette.paprika
      }
      statusBarFollowsHero
    />
  )
}
