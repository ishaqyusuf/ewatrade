import { NativeBusinessReportScreen } from "@/components/mobile/assistant/native-business-report-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function BusinessReportRoute() {
  const { target } = useLocalSearchParams<{ target?: string | string[] }>()
  return (
    <WorkflowModalScreen
      allowSalesRep
      back
      title="Business report"
      closeLabel="Back to the assistant"
    >
      <NativeBusinessReportScreen raw={target} />
    </WorkflowModalScreen>
  )
}
