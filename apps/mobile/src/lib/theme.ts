import { DarkTheme, DefaultTheme, type Theme } from "@react-navigation/native"

export const THEME = {
  light: {
    background: "rgb(247, 249, 247)",
    foreground: "rgb(17, 24, 20)",

    card: "rgb(255, 255, 255)",
    cardForeground: "rgb(17, 24, 20)",

    popover: "rgb(255, 255, 255)",
    popoverForeground: "rgb(17, 24, 20)",

    primary: "rgb(13, 94, 82)",
    primaryForeground: "rgb(240, 253, 250)",

    success: "rgb(22, 163, 74)",
    successForeground: "rgb(240, 253, 244)",

    warn: "rgb(217, 119, 6)",
    warnForeground: "rgb(255, 247, 237)",

    secondary: "rgb(238, 243, 240)",
    secondaryForeground: "rgb(34, 48, 42)",

    muted: "rgb(225, 233, 229)",
    mutedForeground: "rgb(92, 106, 100)",

    accent: "rgb(219, 245, 239)",
    accentForeground: "rgb(13, 94, 82)",

    destructive: "rgb(185, 28, 28)",
    destructiveForeground: "rgb(254, 242, 242)",

    border: "rgb(203, 215, 209)",
    input: "rgb(225, 233, 229)",
    ring: "rgb(20, 184, 166)",

    radius: "0.65rem",

    chart1: "rgb(13, 94, 82)",
    chart2: "rgb(13, 148, 136)",
    chart3: "rgb(217, 119, 6)",
    chart4: "rgb(31, 41, 55)",
    chart5: "rgb(225, 29, 72)",
  },

  dark: {
    background: "rgb(18, 18, 18)",
    foreground: "rgb(250, 250, 250)",

    card: "rgb(30, 30, 30)",
    cardForeground: "rgb(250, 250, 250)",

    popover: "rgb(30, 30, 30)",
    popoverForeground: "rgb(250, 250, 250)",

    primary: "rgb(45, 212, 191)",
    primaryForeground: "rgb(4, 47, 46)",

    success: "rgb(34, 197, 94)",
    successForeground: "rgb(236, 253, 245)",

    warn: "rgb(245, 158, 11)",
    warnForeground: "rgb(255, 251, 235)",

    secondary: "rgb(46, 46, 46)",
    secondaryForeground: "rgb(245, 245, 245)",

    muted: "rgb(38, 38, 38)",
    mutedForeground: "rgb(163, 163, 163)",

    accent: "rgb(64, 64, 64)",
    accentForeground: "rgb(245, 245, 245)",

    destructive: "rgb(220, 38, 38)",
    destructiveForeground: "rgb(254, 242, 242)",

    border: "rgb(46, 46, 46)",
    input: "rgb(56, 56, 56)",
    ring: "rgb(45, 212, 191)",

    radius: "0.65rem",

    chart1: "rgb(45, 212, 191)",
    chart2: "rgb(34, 197, 94)",
    chart3: "rgb(251, 191, 36)",
    chart4: "rgb(115, 115, 115)",
    chart5: "rgb(244, 63, 94)",
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
