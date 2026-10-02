import type { ReactNode } from "react"
import type { HomeJourney } from "./home-journey-model"

export type HomeMetric = { label: string; value: string; detail: string }
export type HomeOrdersState =
  | "loading"
  | "unavailable"
  | "offline-empty"
  | "queued"
  | "empty"
  | "loaded"
export type HomeJourneyPresentationProps = {
  journey: HomeJourney
  isOffline: boolean
  availabilityStale: boolean
  syncLabel: string
  syncAttention: boolean
  primaryMetric: HomeMetric
  recentOrderMetric: HomeMetric
  revenueMetric: HomeMetric
  ordersState: HomeOrdersState
  recentOrders: ReactNode
  canManageTeam: boolean
  teamPreferenceError: string | null
  teamPreferenceSaving: boolean
  onDismissTeam: () => void
  onAddItem: () => void
  onCatalog: () => void
  onCreateOrder: () => void
  onOrders: () => void
  onTeam: () => void
  onSync: () => void
  onRetry: () => void
  onOperationalAction: () => void
  operationalActionLabel: string
}
