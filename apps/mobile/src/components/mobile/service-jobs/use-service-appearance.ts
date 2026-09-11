import * as Classic from "@/components/mobile/appearances/classic/service-jobs"
import * as Market from "@/components/mobile/appearances/market-day/service-jobs"
import { useMobileDesign } from "@/hooks/use-mobile-design"

export function useServiceAppearance() {
  const market = useMobileDesign("service-jobs") === "market-day"
  return { market, ...(market ? Market : Classic) }
}
