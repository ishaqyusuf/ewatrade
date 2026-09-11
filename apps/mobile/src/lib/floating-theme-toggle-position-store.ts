import AsyncStorage from "@react-native-async-storage/async-storage"
import {
  DEFAULT_FLOATING_THEME_TOGGLE_POSITION,
  type FloatingThemeTogglePosition,
} from "./floating-theme-toggle-position"

const FLOATING_THEME_TOGGLE_POSITION_KEY =
  "ewatrade:floating-theme-toggle-position:v1"

function clampRatio(value: number) {
  return Math.min(Math.max(value, 0), 1)
}

export async function getFloatingThemeTogglePosition() {
  try {
    const stored = await AsyncStorage.getItem(
      FLOATING_THEME_TOGGLE_POSITION_KEY,
    )
    if (!stored) return DEFAULT_FLOATING_THEME_TOGGLE_POSITION
    const parsed = JSON.parse(stored) as Partial<FloatingThemeTogglePosition>
    if (
      (parsed.edge !== "left" && parsed.edge !== "right") ||
      typeof parsed.verticalRatio !== "number" ||
      !Number.isFinite(parsed.verticalRatio)
    ) {
      return DEFAULT_FLOATING_THEME_TOGGLE_POSITION
    }
    return {
      edge: parsed.edge,
      verticalRatio: clampRatio(parsed.verticalRatio),
    }
  } catch {
    return DEFAULT_FLOATING_THEME_TOGGLE_POSITION
  }
}

export async function setFloatingThemeTogglePosition(
  position: FloatingThemeTogglePosition,
) {
  await AsyncStorage.setItem(
    FLOATING_THEME_TOGGLE_POSITION_KEY,
    JSON.stringify({
      edge: position.edge,
      verticalRatio: clampRatio(position.verticalRatio),
    }),
  )
}
