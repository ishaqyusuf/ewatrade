import { StaffInviteContent, WorkflowModalScreen } from "@/components/mobile"

export default function StaffInviteModalRoute() {
  return (
    <WorkflowModalScreen closeLabel="Close staff" title="Staff">
      <StaffInviteContent />
    </WorkflowModalScreen>
  )
}
