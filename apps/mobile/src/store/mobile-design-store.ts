import AsyncStorage from "@react-native-async-storage/async-storage"
import {
  emptyMobileDesignPreference,
  parseMobileDesignPreference,
  type MobileDesignPreference,
} from "@/lib/mobile-design/preference"
import type {
  MobileDesign,
  MobileDesignScreen,
} from "@/lib/mobile-design/screens"

const STORAGE_KEY = "ewatrade_mobile_design_v1"
let preference = emptyMobileDesignPreference()
let hydration: Promise<void> | undefined
let writes = Promise.resolve()
const listeners = new Set<() => void>()

function publish(next: MobileDesignPreference) {
  preference = next
  for (const listener of listeners) listener()
}

export function hydrateMobileDesign() {
  hydration ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => publish(parseMobileDesignPreference(raw)))
    .catch(() => publish(emptyMobileDesignPreference()))
  return hydration
}

function updatePreference(
  change: (current: MobileDesignPreference) => MobileDesignPreference,
) {
  const pending = writes.then(async () => {
    await hydrateMobileDesign()
    const next = change(preference)
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    publish(next)
  })
  writes = pending.catch(() => undefined)
  return pending
}

export const mobileDesignStore = {
  getSnapshot: () => preference,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  setDefault(defaultDesign: MobileDesign | null) {
    return updatePreference((current) => ({ ...current, defaultDesign }))
  },
  setScreen(screen: MobileDesignScreen, design: MobileDesign | null) {
    return updatePreference((current) => {
      const screens = { ...current.screens }
      if (design === null) delete screens[screen]
      else screens[screen] = design
      return { ...current, screens }
    })
  },
  reset() {
    return updatePreference(emptyMobileDesignPreference)
  },
}
