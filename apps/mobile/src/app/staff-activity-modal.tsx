import { StaffActivityScreen } from "@/components/mobile/assistant/staff-activity-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function StaffActivityRoute() {
  const { target } = useLocalSearchParams<{ target?: string }>()
  return (
    <WorkflowModalScreen
      back
      title="Staff activity"
      closeLabel="Back to the assistant"
      closeHref="/admin-home"
    >
      <StaffActivityScreen raw={target} />
    </WorkflowModalScreen>
  )
}
