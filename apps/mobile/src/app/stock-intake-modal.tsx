import { StockIntakeContent, WorkflowModalScreen } from "@/components/mobile"
import { useRouter } from "expo-router"

export default function StockIntakeModalRoute() {
  const router = useRouter()

  return (
    <WorkflowModalScreen closeLabel="Close stock intake" title="Record stock">
      <StockIntakeContent
        onComplete={() => router.replace("/dashboard")}
        presentation="screen"
      />
    </WorkflowModalScreen>
  )
}
