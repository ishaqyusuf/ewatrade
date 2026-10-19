import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { NativeServiceOriginalScreen } from "@/components/mobile/assistant/native-service-original-screen"
import { readNativeServiceOriginalTarget } from "@/components/mobile/assistant/native-service-target"
import {
  ServiceJobsChrome,
  ServiceJobsContent,
} from "@/components/mobile/service-jobs/service-jobs-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useAuthContext } from "@/hooks/use-auth"
import { isSalesRepRole } from "@/lib/mobile-roles"
import { useLocalSearchParams, useRouter } from "expo-router"

export default function ServiceJobsModalRoute() {
  const router = useRouter()
  const { target } = useLocalSearchParams<{ target?: string | string[] }>()
  const { profile } = useAuthContext()
  const closeHref = isSalesRepRole(profile?.role)
    ? "/sales-rep-home"
    : "/admin-home"
  const originalTarget = readNativeServiceOriginalTarget(target)

  if (target !== undefined)
    return (
      <WorkflowModalScreen
        back
        chrome={
          originalTarget?.kind === "service_job"
            ? ServiceJobsChrome
            : MobileWorkflowChrome
        }
        allowSalesRep
        closeHref={closeHref}
        closeLabel="Back to the assistant"
        title={
          originalTarget?.kind === "service_request_page"
            ? "Service requests"
            : originalTarget?.kind === "service_request"
              ? "Original Service Request"
              : "Original Service record"
        }
      >
        <NativeServiceOriginalScreen raw={target} />
      </WorkflowModalScreen>
    )

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
