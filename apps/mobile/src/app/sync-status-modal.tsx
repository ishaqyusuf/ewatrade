import { SyncStatusContent, WorkflowModalScreen } from "@/components/mobile"
import { useRouter } from "expo-router"

export default function SyncStatusModalRoute() {
  const router = useRouter()

  return (
    <WorkflowModalScreen
      allowSalesRep
      closeLabel="Close sync status"
      title="Sync & offline"
    >
      <SyncStatusContent
        onComplete={() => router.replace("/dashboard")}
        presentation="screen"
      />
    </WorkflowModalScreen>
  )
}
