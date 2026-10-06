import {
  Badge,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ewatrade/ui"
import { CatalogIllustrationPreview } from "../catalog-illustration-preview"
import { CatalogPhotoPreview } from "../catalog-photo-preview"
import type { CatalogDetail } from "./display"
export function CatalogDetailHeader({
  detail,
  store,
}: { detail: CatalogDetail; store: { id: string; name: string } }) {
  const item = detail.item
  return (
    <DialogHeader className="shrink-0 flex-row items-center gap-4 p-6 pr-12">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden bg-muted">
        {item.photos[0] ? (
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
      <div className="grid min-w-0 gap-2">
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
    </DialogHeader>
  )
}
