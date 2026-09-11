import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import type { WorkflowModalChromeProps } from "@/components/mobile/workflow-modal-screen"
import { useRouter } from "expo-router"
import { CatalogItemsContent } from "./catalog-screen"

export function CatalogModalChrome(props: WorkflowModalChromeProps) {
  return <MobileWorkflowChrome {...props} screen="catalog-picker" />
}

// This route browses Catalog; Offering selection belongs to Create Sale.
export function CatalogModalScreen() {
  const router = useRouter()
  return (
    <CatalogItemsContent
      designScreen="catalog-picker"
      presentation="modal"
      onAddItem={() => router.push("/first-product-setup-modal")}
      onAddProduct={() =>
        router.push("/first-product-setup-modal?kind=product")
      }
      onAddService={() =>
        router.push("/first-product-setup-modal?kind=service")
      }
      onComplete={() => router.replace("/dashboard")}
    />
  )
}
