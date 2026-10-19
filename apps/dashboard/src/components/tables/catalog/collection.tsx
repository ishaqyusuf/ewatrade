"use client"

import { CatalogIllustrationPreview } from "@/components/catalog-item/catalog-illustration-preview"
import { CatalogPhotoPreview } from "@/components/catalog-item/catalog-photo-preview"
import {
  type CollectionView,
  RowSelectCheckbox,
} from "@/components/tables/core"
import { Badge } from "@ewatrade/ui"
import { productUsageLabels } from "@ewatrade/utils/product-usage"
import { Package01Icon, ToolsIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { Row } from "@tanstack/react-table"
import {
  CatalogItemThumbnail,
  CatalogKindBadge,
  type CatalogRow,
  getCatalogPrice,
  getCatalogStock,
  itemDetail,
} from "./columns"
import { CatalogItemActions } from "./item-actions"

type CollectionProps = {
  rows: Row<CatalogRow>[]
  storeId: string
  openUnits: (productId: string) => void
  openDetail: (itemId: string) => void
}

// Readable sizes from the Catalog page workshop (01 Labeled view dropdown).
const BADGE_CLASS = "px-2.5 text-[12.5px]"
const DESCRIPTION_CLASS = "truncate text-[13.5px] text-muted-foreground"

function itemDescription(item: CatalogRow) {
  return `${itemDetail(item)}${
    item.product
      ? ` · ${productUsageLabels[item.product.usage ?? "FOR_SALE"]}`
      : ""
  }`
}

function ItemBadges({ item }: { item: CatalogRow }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <CatalogKindBadge item={item} className={BADGE_CLASS} />
      <Badge variant="outline" className={`capitalize ${BADGE_CLASS}`}>
        {item.status}
      </Badge>
    </div>
  )
}

function ItemTitle({ item, onOpen }: { item: CatalogRow; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="min-w-0 truncate text-left text-[15px] font-semibold underline-offset-4 outline-none hover:underline focus-visible:underline"
      onClick={onOpen}
    >
      {item.name}
    </button>
  )
}

function storeImageKind(item: CatalogRow, storeId: string) {
  if (item.photos.some((entry) => entry.storeId === storeId)) return "photo"
  if (item.illustrations.some((entry) => entry.storeId === storeId))
    return "illustration"
  return "none"
}

// Illustrations fill with --muted, so their frame is lighter to keep the
// shape visible. Without an image a short band keeps the card's controls and
// avoids a large empty frame; the body below still lines up across the row.
const MEDIA_CLASS = {
  photo: "aspect-[4/3] bg-muted",
  illustration: "aspect-[4/3] bg-muted/40",
  none: "h-14 bg-muted",
} as const

/** The card image: the Store's photo, its illustration, or the kind icon. */
function CatalogItemMedia({
  item,
  storeId,
}: {
  item: CatalogRow
  storeId: string
}) {
  const photo = item.photos.find((entry) => entry.storeId === storeId)
  const illustration = item.illustrations.find(
    (entry) => entry.storeId === storeId,
  )
  if (photo)
    return (
      <CatalogPhotoPreview
        assetId={photo.assetId}
        storeId={storeId}
        label={item.name}
        className="size-full object-contain p-3"
      />
    )
  if (illustration)
    return (
      // Every drawing fills the same 80% of its canvas, so it takes the
      // frame's full height rather than a fraction of its width.
      <div className="aspect-square h-full py-5">
        <CatalogIllustrationPreview
          compact
          illustrationId={illustration.illustrationId}
        />
      </div>
    )
  return (
    <HugeiconsIcon
      icon={item.kind === "service" ? ToolsIcon : Package01Icon}
      className="size-5 text-muted-foreground"
      aria-hidden="true"
    />
  )
}

