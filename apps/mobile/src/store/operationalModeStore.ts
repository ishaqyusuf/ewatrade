import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { zustandStorage } from "./mmkv"

type OperationalModeState = {
  isOfflineMode: boolean
  setOfflineMode: (isOfflineMode: boolean) => void
  toggleOfflineMode: () => void
}

export const useOperationalModeStore = create<OperationalModeState>()(
  persist(
    (set) => ({
      isOfflineMode: false,
      setOfflineMode: (isOfflineMode) => set({ isOfflineMode }),
      toggleOfflineMode: () =>
        set((state) => ({ isOfflineMode: !state.isOfflineMode })),
    }),
    {
      name: "ewatrade-mobile-operational-mode",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
)
