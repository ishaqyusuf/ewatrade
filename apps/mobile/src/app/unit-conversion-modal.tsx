import { UnitConversionContent, WorkflowModalScreen } from "@/components/mobile"
import { useRouter } from "expo-router"

export default function UnitConversionModalRoute() {
  const router = useRouter()

  return (
    <WorkflowModalScreen closeLabel="Close unit conversion" title="Convert units">
      <UnitConversionContent
        onComplete={() => router.replace("/dashboard")}
        presentation="screen"
      />
    </WorkflowModalScreen>
  )
}
