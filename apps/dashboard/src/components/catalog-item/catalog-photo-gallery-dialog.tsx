"use client"

import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Skeleton,
} from "@ewatrade/ui"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useCatalogThemeClass } from "./catalog-appearance"
import { CatalogPhotoPreview } from "./catalog-photo-preview"

export type CatalogGalleryEntry =
  RouterOutputs["catalog"]["photos"]["gallery"]["entries"][number]

/** Words of an Item name that can match another Item, e.g. "eggs" in "Eggs · half crate". */
function nameWords(name: string) {
  return new Set(
    name
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 3)
      // "eggs" and "egg" are the same item word.
      .map((word) =>
        word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word,
      ),
  )
}

export function catalogGalleryBestMatch(
  entry: CatalogGalleryEntry,
  itemName: string,
) {
  const words = nameWords(itemName)
  return entry.items.some((item) =>
    [...nameWords(item.name)].some((word) => words.has(word)),
  )
}

const usedOn = (entry: CatalogGalleryEntry) =>
  entry.items.length === 1 ? "On 1 item" : `On ${entry.items.length} items`

export function CatalogPhotoGalleryDialog({
  open,
  onOpenChange,
  storeId,
  item,
  stores,
  available,
  pickedAssetIds,
  onAdd,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  storeId: string
  item: { id: string; name: string }
  stores: Array<{ id: string; name: string }>
  /** Photos this item can still take (eight in total). */
  available: number
  /** Gallery images already picked in this editor and not saved yet. */
  pickedAssetIds: string[]
  onAdd(entries: CatalogGalleryEntry[]): void
}) {
  const themeClass = useCatalogThemeClass()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-w-4xl p-0 ${themeClass}`}
        // Portalled clicks still bubble through React to the sheet behind.
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {open ? (
          <GalleryPicker
            storeId={storeId}
            item={item}
            stores={stores}
            available={available}
            pickedAssetIds={pickedAssetIds}
            close={() => onOpenChange(false)}
            onAdd={(entries) => {
              onAdd(entries)
              onOpenChange(false)
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function GalleryPicker({
  storeId,
  item,
  stores,
  available,
  pickedAssetIds,
  close,
  onAdd,
}: {
  storeId: string
  item: { id: string; name: string }
  stores: Array<{ id: string; name: string }>
  available: number
  pickedAssetIds: string[]
  close(): void
  onAdd(entries: CatalogGalleryEntry[]): void
}) {
  const trpc = useTRPC()
  const [scope, setScope] = useState<"store" | "all">("store")
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<CatalogGalleryEntry[]>([])
  const [focused, setFocused] = useState<CatalogGalleryEntry | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])
  const gallery = useQuery(
    trpc.catalog.photos.gallery.queryOptions(
      {
        storeId,
        catalogItemId: item.id || undefined,
        scope,
        query: query || undefined,
      },
      { placeholderData: keepPreviousData, retry: false },
    ),
  )
  const storeName = (id: string) =>
    stores.find((store) => store.id === id)?.name ?? "Another Store"
  const currentStore = storeName(storeId)
  const entries = gallery.data?.entries ?? []
  const matches = query
    ? []
    : entries.filter((entry) => catalogGalleryBestMatch(entry, item.name))
  const rest = query ? entries : entries.filter((e) => !matches.includes(e))
  const isSelected = (entry: CatalogGalleryEntry) =>
    selected.some((value) => value.assetId === entry.assetId)

  function toggle(entry: CatalogGalleryEntry) {
    setFocused(entry)
    setSelected((current) =>
      current.some((value) => value.assetId === entry.assetId)
        ? current.filter((value) => value.assetId !== entry.assetId)
        : current.length < available
          ? [...current, entry]
          : current,
    )
  }

  function tile(entry: CatalogGalleryEntry) {
    const on = isSelected(entry)
    const unavailable = entry.onTargetItem
      ? "Already on this item"
      : pickedAssetIds.includes(entry.assetId)
        ? "Already added"
        : null
    const full = !on && selected.length >= available
    const name = entry.items[0]?.name ?? item.name
    return (
      <li key={entry.assetId} className="min-w-0">
        <button
          type="button"
          aria-pressed={on}
          disabled={Boolean(unavailable) || full}
          onClick={() => toggle(entry)}
          onFocus={() => setFocused(entry)}
          className="group grid w-full gap-1.5 rounded-md text-left disabled:cursor-not-allowed"
        >
          <span
            className={`relative block aspect-square overflow-hidden rounded-md border bg-muted ${
              on
                ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                : ""
            } ${unavailable || full ? "opacity-45" : ""}`}
          >
            <CatalogPhotoPreview
              compact
              assetId={entry.assetId}
              storeId={entry.storeId}
              label={name}
              className="size-full object-cover"
            />
            {on ? (
              <span className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {selected.findIndex(
                  (value) => value.assetId === entry.assetId,
                ) + 1}
              </span>
            ) : null}
          </span>
          <span className="grid min-w-0 px-0.5">
            <span className="truncate text-xs font-medium">{name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {unavailable ?? usedOn(entry)}
            </span>
          </span>
        </button>
      </li>
    )
  }

  const grid = (list: CatalogGalleryEntry[]) => (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">{list.map(tile)}</ul>
  )
  const preview = focused ?? selected.at(-1) ?? null
  const count = selected.length

  return (
    <div className="flex max-h-[min(640px,calc(100svh-4rem))] flex-col max-md:h-dvh max-md:max-h-dvh">
      <div className="border-b px-5 py-4 pr-14">
        <DialogTitle className="text-base font-semibold">My images</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          Photos already on your items. Pick up to {available} for {item.name}.
        </DialogDescription>
      </div>
      <div className="grid min-h-0 flex-1 md:grid-cols-[1fr_240px]">
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-5">
          <div className="relative">
            <HugeiconsIcon
              icon={Search01Icon}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Search item names"
              aria-label="Search My images"
              className="pl-9"
            />
          </div>
          {stores.length > 1 ? (
            // biome-ignore lint/a11y/useSemanticElements: a pressed-button filter group, not a form fieldset
            <div role="group" aria-label="Which Stores" className="flex gap-2">
              {(
                [
                  ["store", currentStore],
                  ["all", "All stores"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={scope === value ? "secondary" : "outline"}
                  aria-pressed={scope === value}
                  onClick={() => setScope(value)}
                  className="rounded-full"
                >
                  {label}
                </Button>
              ))}
            </div>
          ) : null}
          {gallery.isPending ? (
            <output
              aria-label="Loading My images"
              className="grid grid-cols-3 gap-3 sm:grid-cols-4"
            >
              {Array.from({ length: 8 }, (_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton tiles
                <Skeleton key={index} className="aspect-square w-full" />
              ))}
            </output>
          ) : gallery.isError ? (
            <div
              role="alert"
              className="grid justify-items-start gap-3 text-sm"
            >
              <p>{gallery.error.message}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void gallery.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : !entries.length ? (
            <div className="grid justify-items-center gap-2 px-4 py-12 text-center text-sm text-muted-foreground">
              {query ? (
                <>
                  <p className="font-medium text-foreground">
                    No images match “{query}”
                  </p>
                  <p>
                    Try another item name
                    {scope === "store" && stores.length > 1
                      ? " or All stores"
                      : ""}
                    .
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearch("")}
                  >
                    Clear search
                  </Button>
                </>
              ) : (
                <>
                  <p className="font-medium text-foreground">
                    No business images yet
                  </p>
                  <p>
                    Photos on your items show up here once their image check
                    passes, so you can use them again.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              {matches.length ? (
                <section aria-label="Best matches" className="grid gap-2">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Best matches
                  </h3>
                  {grid(matches)}
                </section>
              ) : null}
              {rest.length ? (
                <section
                  aria-label={matches.length ? "All images" : "Images"}
                  className="grid gap-2"
                >
                  {matches.length ? (
                    <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      All images
                    </h3>
                  ) : null}
                  {grid(rest)}
                </section>
              ) : null}
              {gallery.data?.truncated ? (
                <p className="text-xs text-muted-foreground">
                  Showing your most recent images. Search to find older ones.
                </p>
              ) : null}
            </>
          )}
        </div>
        <aside
          aria-label="Selected image"
          className="hidden flex-col gap-3 border-l p-4 text-sm md:flex"
        >
          {preview ? (
            <>
              <CatalogPhotoPreview
                assetId={preview.assetId}
                storeId={preview.storeId}
                label={preview.items[0]?.name ?? item.name}
                className="aspect-square w-full rounded-md border bg-muted object-cover"
              />
              <dl className="grid gap-1">
                <dt className="text-xs text-muted-foreground">Used on</dt>
                <dd className="break-words">
                  {preview.items.map((entry) => (
                    <span
                      key={`${entry.catalogItemId}:${entry.storeId}`}
                      className="block"
                    >
                      {entry.name}
                    </span>
                  ))}
                </dd>
                {stores.length > 1 ? (
                  <>
                    <dt className="mt-2 text-xs text-muted-foreground">
                      Stores
                    </dt>
                    <dd>{preview.storeIds.map(storeName).join(", ")}</dd>
                  </>
                ) : null}
              </dl>
            </>
          ) : (
            <p className="m-auto text-center text-muted-foreground">
              Select an image to see where it’s used
            </p>
          )}
        </aside>
      </div>
      <div className="flex items-center gap-2 border-t px-5 py-3">
        <output className="mr-auto text-sm text-muted-foreground">
          {count
            ? `${count} selected · up to ${available}`
            : "No images selected"}
        </output>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button type="button" disabled={!count} onClick={() => onAdd(selected)}>
          {count ? `Add ${count} photo${count > 1 ? "s" : ""}` : "Add photos"}
        </Button>
      </div>
    </div>
  )
}
