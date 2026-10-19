import { useCatalogDetailParams } from "@/hooks/use-catalog-detail-params"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import {
  Badge,
  Button,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ewatrade/ui"
import { PencilEdit02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { CatalogIllustrationPreview } from "../catalog-illustration-preview"
import { CatalogPhotoPreview } from "../catalog-photo-preview"
import type { CatalogDetail } from "./display"
import { catalogDetailAffordances } from "./read-access"
export function CatalogDetailHeader({
  detail,
  store,
  readOnly,
}: {
  detail: CatalogDetail
  store: { id: string; name: string }
  readOnly: boolean
}) {
  const item = detail.item
  const { close } = useCatalogDetailParams()
  const { editCatalogItem } = useCatalogItemParams()
  const affordances = catalogDetailAffordances({
    readOnly,
    inventoryAllowed: detail.inventoryAllowed,
    canManageUsage: detail.canManageUsage,
  })
  return (
    <DialogHeader className="shrink-0 flex-row items-center gap-4 p-6 pr-12">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden bg-muted">
        {item.photos[0] && affordances.privatePhotos ? (
          <CatalogPhotoPreview
            assetId={item.photos[0].assetId}
            storeId={store.id}
            label={item.name}
          />
        ) : item.illustrations[0] ? (
          <CatalogIllustrationPreview
            illustrationId={item.illustrations[0].illustrationId}
          />
        ) : (
          <span className="text-sm text-muted-foreground">
            {item.kind === "service" ? "Service" : "Item"}
          </span>
        )}
      </div>
      <div className="grid min-w-0 flex-1 gap-2">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="capitalize">
            {item.kind}
          </Badge>
          <Badge variant="outline" className="capitalize">
            {item.status}
          </Badge>
        </div>
        <DialogTitle className="text-xl font-semibold break-words">
          {item.name}
        </DialogTitle>
        <DialogDescription>
          {item.variants.length}{" "}
          {item.variants.length === 1 ? "variant" : "customer choices"} ·{" "}
          {store.name}
        </DialogDescription>
      </div>
      {readOnly || item.status === "archived" ? null : (
        <Button
          appearance="form"
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 self-start"
          onClick={async () => {
            await close()
            await editCatalogItem(item.id)
          }}
        >
          <HugeiconsIcon icon={PencilEdit02Icon} data-icon="inline-start" />
          Edit
        </Button>
      )}
    </DialogHeader>
  )
}
