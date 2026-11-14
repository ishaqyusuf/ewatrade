import { useCatalogDetailParams } from "@/hooks/use-catalog-detail-params"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SheetClose,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@ewatrade/ui"
import {
  Archive02Icon,
  Cancel01Icon,
  Image01Icon,
  MoreVerticalIcon,
  PencilEdit02Icon,
  RulerIcon,
  Share01Icon,
  Store01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"
import { useCatalogThemeClass } from "../catalog-appearance"
import { CatalogIllustrationPreview } from "../catalog-illustration-preview"
import { CatalogPhotoPreview } from "../catalog-photo-preview"
import { canShareCatalogProduct } from "../catalog-product-share"
import { CatalogProductShareDialog } from "../catalog-product-share-dialog"
import { ArchiveCatalogItemDialog } from "./archive-item-dialog"
import type { CatalogDetail } from "./display"
import { catalogDetailAffordances } from "./read-access"
export function CatalogDetailHeader({
  detail,
  store,
  readOnly,
  onStorefrontSettings,
}: {
  detail: CatalogDetail
  store: { id: string; name: string }
  readOnly: boolean
  /** Opens the item's Storefront settings view, when the sheet offers it. */
  onStorefrontSettings?: () => void
}) {
  const item = detail.item
  const photo = item.photos.find(
    (entry) => entry.storeId === store.id && entry.optionVariantId == null,
  )
  const { close, setView } = useCatalogDetailParams()
  const themeClass = useCatalogThemeClass()
  const { editCatalogItem } = useCatalogItemParams()
  const affordances = catalogDetailAffordances({
    readOnly,
    inventoryAllowed: detail.inventoryAllowed,
    canManageUsage: detail.canManageUsage,
  })
  const [sharing, setSharing] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const canArchive = !readOnly && item.status !== "archived"
  const kindLabel = item.kind === "service" ? "Service" : "Goods"
  const choiceCount = item.variants.filter(
    (variant) => variant.status !== "archived",
  ).length
  return (
    <SheetHeader className="shrink-0 gap-4 px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-5">
      <div className="flex items-start gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[var(--ui-radius-control)] bg-muted">
          {photo && affordances.privatePhotos ? (
            <CatalogPhotoPreview
              assetId={photo.assetId}
              storeId={store.id}
              label={item.name}
              className="size-full object-cover"
            />
          ) : item.illustrations[0] ? (
            <CatalogIllustrationPreview
              illustrationId={item.illustrations[0].illustrationId}
            />
          ) : (
            <span className="text-sm text-muted-foreground">{kindLabel}</span>
          )}
        </div>
        <div className="grid min-w-0 flex-1 gap-1 pt-1">
          <SheetTitle className="text-xl font-semibold break-words">
            {item.name}
          </SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {kindLabel}
              {choiceCount > 1 ? ` · ${choiceCount} choices` : ""}
            </span>
            {item.status === "active" ? null : (
              <Badge variant="outline" className="capitalize">
                {item.status}
              </Badge>
            )}
          </SheetDescription>
        </div>
        <CatalogDetailClose />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {readOnly || item.status === "archived" ? null : (
          <Button
            type="button"
            onClick={async () => {
              await close()
              await editCatalogItem(item.id)
            }}
          >
            <HugeiconsIcon icon={PencilEdit02Icon} data-icon="inline-start" />
            Edit
          </Button>
        )}
        {canShareCatalogProduct(item) ? (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSharing(true)}
            >
              <HugeiconsIcon icon={Share01Icon} data-icon="inline-start" />
              Share
            </Button>
            <CatalogProductShareDialog
              itemId={item.id}
              itemName={item.name}
              storeId={store.id}
              open={sharing}
              onOpenChange={setSharing}
            />
          </>
        ) : null}
        {affordances.privatePhotos || canArchive ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`More actions for ${item.name}`}
                />
              }
            >
              <HugeiconsIcon icon={MoreVerticalIcon} aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              appearance="dashboard"
              align="start"
              className={themeClass}
            >
              <DropdownMenuGroup>
                {affordances.privatePhotos ? (
                  <DropdownMenuItem onClick={() => void setView("images")}>
                    <HugeiconsIcon icon={Image01Icon} aria-hidden="true" />
                    Images
                  </DropdownMenuItem>
                ) : null}
                {onStorefrontSettings && affordances.privatePhotos ? (
                  <DropdownMenuItem onClick={onStorefrontSettings}>
                    <HugeiconsIcon icon={Store01Icon} aria-hidden="true" />
                    Storefront settings
                  </DropdownMenuItem>
                ) : null}
                {item.product && affordances.configureUnits ? (
                  <DropdownMenuItem onClick={() => void setView("units")}>
                    <HugeiconsIcon icon={RulerIcon} aria-hidden="true" />
                    Units
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>
              {canArchive ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setArchiving(true)}
                    >
                      <HugeiconsIcon icon={Archive02Icon} aria-hidden="true" />
                      Archive item
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {canArchive ? (
          <ArchiveCatalogItemDialog
            itemId={item.id}
            itemName={item.name}
            open={archiving}
            onOpenChange={setArchiving}
            className={themeClass}
          />
        ) : null}
      </div>
    </SheetHeader>
  )
}

export function CatalogDetailClose() {
  return (
    <SheetClose
      render={
        <Button
          aria-label="Close"
          className="-mt-1 -mr-2 shrink-0"
          size="icon"
          type="button"
          variant="ghost"
        />
      }
    >
      <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
    </SheetClose>
  )
}
