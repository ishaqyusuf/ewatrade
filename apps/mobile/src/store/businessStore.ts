import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { zustandStorage } from "./mmkv"

export type RetailOpsBusiness = {
  category?: string
  country?: string
  createdAt: string
  currency?: string
  id: string
  name: string
  salesMethod?: string
  teamSize?: string
  type?: string
}

type CreateBusinessInput = {
  category?: string
  country?: string
  currency?: string
  id?: string
  name: string
  salesMethod?: string
  teamSize?: string
  type?: string
}

type BusinessState = {
  activeBusinessId: string | null
  businesses: RetailOpsBusiness[]
  createBusiness: (input: CreateBusinessInput) => RetailOpsBusiness
  ensureBusiness: (input: CreateBusinessInput) => RetailOpsBusiness
  hasHydrated: boolean
  setActiveBusiness: (businessId: string) => void
  updateBusinessCurrency: (businessId: string, currency: string) => void
  setHasHydrated: (hasHydrated: boolean) => void
}

function createId() {
  return `business-${Date.now()}-${Math.round(Math.random() * 10000)}`
}

function normalizeName(value: string) {
  return value.trim().toLowerCase()
}

function createBusinessRecord(input: CreateBusinessInput): RetailOpsBusiness {
  return {
    category: input.category?.trim() || undefined,
    country: input.country?.trim() || "Nigeria",
    createdAt: new Date().toISOString(),
    currency: input.currency?.trim() || "NGN",
    id: input.id?.trim() || createId(),
    name: input.name.trim() || "My Business",
    salesMethod: input.salesMethod?.trim() || "In-store sales",
    teamSize: input.teamSize?.trim() || undefined,
    type: input.type?.trim() || "Retail",
  }
}

export const useBusinessStore = create<BusinessState>()(
  persist(
    (set, get) => ({
      activeBusinessId: null,
      businesses: [],
      hasHydrated: false,
      createBusiness: (input) => {
        const business = createBusinessRecord(input)

        set((state) => ({
          activeBusinessId: business.id,
          businesses: [business, ...state.businesses],
        }))

        return business
      },
      ensureBusiness: (input) => {
        const normalizedName = normalizeName(input.name)
        const existingBusiness = get().businesses.find(
          (business) => normalizeName(business.name) === normalizedName,
        )

        if (existingBusiness) {
          const updatedBusiness = {
            ...existingBusiness,
            currency:
              input.currency?.trim() || existingBusiness.currency || "NGN",
          }
          set((state) => ({
            activeBusinessId: existingBusiness.id,
            businesses: state.businesses.map((business) =>
              business.id === existingBusiness.id ? updatedBusiness : business,
            ),
          }))
          return updatedBusiness
        }

        return get().createBusiness(input)
      },
      setActiveBusiness: (businessId) => set({ activeBusinessId: businessId }),
      updateBusinessCurrency: (businessId, currency) =>
        set((state) => ({
          businesses: state.businesses.map((business) =>
            business.id === businessId
              ? { ...business, currency: currency.trim() || "NGN" }
              : business,
          ),
        })),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: "ewatrade-mobile-businesses",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        activeBusinessId: state.activeBusinessId,
        businesses: state.businesses,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)
