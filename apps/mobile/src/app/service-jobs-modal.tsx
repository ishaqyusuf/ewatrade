import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import {
  ServiceJobsContent,
  ServiceJobsChrome,
} from "@/components/mobile/service-jobs/service-jobs-screen"
import { useAuthContext } from "@/hooks/use-auth"
import { isSalesRepRole } from "@/lib/mobile-roles"
import { useRouter } from "expo-router"

export default function ServiceJobsModalRoute() {
  const router = useRouter()
  const { profile } = useAuthContext()
  const closeHref = isSalesRepRole(profile?.role)
    ? "/sales-rep-home"
    : "/admin-home"

  return (
    <WorkflowModalScreen
      chrome={ServiceJobsChrome}
      allowSalesRep
      closeHref={closeHref}
      closeLabel="Close service jobs"
      title="Service jobs"
    >
      <ServiceJobsContent
        onCreateOrder={() =>
          router.push("/create-sale-modal?kind=service" as never)
        }
      />
    </WorkflowModalScreen>
  )
}
