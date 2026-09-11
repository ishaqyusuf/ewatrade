import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import {
  StockIntakeChrome,
  StockIntakeContent,
} from "@/components/mobile/stock-intake/stock-intake-screen"
import { useRouter } from "expo-router"

export default function StockIntakeModalRoute() {
  const router = useRouter()

  return (
    <WorkflowModalScreen
      chrome={StockIntakeChrome}
      closeLabel="Close stock intake"
      title="Record stock"
    >
      <StockIntakeContent
        onComplete={() => router.replace("/dashboard")}
        presentation="screen"
      />
    </WorkflowModalScreen>
  )
}
