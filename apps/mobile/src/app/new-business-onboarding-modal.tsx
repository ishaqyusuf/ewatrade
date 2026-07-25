import {
  NewBusinessOnboardingScreen,
  WorkflowModalScreen,
} from "@/components/mobile"

export default function NewBusinessOnboardingModalRoute() {
  return (
    <WorkflowModalScreen
      closeHref="/business-switch-modal"
      closeLabel="Close new business setup"
      keyboardBottomOffset={180}
      title="Add business"
    >
      <NewBusinessOnboardingScreen />
    </WorkflowModalScreen>
  )
}
