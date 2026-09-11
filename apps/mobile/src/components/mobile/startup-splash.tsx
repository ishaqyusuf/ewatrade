import { ClassicStartupSplash } from "@/components/mobile/appearances/classic/startup-splash"
import { MarketDayStartupSplash } from "@/components/mobile/appearances/market-day/startup-splash"
import { useMobileDesign } from "@/hooks/use-mobile-design"

export function StartupSplash() {
  const design = useMobileDesign("startup-splash")
  return design === "market-day" ? (
    <MarketDayStartupSplash />
  ) : (
    <ClassicStartupSplash />
  )
}
