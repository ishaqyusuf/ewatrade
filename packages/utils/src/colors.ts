const DEFAULT_COLORS = [
  "#0F766E",
  "#2563EB",
  "#7C3AED",
  "#DB2777",
  "#DC2626",
  "#EA580C",
  "#CA8A04",
  "#16A34A",
  "#0891B2",
  "#4F46E5",
]
const DEFAULT_COLOR = "#0F766E"

export function getColorFromName(value?: string | null) {
  const name = String(value ?? "").trim()
  if (!name) return DEFAULT_COLOR

  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(index)
    hash |= 0
  }

  return DEFAULT_COLORS[Math.abs(hash) % DEFAULT_COLORS.length] ?? DEFAULT_COLOR
}

export function hexToRgba(hex: string, opacity = 1) {
  const normalized = hex.replace("#", "").trim()
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : normalized

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return `rgba(0, 0, 0, ${clampOpacity(opacity)})`
  }

  const red = Number.parseInt(expanded.slice(0, 2), 16)
  const green = Number.parseInt(expanded.slice(2, 4), 16)
  const blue = Number.parseInt(expanded.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${clampOpacity(opacity)})`
}

function clampOpacity(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.min(1, Math.max(0, value))
}
