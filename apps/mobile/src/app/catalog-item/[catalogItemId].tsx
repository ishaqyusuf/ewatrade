import { CatalogItemScreen } from "@/components/mobile/catalog-item/catalog-item-screen"
import { useLocalSearchParams } from "expo-router"

export default function CatalogItemRoute() {
  const { catalogItemId } = useLocalSearchParams<{ catalogItemId: string }>()

  return <CatalogItemScreen catalogItemId={catalogItemId ?? ""} />
}
