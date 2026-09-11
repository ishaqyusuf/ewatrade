import type { ThemeOverride } from "@/lib/theme-preference"

export type AppThemeSelectionResult = "failed" | "saved" | "unchanged"

export async function commitAppThemeSelection({
  apply,
  current,
  next,
  persist,
}: {
  apply: (value: ThemeOverride) => void
  current: ThemeOverride
  next: ThemeOverride
  persist: (value: ThemeOverride) => Promise<void>
}): Promise<AppThemeSelectionResult> {
  if (current === next) return "unchanged"

  apply(next)
  try {
    await persist(next)
    return "saved"
  } catch {
    apply(current)
    return "failed"
  }
}
