import { DarkTheme, DefaultTheme, type Theme } from "@react-navigation/native"
import { BRAND_THEME } from "./brand-theme"

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

export const NAV_THEME: Record<"light" | "dark", Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      background: THEME.light.background,
      border: THEME.light.border,
      card: THEME.light.card,
      notification: THEME.light.destructive,
      primary: THEME.light.primary,
      text: THEME.light.foreground,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      background: THEME.dark.background,
      border: THEME.dark.border,
      card: THEME.dark.card,
      notification: THEME.dark.destructive,
      primary: THEME.dark.primary,
      text: THEME.dark.foreground,
    },
  },
}
