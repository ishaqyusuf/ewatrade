import {
  StaffInviteContent,
  StaffChrome,
} from "@/components/mobile/staff/staff-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"

export default function StaffInviteModalRoute() {
  return (
    <WorkflowModalScreen
      chrome={StaffChrome}
      closeLabel="Close staff"
      title="Staff"
    >
      <StaffInviteContent />
    </WorkflowModalScreen>
  )
}
