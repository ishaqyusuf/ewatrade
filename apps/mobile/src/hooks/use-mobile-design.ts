import { useSyncExternalStore } from "react"
import { shouldShowInternalDesignSystemEntry } from "@/lib/app-variant"
import { resolveMobileDesign } from "@/lib/mobile-design/preference"
import type { MobileDesignScreen } from "@/lib/mobile-design/screens"
import { mobileDesignStore } from "@/store/mobile-design-store"

export function useMobileDesignPreference() {
  return useSyncExternalStore(
    mobileDesignStore.subscribe,
    mobileDesignStore.getSnapshot,
    mobileDesignStore.getSnapshot,
  )
}

export function useMobileDesign(screen: MobileDesignScreen) {
  const preference = useMobileDesignPreference()
  return resolveMobileDesign(
    screen,
    preference,
    shouldShowInternalDesignSystemEntry(),
  )
}
