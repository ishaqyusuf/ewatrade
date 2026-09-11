import {
  CatalogSetupWorkflowChrome,
  SimpleCatalogItemScreen,
} from "@/components/mobile/catalog-setup/catalog-setup-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { showOperationSuccess } from "@/lib/operation-success-navigation"
import { useLocalSearchParams, useNavigation } from "expo-router"

export default function FirstProductSetupModalRoute() {
  const navigation = useNavigation()
  const params = useLocalSearchParams<{ kind?: string }>()
  const initialKind =
    params.kind === "product" || params.kind === "service"
      ? params.kind
      : undefined

  return (
    <WorkflowModalScreen
      chrome={CatalogSetupWorkflowChrome}
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
        onComplete={(completion) =>
          showOperationSuccess(navigation, {
            kind: completion.kind,
            name: completion.name,
            status: "created",
          })
        }
      />
    </WorkflowModalScreen>
  )
}
