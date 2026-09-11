import {
  ClassicSaleStageHeader,
  ClassicSelectedOrderLine,
  ClassicCustomerActionRow,
  ClassicCustomerSuggestionRow,
} from "@/components/mobile/appearances/classic/create-sale"
import {
  MarketDaySaleStageHeader,
  MarketDaySelectedOrderLine,
  MarketDayCustomerActionRow,
  MarketDayCustomerSuggestionRow,
  MarketDaySaleTotal,
  MarketDaySaleSegment,
  marketDaySaleClasses,
} from "@/components/mobile/appearances/market-day/create-sale"
import {
  SaleSegmentOption,
  SaleTotalSummary,
} from "@/components/mobile/sale-flow"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import type { MobileDesign } from "@/lib/mobile-design/screens"

export function useSalePresentation(appearance: MobileDesign) {
  const palette = useMarketDayPalette()
  const largeText = useLargeTextLayout()
  const market = appearance === "market-day"
  return {
    market,
    palette,
    largeText,
    tone: market ? marketDaySaleClasses : (value: string) => value,
    SaleStageHeader: market ? MarketDaySaleStageHeader : ClassicSaleStageHeader,
    SelectedOrderLine: market
      ? MarketDaySelectedOrderLine
      : ClassicSelectedOrderLine,
    CustomerActionRow: market
      ? MarketDayCustomerActionRow
      : ClassicCustomerActionRow,
    CustomerSuggestionRow: market
      ? MarketDayCustomerSuggestionRow
      : ClassicCustomerSuggestionRow,
    SegmentOption: market ? MarketDaySaleSegment : SaleSegmentOption,
    TotalSummary: market ? MarketDaySaleTotal : SaleTotalSummary,
  }
}
