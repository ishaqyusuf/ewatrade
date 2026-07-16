import { StaffInviteContent, WorkflowModalScreen } from "@/components/mobile"
import { useRouter } from "expo-router"

export default function StaffInviteModalRoute() {
  const router = useRouter()

  return (
    <WorkflowModalScreen closeLabel="Close staff invite" title="Sales reps">
      <StaffInviteContent
        ctaPlacement="sticky"
        onComplete={() => router.replace("/dashboard")}
        presentation="screen"
      />
    </WorkflowModalScreen>
  )
}
