import { ServiceOrdersContent, WorkflowModalScreen } from "@/components/mobile"
import { useAuthContext } from "@/hooks/use-auth"
import { isSalesRepRole } from "@/lib/mobile-roles"

export default function ServiceOrdersModalRoute() {
  const { profile } = useAuthContext()
  const closeHref = isSalesRepRole(profile?.role)
    ? "/sales-rep-home"
    : "/admin-home"

  return (
    <WorkflowModalScreen
      allowSalesRep
      closeHref={closeHref}
      closeLabel="Close service orders"
      title="Service orders"
    >
      <ServiceOrdersContent />
    </WorkflowModalScreen>
  )
}
