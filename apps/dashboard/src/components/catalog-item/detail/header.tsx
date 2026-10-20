import { useCatalogDetailParams } from "@/hooks/use-catalog-detail-params"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SheetClose,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@ewatrade/ui"
import {
  Cancel01Icon,
  Image01Icon,
  MoreVerticalIcon,
  PencilEdit02Icon,
  RulerIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useCatalogThemeClass } from "../catalog-appearance"
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
  const { close, setView } = useCatalogDetailParams()
  const themeClass = useCatalogThemeClass()
  const { editCatalogItem } = useCatalogItemParams()
  const affordances = catalogDetailAffordances({
    readOnly,
    inventoryAllowed: detail.inventoryAllowed,
    canManageUsage: detail.canManageUsage,
  })
  return (
    <SheetHeader className="shrink-0 flex-row items-start gap-4 px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6">
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
        <SheetTitle className="text-xl font-semibold break-words">
          {item.name}
        </SheetTitle>
        <SheetDescription>
          {item.variants.length}{" "}
          {item.variants.length === 1 ? "variant" : "customer choices"} ·{" "}
          {store.name}
        </SheetDescription>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-start">
        {readOnly || item.status === "archived" ? null : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              await close()
              await editCatalogItem(item.id)
            }}
          >
            <HugeiconsIcon icon={PencilEdit02Icon} data-icon="inline-start" />
            Edit
          </Button>
        )}
        {affordances.privatePhotos ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={`More actions for ${item.name}`}
                />
              }
            >
              <HugeiconsIcon icon={MoreVerticalIcon} aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              appearance="dashboard"
              align="end"
              className={themeClass}
            >
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => void setView("images")}>
                  <HugeiconsIcon icon={Image01Icon} aria-hidden="true" />
                  Images
                </DropdownMenuItem>
                {item.product && affordances.configureUnits ? (
                  <DropdownMenuItem onClick={() => void setView("units")}>
                    <HugeiconsIcon icon={RulerIcon} aria-hidden="true" />
                    Units
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <CatalogDetailClose />
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
          className="m-0 size-auto shrink-0 rounded-none p-0 hover:bg-transparent"
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
