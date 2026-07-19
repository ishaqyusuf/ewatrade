import {
  SimpleCatalogItemScreen,
  WorkflowModalScreen,
} from "@/components/mobile"
import { useRouter } from "expo-router"

export default function FirstProductSetupModalRoute() {
  const router = useRouter()

  return (
    <WorkflowModalScreen closeLabel="Close item setup" title="Set up item">
      <SimpleCatalogItemScreen
        onComplete={() => router.replace("/catalog-items-modal")}
      />
    </WorkflowModalScreen>
  )
}
