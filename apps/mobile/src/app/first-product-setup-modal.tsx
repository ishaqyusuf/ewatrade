import {
  SimpleCatalogItemScreen,
  WorkflowModalScreen,
} from "@/components/mobile"
import { useLocalSearchParams, useRouter } from "expo-router"

export default function FirstProductSetupModalRoute() {
  const router = useRouter()
  const params = useLocalSearchParams<{ kind?: string }>()
  const initialKind =
    params.kind === "product" || params.kind === "service"
      ? params.kind
      : undefined

  return (
    <WorkflowModalScreen
      closeLabel="Close item setup"
      title={
        initialKind === "product"
          ? "Add product"
          : initialKind === "service"
            ? "Add service"
            : "Set up item"
      }
    >
      <SimpleCatalogItemScreen
        initialKind={initialKind}
        onComplete={() => router.replace("/catalog-items-modal")}
      />
    </WorkflowModalScreen>
  )
}
