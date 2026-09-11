import type { SimpleCatalogItemScreenProps } from "./catalog-setup-model"
import { CatalogSetupView } from "./catalog-setup-view"
import { useCatalogSetup } from "./use-catalog-setup"
import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import type { WorkflowModalChromeProps } from "@/components/mobile/workflow-modal-screen"

export function CatalogSetupWorkflowChrome(props: WorkflowModalChromeProps) {
  return <MobileWorkflowChrome {...props} screen="first-product" />
}

export function SimpleCatalogItemScreen(props: SimpleCatalogItemScreenProps) {
  const model = useCatalogSetup(props)
  return <CatalogSetupView model={model} />
}
