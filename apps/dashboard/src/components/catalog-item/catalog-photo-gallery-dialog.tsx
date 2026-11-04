"use client"

import { INVALID_FILE, isCatalogPhotoFile } from "@/hooks/use-catalog-photo"
import { useMyImagesUpload } from "@/hooks/use-my-images-upload"
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
import { Search01Icon, Upload01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useId, useRef, useState } from "react"
import { useCatalogThemeClass } from "./catalog-appearance"
import { CatalogPhotoPreview } from "./catalog-photo-preview"

export type CatalogGalleryEntry =
  RouterOutputs["catalog"]["photos"]["gallery"]["entries"][number]

/** The image's own title, else the first Item showing it. */
export function catalogGalleryLabel(
  entry: CatalogGalleryEntry,
  fallback = "Untitled image",
) {
  return entry.title ?? entry.items[0]?.name ?? fallback
}

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
  return [entry.title ?? "", ...entry.items.map((item) => item.name)].some(
    (name) => [...nameWords(name)].some((word) => words.has(word)),
  )
}

const usedOn = (entry: CatalogGalleryEntry) =>
  entry.state === "PENDING_REVIEW"
    ? "Checking image"
    : entry.state === "REJECTED"
      ? "Didn’t pass the image check"
      : !entry.items.length
        ? "Not on an item yet"
        : entry.items.length === 1
          ? "On 1 item"
          : `On ${entry.items.length} items`

/**
 * My images (Workshop dashboard/web-app/catalog/my-images v2-01). With an
 * item it picks photos for that item; without one (from Catalog) it manages
 * the library. Either way the side panel edits the selected image's title and
 * category, and Upload adds an image straight to My images.
 */
