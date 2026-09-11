import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import {
  UnitConversionChrome,
  UnitConversionContent,
} from "@/components/mobile/unit-conversion/unit-conversion-screen"
import { useRouter } from "expo-router"

export default function UnitConversionModalRoute() {
  const router = useRouter()

  return (
    <WorkflowModalScreen
      chrome={UnitConversionChrome}
      closeLabel="Close unit conversion"
      title="Convert units"
    >
      <UnitConversionContent
        onComplete={() => router.replace("/dashboard")}
        presentation="screen"
      />
    </WorkflowModalScreen>
  )
}
