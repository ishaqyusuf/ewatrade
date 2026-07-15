import { ReportsContent, WorkflowModalScreen } from "@/components/mobile"
import { useRouter } from "expo-router"

export default function ReportsModalRoute() {
  const router = useRouter()

  return (
    <WorkflowModalScreen closeLabel="Close reports" title="Reports">
      <ReportsContent
        onComplete={() => router.replace("/dashboard")}
        presentation="screen"
      />
    </WorkflowModalScreen>
  )
}
