import type { MobileWorkspaceFeatureAvailability } from "@/lib/workspace-feature-availability"
import { useFocusEffect } from "expo-router"
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useRef,
} from "react"
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native"

type AdminTabsContextValue = {
  availability: MobileWorkspaceFeatureAvailability
  isDockHidden: boolean
  isOffline: boolean
  openCreate: () => void
  provisionalOrders: Array<{
    clientCommandId: string
    createdAtClient: Date
    customerName?: string
    customerPhone?: string
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
  const lastScrollYRef = useRef(0)
  useResetAdminDock()

  return useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const scrollY = Math.max(0, event.nativeEvent.contentOffset.y)
      const delta = scrollY - lastScrollYRef.current

      if (scrollY <= 1) setDockHidden(false)
      else if (delta > 4) setDockHidden(true)
      else if (delta < -4) setDockHidden(false)

      lastScrollYRef.current = scrollY
    },
    [setDockHidden],
  )
}
