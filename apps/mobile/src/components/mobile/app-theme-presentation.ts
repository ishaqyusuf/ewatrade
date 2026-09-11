import type { ThemeOverride } from "@/lib/theme-preference"

export type AppThemeOptionPresentation = {
  detail: string
  label: string
  preview: ThemeOverride
  selected: boolean
  value: ThemeOverride
}

export function buildAppThemeOptions({
  resolvedColorScheme,
  themeOverride,
}: {
  resolvedColorScheme: "light" | "dark"
  themeOverride: ThemeOverride
}): AppThemeOptionPresentation[] {
  return [
    {
      detail: `Follow device setting · currently ${resolvedColorScheme === "dark" ? "Dark" : "Light"}`,
      label: "System",
      preview: "system",
      selected: themeOverride === "system",
      value: "system",
    },
    {
      detail: "Always use a light background",
      label: "Light",
      preview: "light",
      selected: themeOverride === "light",
      value: "light",
    },
    {
      detail: "Always use a dark background",
      label: "Dark",
      preview: "dark",
      selected: themeOverride === "dark",
      value: "dark",
    },
  ]
}
