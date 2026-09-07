export const LARGE_TEXT_FONT_SCALE = 1.5
export const LARGE_TEXT_EFFECTIVE_WIDTH = 280
export const COMPACT_CONTROL_FONT_SCALE_CAP = 1.35
export const DISPLAY_TEXT_FONT_SCALE_CAP = 1.6

function normalizeFontScale(fontScale: number) {
  return Number.isFinite(fontScale) ? Math.max(fontScale, 1) : 1
}

export function resolveDisplayTextScale(fontScale: number) {
  return Math.min(normalizeFontScale(fontScale), DISPLAY_TEXT_FONT_SCALE_CAP)
}

export function shouldUseLargeTextLayout({
  fontScale,
  width,
}: {
  fontScale: number
  width: number
}) {
  const safeFontScale = normalizeFontScale(fontScale)
  const effectiveWidth = width / safeFontScale

  return (
    safeFontScale >= LARGE_TEXT_FONT_SCALE ||
    effectiveWidth < LARGE_TEXT_EFFECTIVE_WIDTH
  )
}
