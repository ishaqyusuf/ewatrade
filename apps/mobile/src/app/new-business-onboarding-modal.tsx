import {
  NewBusinessOnboardingScreen,
  NewBusinessWorkflowChrome,
} from "@/components/mobile/new-business/new-business-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"

export default function NewBusinessOnboardingModalRoute() {
  return (
    <WorkflowModalScreen
      closeHref="/business-switch-modal"
      closeLabel="Close new business setup"
      chrome={NewBusinessWorkflowChrome}
      title="Add business"
    >
      <NewBusinessOnboardingScreen />
    </WorkflowModalScreen>
  )
}
