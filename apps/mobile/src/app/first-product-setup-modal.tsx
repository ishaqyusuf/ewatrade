import {
  CatalogSetupWorkflowChrome,
  SimpleCatalogItemScreen,
} from "@/components/mobile/catalog-setup/catalog-setup-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { showOperationSuccess } from "@/lib/operation-success-navigation"
import { useLocalSearchParams, useNavigation } from "expo-router"

export default function FirstProductSetupModalRoute() {
  const navigation = useNavigation()
  const params = useLocalSearchParams<{
    kind?: string
    name?: string
    price?: string
    barcode?: string
    from?: string
  }>()
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
          ? "Add item"
          : initialKind === "service"
            ? "Add service"
            : "Add item"
      }
    >
      <SimpleCatalogItemScreen
        initialKind={initialKind}
        initialName={params.name}
        initialPrice={params.price}
        initialBarcode={params.barcode}
        onComplete={(completion) =>
          // From a sale scan: go straight back so the sale scans the new item in.
          params.from === "sale"
            ? navigation.goBack()
            : showOperationSuccess(navigation, {
                kind: completion.kind,
                name: completion.name,
                status: "created",
                usage: completion.usage,
              })
        }
      />
    </WorkflowModalScreen>
  )
}
