import { useBottomDockScroll } from "@/hooks/use-bottom-dock-scroll"
import type { MobileWorkspaceFeatureAvailability } from "@/lib/workspace-feature-availability"
import { useFocusEffect } from "expo-router"
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useCallback,
  useContext,
} from "react"

type AdminTabsContextValue = {
  availability: MobileWorkspaceFeatureAvailability
  availabilityResolved: boolean
  isDockHidden: boolean
  isOffline: boolean
  openCreate: () => void
  provisionalOrders: Array<{
    clientCommandId: string
    createdAtClient: Date
    customerName?: string
    customerPhone?: string
    displayTotal?: { amountMinor: number; currencyCode: string }
    lineCount: number
  }>
  setDockHidden: Dispatch<SetStateAction<boolean>>
  syncAlertCount: number
}

const AdminTabsContext = createContext<AdminTabsContextValue | null>(null)

export function AdminTabsProvider({
  children,
  value,
}: {
  children: ReactNode
  value: AdminTabsContextValue
}) {
  return (
    <AdminTabsContext.Provider value={value}>
      {children}
    </AdminTabsContext.Provider>
  )
}

export function useAdminTabs() {
  const context = useContext(AdminTabsContext)
  if (!context) {
    throw new Error("useAdminTabs must be used inside AdminTabsProvider")
  }
  return context
}

/** The tabs context when rendered inside the admin tabs, otherwise null. */
export function useOptionalAdminTabs() {
  return useContext(AdminTabsContext)
}

export function useResetAdminDock() {
  const { setDockHidden } = useAdminTabs()

  useFocusEffect(
    useCallback(() => {
      setDockHidden(false)
    }, [setDockHidden]),
  )
}

export function useAdminDockScroll() {
  const { setDockHidden } = useAdminTabs()
  return useBottomDockScroll(setDockHidden)
}
