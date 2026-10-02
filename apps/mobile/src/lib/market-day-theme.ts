import { useColorScheme } from "@/hooks/use-color"
import { BRAND_THEME } from "./brand-theme"

export const MARKET_DAY_PALETTES = {
  dark: {
    accentInk: BRAND_THEME.dark.accentForeground,
    canvas: BRAND_THEME.dark.background,
    canopyAccent: "#FFE09A",
    docketPaper: "#3A2B21",
    field: BRAND_THEME.dark.input,
    heroActionPressed: "rgba(255, 255, 255, 0.16)",
    heroHairline: BRAND_THEME.dark.border,
    heroPressed: "rgba(255, 255, 255, 0.14)",
    ink: BRAND_THEME.dark.foreground,
    line: BRAND_THEME.dark.border,
    docketRule: "#846B55",
    marigold: "#FFCA56",
    mutedInk: BRAND_THEME.dark.mutedForeground,
    onMarigold: "#21372F",
    onMarigoldDivider: "rgba(33, 55, 47, 0.53)",
    onMarigoldHairline: BRAND_THEME.dark.border,
    onMarigoldPressed: "rgba(33, 55, 47, 0.09)",
    onPalm: BRAND_THEME.light.primaryForeground,
    onPalmMuted: "#D8EBE2",
    onPaprika: "#201713",
    palm: BRAND_THEME.light.primary,
    paprika: "#FF654B",
    paprikaPressed: "#E64E35",
    paprikaStrong: "#C9402A",
    paprikaWash: "rgba(255, 101, 75, 0.05)",
    progressTrack: "rgba(255, 244, 214, 0.2)",
    pulseCore: "rgba(10, 61, 50, 0.18)",
    pulseLine: "rgba(255, 249, 237, 0.24)",
    pulseLineSoft: "rgba(255, 249, 237, 0.18)",
    pulseShadow: "rgba(10, 61, 50, 0.34)",
    sky: "#6BB8D7",
    softBand: BRAND_THEME.dark.secondary,
  },
  light: {
    accentInk: BRAND_THEME.light.accentForeground,
    canvas: BRAND_THEME.light.background,
    canopyAccent: "#FFE09A",
    docketPaper: "#FFD0B2",
    field: BRAND_THEME.light.input,
    heroActionPressed: "rgba(255, 255, 255, 0.16)",
    heroHairline: BRAND_THEME.light.border,
    heroPressed: "rgba(255, 255, 255, 0.14)",
    ink: BRAND_THEME.light.foreground,
    line: BRAND_THEME.light.border,
    docketRule: "#876748",
    marigold: "#FFBD3E",
    mutedInk: BRAND_THEME.light.mutedForeground,
    onMarigold: "#21372F",
    onMarigoldDivider: "rgba(33, 55, 47, 0.53)",
    onMarigoldHairline: BRAND_THEME.light.border,
    onMarigoldPressed: "rgba(33, 55, 47, 0.09)",
    onPalm: BRAND_THEME.light.primaryForeground,
    onPalmMuted: "#D8EBE2",
    onPaprika: "#201713",
    palm: BRAND_THEME.light.primary,
    paprika: "#E94F2F",
    paprikaPressed: "#CC3D24",
    paprikaStrong: "#C9402A",
    paprikaWash: "rgba(233, 79, 47, 0.05)",
    progressTrack: "rgba(23, 55, 45, 0.18)",
    pulseCore: "rgba(10, 61, 50, 0.18)",
    pulseLine: "rgba(255, 249, 237, 0.24)",
    pulseLineSoft: "rgba(255, 249, 237, 0.18)",
    pulseShadow: "rgba(10, 61, 50, 0.34)",
    sky: "#79C8E8",
    softBand: BRAND_THEME.light.secondary,
  },
} as const

export type MarketDayPalette =
  (typeof MARKET_DAY_PALETTES)[keyof typeof MARKET_DAY_PALETTES]

export function useMarketDayPalette(): MarketDayPalette {
  const { colorScheme } = useColorScheme()

  return MARKET_DAY_PALETTES[colorScheme]
}
