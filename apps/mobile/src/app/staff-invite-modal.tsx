import { NativeStaffReadScreen } from "@/components/mobile/assistant/native-staff-read-screen"
import { readNativeStaffReadTarget } from "@/components/mobile/assistant/native-staff-read-target"
import { StaffOriginalScreen } from "@/components/mobile/assistant/staff-original-screen"
import {
  StaffChrome,
  StaffInviteContent,
} from "@/components/mobile/staff/staff-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function StaffInviteModalRoute() {
  const { target } = useLocalSearchParams<{ target?: string | string[] }>()
  const readTarget = readNativeStaffReadTarget(target)
  if (target !== undefined)
    return (
      <WorkflowModalScreen
        back
        chrome={StaffChrome}
        title={readTarget ? "Staff records" : "Original staff record"}
        closeLabel="Back to the assistant"
        closeHref="/admin-home"
      >
        {readTarget ? (
          <NativeStaffReadScreen target={readTarget} />
        ) : (
          <StaffOriginalScreen raw={target} />
        )}
      </WorkflowModalScreen>
    )
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
