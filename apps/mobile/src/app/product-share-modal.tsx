import { ProductShareContent, WorkflowModalScreen } from "@/components/mobile"
import { useRouter } from "expo-router"

export default function ProductShareModalRoute() {
  const router = useRouter()

  return (
    <WorkflowModalScreen closeLabel="Close product links" title="Product links">
      <ProductShareContent
        onComplete={() => router.replace("/dashboard")}
        presentation="screen"
      />
    </WorkflowModalScreen>
  )
}
