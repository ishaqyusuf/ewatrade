import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import {
  CatalogModalChrome,
  CatalogModalScreen,
} from "@/components/mobile/catalog/catalog-modal-screen"

export default function CatalogItemsModalRoute() {
  return (
    <WorkflowModalScreen
      chrome={CatalogModalChrome}
      closeLabel="Close catalog"
      title="Catalog"
    >
      <CatalogModalScreen />
    </WorkflowModalScreen>
  )
}
