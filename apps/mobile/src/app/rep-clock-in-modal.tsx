import { RepClockInContent, WorkflowModalScreen } from "@/components/mobile"
import { useAuthContext } from "@/hooks/use-auth"
import { useRouter } from "expo-router"

export default function RepClockInModalRoute() {
  const router = useRouter()
  const { profile } = useAuthContext()

  return (
    <WorkflowModalScreen
      allowSalesRep
      closeLabel="Close clock in"
      title="Clock in"
    >
      <RepClockInContent
        attendantName={profile?.name ?? "Store Owner"}
        onComplete={() => router.replace("/dashboard")}
        presentation="screen"
      />
    </WorkflowModalScreen>
  )
}
