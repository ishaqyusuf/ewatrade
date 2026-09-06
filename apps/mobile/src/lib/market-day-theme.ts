import { useColorScheme } from "@/hooks/use-color"

const MARKET_DAY_PALETTES = {
  dark: {
    accentInk: "#FFCA56",
    canvas: "#091C19",
    canopyAccent: "#FFE09A",
    field: "#13302B",
    heroActionPressed: "rgba(255, 255, 255, 0.16)",
    heroHairline: "rgba(255, 255, 255, 0.34)",
    heroPressed: "rgba(255, 255, 255, 0.14)",
    ink: "#FFF4D6",
    line: "#35534A",
    marigold: "#FFCA56",
    mutedInk: "#B7C8BF",
    onMarigold: "#21372F",
    onMarigoldDivider: "rgba(33, 55, 47, 0.53)",
    onMarigoldHairline: "rgba(33, 55, 47, 0.34)",
    onMarigoldPressed: "rgba(33, 55, 47, 0.09)",
    onPalm: "#FFF9ED",
    onPalmMuted: "#D8EBE2",
    onPaprika: "#201713",
    palm: "#17684F",
    paprika: "#FF654B",
    paprikaPressed: "#E64E35",
    paprikaWash: "rgba(255, 101, 75, 0.05)",
    progressTrack: "rgba(255, 244, 214, 0.2)",
    pulseCore: "rgba(10, 61, 50, 0.18)",
    pulseLine: "rgba(255, 249, 237, 0.24)",
    pulseLineSoft: "rgba(255, 249, 237, 0.18)",
    pulseShadow: "rgba(10, 61, 50, 0.34)",
    sky: "#6BB8D7",
    softBand: "#102921",
  },
  light: {
    accentInk: "#17684F",
    canvas: "#FFF4D6",
    canopyAccent: "#FFE09A",
    field: "#FFFAF0",
    heroActionPressed: "rgba(255, 255, 255, 0.16)",
    heroHairline: "rgba(255, 255, 255, 0.34)",
    heroPressed: "rgba(255, 255, 255, 0.14)",
    ink: "#17372D",
    line: "#D9CBA7",
    marigold: "#FFBD3E",
    mutedInk: "#647168",
    onMarigold: "#21372F",
    onMarigoldDivider: "rgba(33, 55, 47, 0.53)",
    onMarigoldHairline: "rgba(33, 55, 47, 0.34)",
    onMarigoldPressed: "rgba(33, 55, 47, 0.09)",
    onPalm: "#FFF9ED",
    onPalmMuted: "#D8EBE2",
    onPaprika: "#201713",
    palm: "#17684F",
    paprika: "#E94F2F",
    paprikaPressed: "#CC3D24",
    paprikaWash: "rgba(233, 79, 47, 0.05)",
    progressTrack: "rgba(23, 55, 45, 0.18)",
    pulseCore: "rgba(10, 61, 50, 0.18)",
    pulseLine: "rgba(255, 249, 237, 0.24)",
    pulseLineSoft: "rgba(255, 249, 237, 0.18)",
    pulseShadow: "rgba(10, 61, 50, 0.34)",
    sky: "#79C8E8",
    softBand: "#FFE6A0",
  },
} as const

export type MarketDayPalette =
  (typeof MARKET_DAY_PALETTES)[keyof typeof MARKET_DAY_PALETTES]

export function useMarketDayPalette(): MarketDayPalette {
  const { colorScheme } = useColorScheme()

  return MARKET_DAY_PALETTES[colorScheme]
}
