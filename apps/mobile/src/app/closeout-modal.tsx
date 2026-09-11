import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import {
  CloseoutContent,
  CloseoutWorkflowChrome,
} from "@/components/mobile/closeout/closeout-screen"
import { useAuthContext } from "@/hooks/use-auth"
import { useRouter } from "expo-router"

export default function CloseoutModalRoute() {
  const router = useRouter()
  const { profile } = useAuthContext()

  return (
    <WorkflowModalScreen
      chrome={CloseoutWorkflowChrome}
      allowSalesRep
      closeLabel="Close closeout"
      title="Close day"
    >
      <CloseoutContent
        attendantName={profile?.name ?? "Store Owner"}
        onComplete={() => router.replace("/dashboard")}
        presentation="screen"
      />
    </WorkflowModalScreen>
  )
}
