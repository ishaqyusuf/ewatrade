import {
  ClassicCustomerActionRow,
  ClassicCustomerSuggestionRow,
  ClassicSaleStageHeader,
  ClassicSelectedOrderLine,
} from "@/components/mobile/appearances/classic/create-sale"
import {
  MarketDayCustomerActionRow,
  MarketDayCustomerSuggestionRow,
  MarketDaySaleSegment,
  MarketDaySaleStageHeader,
  MarketDaySaleTotal,
  MarketDaySelectedOrderLine,
  marketDaySaleClasses,
} from "@/components/mobile/appearances/market-day/create-sale"
import {
  SaleSegmentOption,
  SaleTotalSummary,
} from "@/components/mobile/sale-flow"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useMarketDayPalette } from "@/lib/market-day-theme"
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
