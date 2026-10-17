import { BRAND_THEME } from "./brand-theme"
import { GREEN_TILL_THEME } from "./green-till-theme"

// Pure palette: no React Native imports, so bun tests can read it.
export const THEME = {
  light: {
    success: "rgb(22, 163, 74)",
    successForeground: "rgb(240, 253, 244)",

    warn: "rgb(217, 119, 6)",
    warnForeground: "rgb(255, 247, 237)",

    destructive: "rgb(185, 28, 28)",
    destructiveForeground: "rgb(254, 242, 242)",

    overlay: "rgba(0, 0, 0, 0.48)",

    skeleton: "rgb(226, 232, 229)",
    skeletonHighlight: "rgba(255, 255, 255, 0.75)",

    radius: "0.65rem",

    chart2: "rgb(13, 148, 136)",
    chart3: "rgb(217, 119, 6)",
    chart4: "rgb(31, 41, 55)",
    chart5: "rgb(225, 29, 72)",
    ...BRAND_THEME.light,
  },

  dark: {
    success: "rgb(34, 197, 94)",
    successForeground: "rgb(236, 253, 245)",

    warn: "rgb(245, 158, 11)",
    warnForeground: "rgb(255, 251, 235)",

    destructive: "rgb(220, 38, 38)",
    destructiveForeground: "rgb(254, 242, 242)",

    overlay: "rgba(0, 0, 0, 0.68)",

    skeleton: "rgb(40, 51, 46)",
    skeletonHighlight: "rgba(255, 255, 255, 0.08)",

    radius: "0.65rem",

    chart2: "rgb(34, 197, 94)",
    chart3: "rgb(251, 191, 36)",
    chart4: "rgb(115, 115, 115)",
    chart5: "rgb(244, 63, 94)",
    ...BRAND_THEME.dark,
  },
}

type ColorScheme = "dark" | "light"

/** Every color CSS variable the app's className tokens read, for one scheme. */
export function themeColorVars(colorScheme: ColorScheme) {
  const colors = THEME[colorScheme]
  const greenTill = GREEN_TILL_THEME[colorScheme]

  return {
    "--accent": colors.accent,
    "--accent-foreground": colors.accentForeground,
    "--background": colors.background,
    "--border": colors.border,
    "--card": colors.card,
    "--card-foreground": colors.cardForeground,
    "--chart-1": colors.chart1,
    "--chart-2": colors.chart2,
    "--chart-3": colors.chart3,
    "--chart-4": colors.chart4,
    "--chart-5": colors.chart5,
    "--destructive": colors.destructive,
    "--destructive-foreground": colors.destructiveForeground,
    "--foreground": colors.foreground,
    "--input": colors.input,
    "--muted": colors.muted,
    "--muted-foreground": colors.mutedForeground,
    "--overlay": colors.overlay,
    "--popover": colors.popover,
    "--popover-foreground": colors.popoverForeground,
    "--primary": colors.primary,
    "--primary-foreground": colors.primaryForeground,
    "--ring": colors.ring,
    "--secondary": colors.secondary,
    "--secondary-foreground": colors.secondaryForeground,
    "--success": colors.success,
    "--success-foreground": colors.successForeground,
    "--warn": colors.warn,
    "--warn-foreground": colors.warnForeground,
    "--gold": greenTill.gold,
    "--gold-foreground": greenTill.goldForeground,
    "--ink": greenTill.ink,
    "--cream": greenTill.cream,
    "--tint-mint": greenTill.mint,
    "--tint-mint-foreground": greenTill.mintForeground,
    "--tint-amber": greenTill.amber,
    "--tint-amber-foreground": greenTill.amberForeground,
    "--tint-sky": greenTill.sky,
    "--tint-sky-foreground": greenTill.skyForeground,
    "--tint-lilac": greenTill.lilac,
    "--tint-lilac-foreground": greenTill.lilacForeground,
    "--tint-rose": greenTill.rose,
    "--tint-rose-foreground": greenTill.roseForeground,
  } satisfies Record<`--${string}`, string>
}
