import { useAuthContext } from "@/hooks/use-auth"
import { isSalesRepRole } from "@/lib/mobile-roles"
import { Redirect } from "expo-router"

export default function DashboardCompatibilityRoute() {
  const { profile } = useAuthContext()
  return (
    <Redirect
      href={isSalesRepRole(profile?.role) ? "/sales-rep-home" : "/admin-home"}
    />
  )
}
