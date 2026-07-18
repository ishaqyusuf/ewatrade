import { CatalogItemsContent, WorkflowModalScreen } from "@/components/mobile"
import { useRouter } from "expo-router"

export default function CatalogItemsModalRoute() {
  const router = useRouter()

  return (
    <WorkflowModalScreen closeLabel="Close catalog" title="Catalog">
      <CatalogItemsContent
        onAddItem={() => router.push("/first-product-setup-modal")}
        onComplete={() => router.replace("/dashboard")}
      />
    </WorkflowModalScreen>
  )
}
