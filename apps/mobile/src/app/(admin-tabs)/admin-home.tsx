import {
  useAdminTabs,
  useResetAdminDock,
} from "@/components/mobile/admin-tabs"
import { OperationsDashboardSurface } from "../dashboard"

export default function AdminHomeRoute() {
  const { setDockHidden } = useAdminTabs()
  useResetAdminDock()

  return (
    <OperationsDashboardSurface
      embeddedInAdminTabs
      onBottomTabVisibilityChange={setDockHidden}
    />
  )
}