export function CatalogPhotoGalleryDialog({
  open,
  onOpenChange,
  storeId,
  item,
  stores,
  available = 0,
  pickedAssetIds = [],
  onAdd,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  storeId: string
  /** The item photos are picked for; omit to manage My images. */
  item?: { id: string; name: string }
  stores: Array<{ id: string; name: string }>
  /** Photos this item can still take (eight in total). */
  available?: number
  /** Gallery images already picked in this editor and not saved yet. */
  pickedAssetIds?: string[]
  onAdd?(entries: CatalogGalleryEntry[]): void
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
              onAdd?.(entries)
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
  item?: { id: string; name: string }
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
  const [category, setCategory] = useState<string | null>(null)
  const [selected, setSelected] = useState<CatalogGalleryEntry[]>([])
  const [focused, setFocused] = useState<CatalogGalleryEntry | null>(null)
  const [draft, setDraft] = useState<{ file: File; preview: string } | null>(
    null,
  )
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])
  useEffect(
    () => () => {
      if (draft) URL.revokeObjectURL(draft.preview)
    },
    [draft],
  )
  const gallery = useInfiniteQuery(
    trpc.catalog.photos.gallery.infiniteQueryOptions(
      {
        storeId,
        catalogItemId: item?.id || undefined,
        scope,
        query: query || undefined,
        category: category ?? undefined,
      },
      {
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        placeholderData: keepPreviousData,
        retry: false,
      },
    ),
  )
  const storeName = (id: string) =>
    stores.find((store) => store.id === id)?.name ?? "Another Store"
  const currentStore = storeName(storeId)
  const entries = gallery.data?.pages.flatMap((page) => page.entries) ?? []
  // A search or category that hides the open image closes its details panel.
  const focusedShown =
    !focused || entries.some((entry) => entry.assetId === focused.assetId)
  const settled = gallery.isSuccess && !gallery.isPlaceholderData
  useEffect(() => {
    if (settled && !focusedShown) setFocused(null)
  }, [settled, focusedShown])
  const categories = gallery.data?.pages[0]?.categories ?? []
  const filtered = Boolean(query || category)
  const matches =
    item && !filtered
      ? entries.filter((entry) => catalogGalleryBestMatch(entry, item.name))
      : []
  const rest = entries.filter((entry) => !matches.includes(entry))
  const isSelected = (entry: CatalogGalleryEntry) =>
    selected.some((value) => value.assetId === entry.assetId)

  function choose(entry: CatalogGalleryEntry) {
    setDraft(null)
    setFocused(entry)
    if (!item || entry.state !== "APPROVED") return
    setSelected((current) =>
      current.some((value) => value.assetId === entry.assetId)
        ? current.filter((value) => value.assetId !== entry.assetId)
        : current.length < available
          ? [...current, entry]
          : current,
    )
  }

  function pickFile(file: File | undefined) {
    if (!file) return
    if (!isCatalogPhotoFile(file)) {
      setFileError(INVALID_FILE)
      return
    }
    setFileError(null)
    setFocused(null)
    setDraft({ file, preview: URL.createObjectURL(file) })
  }

  function tile(entry: CatalogGalleryEntry) {
    const on = isSelected(entry)
    const unavailable = !item
      ? null
      : entry.onTargetItem
        ? "Already on this item"
        : pickedAssetIds.includes(entry.assetId)
          ? "Already added"
          : null
    const full = Boolean(item) && !on && selected.length >= available
    const name = catalogGalleryLabel(entry, item?.name)
    const pending = entry.state !== "APPROVED"
    const dim = Boolean(unavailable) || full || pending
    return (
      <li key={entry.assetId} className="min-w-0">
        <button
          type="button"
          aria-pressed={item ? on : undefined}
          aria-current={focused?.assetId === entry.assetId ? "true" : undefined}
          disabled={Boolean(unavailable)}
          onClick={() => choose(entry)}
          className="group grid w-full gap-1.5 rounded-md text-left disabled:cursor-not-allowed"
        >
          <span
            className={`relative block aspect-square overflow-hidden rounded-md border bg-muted ${
              on
                ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                : focused?.assetId === entry.assetId
                  ? "ring-2 ring-ring ring-offset-2 ring-offset-background"
                  : ""
            } ${dim ? "opacity-45" : ""}`}
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
            {entry.state === "PENDING_REVIEW" ? (
              <span className="absolute top-1.5 left-1.5 rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-medium">
                Checking
              </span>
            ) : null}
          </span>
          <span className="grid min-w-0 px-0.5">
            <span className="truncate text-xs font-medium">{name}</span>
            {entry.category ? (
              <span className="truncate text-xs font-medium text-primary">
                {entry.category}
              </span>
            ) : null}
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
  const count = selected.length

  return (
    <div className="flex max-h-[min(680px,calc(100svh-4rem))] flex-col max-md:h-dvh max-md:max-h-dvh">
      <div className="flex items-center gap-3 border-b px-5 py-4 pr-14">
        <div className="mr-auto grid">
          <DialogTitle className="text-base font-semibold">
            My images
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {item
              ? `Pick up to ${available} for ${item.name}.`
              : "Business photos, ready for any item."}
          </DialogDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInput.current?.click()}
        >
          <HugeiconsIcon icon={Upload01Icon} aria-hidden="true" />
          Upload
        </Button>
        <input
          ref={fileInput}
          type="file"
          hidden
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={(event) => {
            pickFile(event.currentTarget.files?.[0])
            event.currentTarget.value = ""
          }}
        />
      </div>
      <div className="grid min-h-0 flex-1 md:grid-cols-[1fr_260px]">
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
              placeholder="Search titles, categories, items"
              aria-label="Search My images"
              className="pl-9"
            />
          </div>
          {stores.length > 1 || categories.length ? (
            <div className="flex flex-wrap gap-2">
              {stores.length > 1 ? (
                // biome-ignore lint/a11y/useSemanticElements: a pressed-button filter group, not a form fieldset
                <div
                  role="group"
                  aria-label="Which Stores"
                  className="flex gap-2"
                >
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
              {categories.length || category ? (
                // biome-ignore lint/a11y/useSemanticElements: a pressed-button filter group, not a form fieldset
                <div
                  role="group"
                  aria-label="Category"
                  className="flex flex-wrap gap-2"
                >
                  {[
                    { name: null, label: "All" },
                    ...categories.map((value) => ({
                      name: value.name,
                      label: value.name,
                    })),
                    ...(category &&
                    !categories.some((value) => value.name === category)
                      ? [{ name: category, label: category }]
                      : []),
                  ].map((value) => (
                    <Button
                      key={value.name ?? "all"}
                      type="button"
                      size="sm"
                      variant={category === value.name ? "secondary" : "ghost"}
                      aria-pressed={category === value.name}
                      onClick={() => setCategory(value.name)}
                      className="rounded-full"
                    >
                      {value.label}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {fileError ? (
            <p role="alert" className="text-sm text-destructive">
              {fileError}
            </p>
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
              {filtered ? (
                <>
                  <p className="font-medium text-foreground">
                    {query
                      ? `No images match “${query}”`
                      : "No images in this category"}
                  </p>
                  <p>
                    Search titles, categories and item names
                    {scope === "store" && stores.length > 1
                      ? ", or try All stores"
                      : ""}
                    .
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearch("")
                      setCategory(null)
                    }}
                  >
                    Clear filters
                  </Button>
                </>
              ) : (
                <>
                  <p className="font-medium text-foreground">
                    No business images yet
                  </p>
                  <p>
                    Upload photos here, or add them to your items. They show up
                    for everyone once their image check passes.
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
              {gallery.hasNextPage ? (
                <Button
                  type="button"
                  variant="outline"
                  className="justify-self-center"
                  disabled={gallery.isFetchingNextPage}
                  onClick={() => void gallery.fetchNextPage()}
                >
                  {gallery.isFetchingNextPage ? "Loading…" : "Show more"}
                </Button>
              ) : null}
            </>
          )}
        </div>
        <aside
          aria-label="Image details"
          // Below md the panel stacks under the grid once there is something to show.
          className={`${draft || focused ? "flex" : "hidden"} min-h-0 flex-col gap-3 overflow-y-auto border-t p-4 text-sm max-md:max-h-[45svh] md:flex md:border-t-0 md:border-l`}
        >
          {draft ? (
            <NewImageForm
              key={draft.preview}
              storeId={storeId}
              draft={draft}
              categories={categories.map((value) => value.name)}
              onCancel={() => setDraft(null)}
              onDone={() => setDraft(null)}
            />
          ) : focused ? (
            <ImageDetails
              key={focused.assetId}
              entry={focused}
              fallbackName={item?.name}
              stores={stores}
              categories={categories.map((value) => value.name)}
              onChange={setFocused}
              onRemoved={() => {
                setSelected((current) =>
                  current.filter((value) => value.assetId !== focused.assetId),
                )
                setFocused(null)
              }}
            />
          ) : (
            <p className="m-auto text-center text-muted-foreground">
              Select an image to see and edit its title and category
            </p>
          )}
        </aside>
      </div>
      <div className="flex items-center gap-2 border-t px-5 py-3">
        {item ? (
          <>
            <output className="mr-auto text-sm text-muted-foreground">
              {count
                ? `${count} selected · up to ${available}`
                : "No images selected"}
            </output>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!count}
              onClick={() => onAdd(selected)}
            >
              {count
                ? `Add ${count} photo${count > 1 ? "s" : ""}`
                : "Add photos"}
            </Button>
          </>
        ) : (
          <Button type="button" className="ml-auto" onClick={close}>
            Done
          </Button>
        )}
      </div>
    </div>
  )
}

function CategorySuggestions({
  categories,
  value,
  onPick,
}: {
  categories: string[]
  value: string
  onPick(value: string): void
}) {
  if (!categories.length) return null
  return (
    // biome-ignore lint/a11y/useSemanticElements: a pressed-button suggestion group, not a form fieldset
    <div
      role="group"
      aria-label="Suggested categories"
      className="flex flex-wrap gap-1.5"
    >
      {categories.map((name) => {
        const on = value.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
        return (
          <Button
            key={name}
            type="button"
            size="sm"
            variant={on ? "secondary" : "outline"}
            aria-pressed={on}
            onClick={() => onPick(on ? "" : name)}
            className="h-7 rounded-full px-2.5 text-xs"
          >
            {name}
          </Button>
        )
      })}
    </div>
  )
}

function DetailsFields({
  title,
  category,
  titlePlaceholder,
  titleHint,
  categories,
  onTitle,
  onCategory,
}: {
  title: string
  category: string
  titlePlaceholder: string
  titleHint?: string
  categories: string[]
  onTitle(value: string): void
  onCategory(value: string): void
}) {
  const id = useId()
  return (
    <>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-title`} className="text-xs font-medium">
          Title
        </label>
        <Input
          id={`${id}-title`}
          value={title}
          maxLength={80}
          placeholder={titlePlaceholder}
          onChange={(event) => onTitle(event.currentTarget.value)}
        />
        {titleHint ? (
          <p className="text-xs text-muted-foreground">{titleHint}</p>
        ) : null}
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-category`} className="text-xs font-medium">
          Category
        </label>
        <Input
          id={`${id}-category`}
          value={category}
          maxLength={40}
          placeholder="e.g. Eggs"
          onChange={(event) => onCategory(event.currentTarget.value)}
        />
        <CategorySuggestions
          categories={categories}
          value={category}
          onPick={onCategory}
        />
      </div>
    </>
  )
}

function ImageDetails({
  entry,
  fallbackName,
  stores,
  categories,
  onChange,
  onRemoved,
}: {
  entry: CatalogGalleryEntry
  fallbackName?: string
  stores: Array<{ id: string; name: string }>
  categories: string[]
  onChange(entry: CatalogGalleryEntry): void
  onRemoved(): void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(entry.title ?? "")
  const [category, setCategory] = useState(entry.category ?? "")
  const [saved, setSaved] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.catalog.photos.gallery.pathKey(),
    })
  const update = useMutation(
    trpc.catalog.photos.updateGalleryDetails.mutationOptions({
      onSuccess: (details) => {
        setSaved(true)
        onChange({ ...entry, title: details.title, category: details.category })
        void refresh()
      },
    }),
  )
  const remove = useMutation(
    trpc.catalog.photos.remove.mutationOptions({
      onSuccess: () => {
        onRemoved()
        void refresh()
      },
    }),
  )
  const dirty =
    title.trim() !== (entry.title ?? "") ||
    category.trim() !== (entry.category ?? "")
  const storeName = (id: string) =>
    stores.find((store) => store.id === id)?.name ?? "Another Store"
  const name = catalogGalleryLabel(entry, fallbackName)
  return (
    <>
      <CatalogPhotoPreview
        assetId={entry.assetId}
        storeId={entry.storeId}
        label={name}
        className="aspect-square w-full rounded-md border bg-muted object-cover"
      />
      <h4 className="font-medium break-words">{name}</h4>
      {entry.state === "PENDING_REVIEW" ? (
        <p className="text-xs text-muted-foreground">
          Checking this image. Other managers see it once it passes.
        </p>
      ) : entry.state === "REJECTED" ? (
        <p className="text-xs text-destructive">
          This image didn’t pass the image check, so it can’t be used.
        </p>
      ) : null}
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          setSaved(false)
          update.mutate({
            storeId: entry.storeId,
            assetId: entry.assetId,
            title: title.trim(),
            category: category.trim(),
          })
        }}
      >
        <DetailsFields
          title={title}
          category={category}
          titlePlaceholder={entry.items[0]?.name ?? "e.g. Half crate, top view"}
          titleHint={
            !entry.title && entry.items[0]
              ? `Shows as “${entry.items[0].name}” until you add one`
              : undefined
          }
          categories={categories}
          onTitle={(value) => {
            setSaved(false)
            setTitle(value)
          }}
          onCategory={(value) => {
            setSaved(false)
            setCategory(value)
          }}
        />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={!dirty || update.isPending}>
            {update.isPending ? "Saving…" : "Save details"}
          </Button>
          <output className="text-xs text-primary">
            {saved && !dirty ? "Saved" : null}
          </output>
        </div>
        {update.error ? (
          <p role="alert" className="text-xs text-destructive">
            {update.error.message}
          </p>
        ) : null}
      </form>
      <dl className="grid gap-1">
        <dt className="text-xs text-muted-foreground">Used on</dt>
        <dd className="break-words">
          {entry.items.length
            ? entry.items.map((used) => (
                <span
                  key={`${used.catalogItemId}:${used.storeId}`}
                  className="block"
                >
                  {used.name}
                </span>
              ))
            : "Not on an item yet"}
        </dd>
        {stores.length > 1 ? (
          <>
            <dt className="mt-2 text-xs text-muted-foreground">Stores</dt>
            <dd>{entry.storeIds.map(storeName).join(", ")}</dd>
          </>
        ) : null}
      </dl>
      {entry.galleryAsset ? (
        <div className="grid justify-items-start gap-1.5">
          {confirmRemove ? (
            <>
              <p className="text-xs text-muted-foreground">
                {entry.items.length
                  ? "Items using this image keep their own copy."
                  : "It isn’t on any item."}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() => {
                    const target = entry.galleryAsset
                    if (target)
                      remove.mutate({
                        storeId: target.storeId,
                        assetId: target.assetId,
                      })
                  }}
                >
                  Remove
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmRemove(false)}
                >
                  Keep
                </Button>
              </div>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="px-0 text-destructive"
              onClick={() => setConfirmRemove(true)}
            >
              Remove from My images
            </Button>
          )}
          {remove.error ? (
            <p role="alert" className="text-xs text-destructive">
              {remove.error.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

function NewImageForm({
  storeId,
  draft,
  categories,
  onCancel,
  onDone,
}: {
  storeId: string
  draft: { file: File; preview: string }
  categories: string[]
  onCancel(): void
  onDone(): void
}) {
  const upload = useMyImagesUpload(storeId)
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        upload
          .upload({
            file: draft.file,
            title: title.trim(),
            category: category.trim(),
          })
          .then(onDone)
          .catch((cause: unknown) =>
            setError(
              cause instanceof Error
                ? cause.message
                : "Upload failed. Try again.",
            ),
          )
      }}
    >
      <img
        src={draft.preview}
        alt=""
        className="aspect-square w-full rounded-md border bg-muted object-cover"
      />
      <h4 className="font-medium">New image</h4>
      <p className="text-xs text-muted-foreground">
        Goes to My images, not to an item. Others see it once its image check
        passes.
      </p>
      <DetailsFields
        title={title}
        category={category}
        titlePlaceholder="e.g. Half crate, top view"
        categories={categories}
        onTitle={setTitle}
        onCategory={setCategory}
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={upload.uploading}>
          {upload.uploading ? "Uploading…" : "Add to My images"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={upload.uploading}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
