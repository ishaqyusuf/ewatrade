import {
  BusinessSwitchContent,
  BusinessSwitchChrome,
} from "@/components/mobile/business-switch/business-switch-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { BUSINESS_SWITCH_COPY } from "@/components/mobile/business-switch-presentation"

export default function BusinessSwitchModalRoute() {
  return (
    <WorkflowModalScreen
      closeLabel="Close workspaces"
      title={BUSINESS_SWITCH_COPY.title}
      chrome={BusinessSwitchChrome}
    >
      <BusinessSwitchContent />
    </WorkflowModalScreen>
  )
}
