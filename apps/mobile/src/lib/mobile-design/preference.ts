import {
  isMobileDesign,
  isMobileDesignScreen,
  type MobileDesign,
  type MobileDesignScreen,
} from "./screens"
import { MOBILE_DESIGN_RELEASE, MODULARIZED_SCREENS } from "./release"

export type MobileDesignPreference = {
  version: 1
  defaultDesign: MobileDesign | null
  screens: Partial<Record<MobileDesignScreen, MobileDesign>>
}

export function emptyMobileDesignPreference(): MobileDesignPreference {
  return { version: 1, defaultDesign: null, screens: {} }
}

export function parseMobileDesignPreference(
  raw: string | null,
): MobileDesignPreference {
  if (!raw) return emptyMobileDesignPreference()
  try {
    const value: unknown = JSON.parse(raw)
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      value.version !== 1
    ) {
      return emptyMobileDesignPreference()
    }
    const preference = emptyMobileDesignPreference()
    if ("defaultDesign" in value && isMobileDesign(value.defaultDesign)) {
      preference.defaultDesign = value.defaultDesign
    }
    if (
      "screens" in value &&
      value.screens &&
      typeof value.screens === "object"
    ) {
      for (const [screen, design] of Object.entries(value.screens)) {
        if (isMobileDesignScreen(screen) && isMobileDesign(design)) {
          preference.screens[screen] = design
        }
      }
    }
    return preference
  } catch {
    return emptyMobileDesignPreference()
  }
}

export function resolveMobileDesign(
  screen: MobileDesignScreen,
  preference: MobileDesignPreference,
  allowPreview: boolean,
): MobileDesign {
  const requested = allowPreview
    ? (preference.screens[screen] ??
      preference.defaultDesign ??
      MOBILE_DESIGN_RELEASE.screens[screen] ??
      MOBILE_DESIGN_RELEASE.defaultDesign)
    : (MOBILE_DESIGN_RELEASE.screens[screen] ??
      MOBILE_DESIGN_RELEASE.defaultDesign)
  return requested === "market-day" && !MODULARIZED_SCREENS.has(screen)
    ? "classic"
    : requested
}
