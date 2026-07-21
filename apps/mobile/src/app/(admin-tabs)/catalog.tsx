import { CatalogItemsContent } from "@/components/mobile/catalog-items-sheet"
import {
  useAdminDockScroll,
  useAdminTabs,
} from "@/components/mobile/admin-tabs"
import { View } from "@/components/ui/view"

export default function AdminCatalogRoute() {
  const { openCreate } = useAdminTabs()
  const handleDockScroll = useAdminDockScroll()

  return (
    <View className="flex-1 bg-background">
      <CatalogItemsContent
        onAddItem={openCreate}
        onScroll={handleDockScroll}
        presentation="tab"
      />
    </View>
  )
}
