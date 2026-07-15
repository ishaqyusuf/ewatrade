import { CloseoutContent, WorkflowModalScreen } from "@/components/mobile"
import { useAuthContext } from "@/hooks/use-auth"
import { useRouter } from "expo-router"

export default function CloseoutModalRoute() {
  const router = useRouter()
  const { profile } = useAuthContext()

  return (
    <WorkflowModalScreen
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