/** Grid columns are fixed by screen width: 1, then 2 at md, 3 at lg, 4 at xl. */
function CatalogGrid({
  rows,
  storeId,
  openUnits,
  openDetail,
}: CollectionProps) {
  return (
    <ul
      aria-label="Catalog item grid"
      className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {rows.map((row) => {
        const item = row.original
        const stock = getCatalogStock(item)
        const mediaClass = MEDIA_CLASS[storeImageKind(item, storeId)]
        return (
          <li key={row.id} className="min-w-0">
            <article
              data-state={row.getIsSelected() ? "selected" : undefined}
              className="flex h-full flex-col overflow-hidden rounded-xl border bg-card data-[state=selected]:border-transparent data-[state=selected]:ring-2 data-[state=selected]:ring-primary"
            >
              <div
                className={`relative grid place-items-center overflow-hidden ${mediaClass}`}
              >
                <CatalogItemMedia item={item} storeId={storeId} />
                <div className="absolute top-2.5 left-2.5 flex rounded-md bg-background p-1 ring-1 ring-border">
                  <RowSelectCheckbox row={row} label={`Select ${item.name}`} />
                </div>
                <div className="absolute top-2 right-2 rounded-md bg-background ring-1 ring-border">
                  <CatalogItemActions
                    item={item}
                    storeId={storeId}
                    openUnits={openUnits}
                  />
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1 px-3.5 pt-3 pb-3.5">
                <ItemTitle item={item} onOpen={() => openDetail(item.id)} />
                <p className={DESCRIPTION_CLASS}>{itemDescription(item)}</p>
                <div className="mt-1.5">
                  <ItemBadges item={item} />
                </div>
                <div className="mt-auto flex items-baseline justify-between gap-2 border-t pt-2.5 text-[13.5px] tabular-nums">
                  <span className="text-[15px] font-semibold">
                    {getCatalogPrice(item)}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {stock === "—" ? "No stock" : `Stock ${stock}`}
                  </span>
                </div>
              </div>
            </article>
          </li>
        )
      })}
    </ul>
  )
}

/** One bordered panel with a divided row per item; figures wrap under the name on phones. */
function CatalogList({
  rows,
  storeId,
  openUnits,
  openDetail,
}: CollectionProps) {
  return (
    <ul aria-label="Catalog item list" className="divide-y rounded-lg border">
      {rows.map((row) => {
        const item = row.original
        return (
          <li
            key={row.id}
            data-state={row.getIsSelected() ? "selected" : undefined}
            className="grid grid-cols-[1rem_2.5rem_minmax(0,1fr)_2rem] items-center gap-x-3.5 gap-y-1.5 px-3.5 py-2.5 data-[state=selected]:bg-muted md:grid-cols-[1rem_2.5rem_minmax(0,1fr)_auto_8rem_7rem_2rem]"
          >
            <RowSelectCheckbox row={row} label={`Select ${item.name}`} />
            <CatalogItemThumbnail
              item={item}
              storeId={storeId}
              className="size-10"
            />
            <div className="grid min-w-0 gap-0.5">
              <ItemTitle item={item} onOpen={() => openDetail(item.id)} />
              <p className={DESCRIPTION_CLASS}>{itemDescription(item)}</p>
            </div>
            <div className="max-md:col-start-3">
              <ItemBadges item={item} />
            </div>
            <ListFigure label="Price" value={getCatalogPrice(item)} />
            <ListFigure label="Stock" value={getCatalogStock(item)} />
            <div className="max-md:col-start-4 max-md:row-start-1">
              <CatalogItemActions
                item={item}
                storeId={storeId}
                openUnits={openUnits}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function ListFigure({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm tabular-nums max-md:col-start-3 max-md:flex max-md:gap-1.5">
      <span className="block text-[12.5px] text-muted-foreground max-md:inline max-md:text-sm">
        {label}
      </span>
      {value}
    </p>
  )
}

export function CatalogCollection({
  view,
  ...props
}: CollectionProps & { view: CollectionView }) {
  return view === "cards" ? (
    <CatalogGrid {...props} />
  ) : (
    <CatalogList {...props} />
  )
}
