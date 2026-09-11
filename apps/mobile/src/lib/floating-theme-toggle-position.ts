export type FloatingThemeTogglePosition = {
  edge: "left" | "right"
  verticalRatio: number
}

export type FloatingThemeToggleBounds = {
  bottom: number
  left: number
  right: number
  top: number
}

export const DEFAULT_FLOATING_THEME_TOGGLE_POSITION: FloatingThemeTogglePosition =
  {
    edge: "right",
    verticalRatio: 1,
  }

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

export function resolveFloatingThemeToggleCoordinates(
  position: FloatingThemeTogglePosition,
  bounds: FloatingThemeToggleBounds,
) {
  const verticalRange = Math.max(0, bounds.bottom - bounds.top)
  return {
    x: position.edge === "left" ? bounds.left : bounds.right,
    y: bounds.top + verticalRange * clamp(position.verticalRatio, 0, 1),
  }
}

export function snapFloatingThemeTogglePosition(input: {
  bounds: FloatingThemeToggleBounds
  screenWidth: number
  size: number
  x: number
  y: number
}): FloatingThemeTogglePosition {
  const edge =
    input.x + input.size / 2 <= input.screenWidth / 2 ? "left" : "right"
  const boundedY = clamp(input.y, input.bounds.top, input.bounds.bottom)
  const verticalRange = Math.max(0, input.bounds.bottom - input.bounds.top)

  return {
    edge,
    verticalRatio:
      verticalRange === 0
        ? 0
        : clamp((boundedY - input.bounds.top) / verticalRange, 0, 1),
  }
}
