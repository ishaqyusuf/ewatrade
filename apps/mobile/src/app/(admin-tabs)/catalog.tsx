import {
  useAdminDockScroll,
  useAdminTabs,
} from "@/components/mobile/admin-tabs"
import { CatalogItemsContent } from "@/components/mobile/catalog-items-sheet"
import { View } from "@/components/ui/view"
import { useLocalSearchParams, useRouter } from "expo-router"

export default function AdminCatalogRoute() {
  const router = useRouter()
  const { catalogItemId } = useLocalSearchParams<{ catalogItemId?: string }>()
  const { isDockHidden } = useAdminTabs()
  const handleDockScroll = useAdminDockScroll()

  return (
    <View className="flex-1 bg-background">
      <CatalogItemsContent
        dockHidden={isDockHidden}
        initialCatalogItemId={catalogItemId}
        onAddItem={() => router.push("/first-product-setup-modal")}
        onScroll={handleDockScroll}
        presentation="tab"
      />
    </View>
  )
}
