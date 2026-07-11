import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { zustandStorage } from "./mmkv";

type OnboardingState = {
  hasCompletedOnboarding: boolean;
  hasHydrated: boolean;
  completeOnboarding: (hasCompletedOnboarding?: boolean) => void;
  resetOnboarding: () => void;
  setHasHydrated: (hasHydrated: boolean) => void;
};

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      hasHydrated: false,
      completeOnboarding: (hasCompletedOnboarding = true) =>
        set({ hasCompletedOnboarding }),
      resetOnboarding: () => set({ hasCompletedOnboarding: false }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: "ewatrade-mobile-onboarding",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        hasCompletedOnboarding: state.hasCompletedOnboarding,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
