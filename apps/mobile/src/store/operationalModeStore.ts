import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { zustandStorage } from "./mmkv"

type OperationalModeState = {
  activeBusinessId: string | null
  offlineAccessByBusinessId: Record<string, boolean>
  isOfflineMode: boolean
  setActiveBusiness: (businessId: string | null) => void
  setOfflineAccess: (businessId: string, enabled: boolean) => void
  setOfflineMode: (businessId: string, isOfflineMode: boolean) => void
}

export function isOfflineAccessAllowed(
  offlineAccessByBusinessId: Record<string, boolean>,
  businessId: string | null | undefined,
) {
  return businessId ? offlineAccessByBusinessId[businessId] === true : false
}

export const useOperationalModeStore = create<OperationalModeState>()(
  persist(
    (set) => ({
      activeBusinessId: null,
      offlineAccessByBusinessId: {},
      isOfflineMode: false,
      setActiveBusiness: (activeBusinessId) =>
        set((state) => ({
          activeBusinessId,
          isOfflineMode:
            state.activeBusinessId === activeBusinessId
              ? state.isOfflineMode
              : false,
        })),
      setOfflineAccess: (businessId, enabled) =>
        set((state) => ({
          isOfflineMode:
            businessId === state.activeBusinessId && !enabled
              ? false
              : state.isOfflineMode,
          offlineAccessByBusinessId: {
            ...state.offlineAccessByBusinessId,
            [businessId]: enabled,
          },
        })),
      setOfflineMode: (businessId, isOfflineMode) =>
        set((state) => ({
          isOfflineMode:
            businessId === state.activeBusinessId &&
            state.offlineAccessByBusinessId[businessId] === true
              ? isOfflineMode
              : false,
        })),
    }),
    {
      name: "ewatrade-mobile-operational-mode",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
)

// Memory-only generation: returning to the same mode/business cannot revive
// observations captured before an intervening operational-mode transition.
let operationalModeGeneration = 0
useOperationalModeStore.subscribe((state, previous) => {
  if (
    state.activeBusinessId !== previous.activeBusinessId ||
    state.isOfflineMode !== previous.isOfflineMode ||
    isOfflineAccessAllowed(
      state.offlineAccessByBusinessId,
      state.activeBusinessId,
    ) !==
      isOfflineAccessAllowed(
        previous.offlineAccessByBusinessId,
        previous.activeBusinessId,
      )
  )
    operationalModeGeneration++
})

export function getOperationalModeGeneration() {
  return operationalModeGeneration
}
