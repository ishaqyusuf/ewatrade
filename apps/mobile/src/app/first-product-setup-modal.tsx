import {
  FirstProductSetupContent,
  WorkflowModalScreen,
} from "@/components/mobile"
import { useRouter } from "expo-router"

export default function FirstProductSetupModalRoute() {
  const router = useRouter()

  return (
    <WorkflowModalScreen closeLabel="Close item setup" title="Set up item">
      <FirstProductSetupContent
        onComplete={() => router.replace("/dashboard")}
        presentation="screen"
      />
    </WorkflowModalScreen>
  )
}
