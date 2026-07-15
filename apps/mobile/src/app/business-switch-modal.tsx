import { BusinessSwitchContent, WorkflowModalScreen } from "@/components/mobile"
import { useRouter } from "expo-router"

export default function BusinessSwitchModalRoute() {
  const router = useRouter()

  return (
    <WorkflowModalScreen closeLabel="Close businesses" title="Businesses">
      <BusinessSwitchContent
        onComplete={() => router.replace("/dashboard")}
        presentation="screen"
      />
    </WorkflowModalScreen>
  )
}
