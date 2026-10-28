"use client"

import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useCatalogPhotoQueue } from "@/hooks/use-catalog-photo"
import { useTRPC } from "@/trpc/client"
import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Sheet,
} from "@ewatrade/ui"
import { findCatalogIllustration } from "@ewatrade/utils/catalog-illustrations"
import {
  Add01Icon,
  Album02Icon,
  Cancel01Icon,
  PaintBoardIcon,
  Upload01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react"
import { useCatalogThemeClass } from "./catalog-appearance"
import { CatalogIllustrationPicker } from "./catalog-illustration-picker"
import { CatalogIllustrationPreview } from "./catalog-illustration-preview"
import {
  type CatalogGalleryEntry,
  CatalogPhotoGalleryDialog,
} from "./catalog-photo-gallery-dialog"
import { CatalogPhotoPreview } from "./catalog-photo-preview"

// The details sheet passes its own read of the item, so only the fields the editor uses are required.
type Item = Pick<
  RouterOutputs["catalog"]["getItem"],
  "id" | "name" | "photos" | "illustrations" | "category" | "kind"
>

type PhotoTile = {
  key: string
  image: ReactNode
  note?: string
  pending: boolean
  remove(): void
}

/** Arranged tiles first, in the owner's order; newly added ones follow. */
function arrangePhotos<T extends { key: string }>(order: string[], tiles: T[]) {
  const rank = new Map(order.map((key, index) => [key, index]))
  return tiles
    .map((tile, index) => ({
      tile,
      rank: rank.get(tile.key) ?? order.length + index,
    }))
    .sort((left, right) => left.rank - right.rank)
    .map((entry) => entry.tile)
}

export function CatalogSavedPhotos({
  item,
  storeId,
  open,
  onOpenChange,
}: {
  item: Item
  storeId: string
  open: boolean
  onOpenChange(open: boolean): void
}) {
  const scope = `${item.id}:${storeId}`
  const [busyScope, setBusyScope] = useState<string | null>(null)
  const busy = busyScope === scope
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      {open ? (
        <SavedPhotoEditor
          key={scope}
          item={item}
          storeId={storeId}
          close={() => onOpenChange(false)}
          onBusy={(value) =>
            setBusyScope((current) =>
              value ? scope : current === scope ? null : current,
            )
          }
        />
      ) : null}
    </Sheet>
  )
}

/** Images as a view inside the item's details sheet: it saves, then returns to the item. */
export function CatalogSavedPhotosView({
  item,
  storeId,
  storeName,
  back,
  onBusy,
  finalFocus,
}: {
  item: Item
  storeId: string
  storeName: string
  back(): void
  onBusy(value: boolean): void
  finalFocus?: ComponentProps<typeof SheetFrame>["finalFocus"]
}) {
  return (
    <SavedPhotoEditor
      key={`${item.id}:${storeId}`}
      item={item}
      storeId={storeId}
      description={`${item.name} · ${storeName}`}
      back={{ label: `Back to ${item.name}`, onClick: back }}
      close={back}
      onBusy={onBusy}
      finalFocus={finalFocus}
    />
  )
}

function SavedPhotoEditor({
  item,
  storeId,
  description = item.name,
  back,
  close,
  onBusy,
  finalFocus,
}: {
  item: Item
  storeId: string
  description?: string
  back?: { label: string; onClick: () => void }
  close(): void
  onBusy(value: boolean): void
  finalFocus?: ComponentProps<typeof SheetFrame>["finalFocus"]
}) {
  const themeClass = useCatalogThemeClass()
  const trpc = useTRPC()
  const client = useQueryClient()
  const photos = useCatalogPhotoQueue(storeId)
  const stores = useQuery(trpc.tenant.stores.queryOptions())
  const businessProfileKey = stores.data?.find(
    (store) => store.id === storeId,
  )?.businessProfileKey
  const [illustrationId, setIllustrationId] = useState<string | null>(
    () =>
      item.illustrations.find((entry) => entry.storeId === storeId)
        ?.illustrationId ?? null,
  )
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [ids, setIds] = useState(() =>
    item.photos.filter((p) => p.storeId === storeId).map((p) => p.assetId),
  )
  const expected = useRef({
    expectedAssetIds: item.photos
      .filter((photo) => photo.storeId === storeId)
      .map((photo) => photo.assetId),
    expectedIllustrationId:
      item.illustrations.find((entry) => entry.storeId === storeId)
        ?.illustrationId ?? null,
  })
  // Picked from My images; each is copied onto this item when it saves.
  const [picked, setPicked] = useState<CatalogGalleryEntry[]>([])
  // Tile keys in the order the owner arranged them; the first is primary.
  const [order, setOrder] = useState<string[]>([])
  const [announcement, setAnnouncement] = useState("")
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [showIllustrations, setShowIllustrations] = useState(false)
  const [removedSaved, setRemovedSaved] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const attempt = useRef<Pick<
    RouterInputs["catalog"]["photos"]["replace"],
    "assetIds" | "clientOperationId" | "illustrationId"
  > | null>(null)
  const command = useRef(crypto.randomUUID())
  const replace = useMutation(trpc.catalog.photos.replace.mutationOptions())
  const reuse = useMutation(trpc.catalog.photos.reuse.mutationOptions())
  const busy = useRef(false)
  const locked = saving || Boolean(attempt.current)
  const total = ids.length + picked.length + photos.drafts.length
  const illustration = findCatalogIllustration(illustrationId)
  async function save() {
    if (busy.current) return
    busy.current = true
    onBusy(true)
    setSaving(true)
    setError(null)
    try {
      if (!attempt.current) {
        // Each tile resolves to its asset in this Store, then keeps its place.
        const assets = new Map(ids.map((id) => [id, id]))
        if (!illustrationId) {
          for (const [key, id] of await photos.upload(command.current))
            assets.set(`new:${key}`, id)
          for (const entry of picked) {
            if (!mounted.current) break
            const copy = await reuse.mutateAsync({
              storeId,
              sourceAssetId: entry.assetId,
              sourceStoreId: entry.storeId,
              clientOperationId: `${command.current}:reuse:${entry.assetId}`,
            })
            assets.set(`picked:${entry.assetId}`, copy.assetId)
          }
        }
        if (!mounted.current)
          throw new Error(
            "The active Store changed. Reopen this item before saving.",
          )
        const assetIds = (illustrationId ? [] : tiles).flatMap((tile) => {
          const id = assets.get(tile.key)
          return id ? [id] : []
        })
        if (assetIds.length !== (illustrationId ? 0 : tiles.length))
          throw new Error(
            "Images could not be saved. Retry the same selection.",
          )
        attempt.current = {
          // Primary first: the replace command keeps this order.
          assetIds: [...new Set(assetIds)],
          illustrationId,
          clientOperationId: command.current,
        }
      }
      if (!mounted.current)
        throw new Error(
          "The active Store changed. Reopen this item before saving.",
        )
      await replace.mutateAsync({
        ...attempt.current,
        ...expected.current,
        catalogItemId: item.id,
        storeId,
      })
      // A confirmed mutation must not look failed because a list read failed.
      void client
        .invalidateQueries({ queryKey: trpc.catalog.pathKey() })
        .catch(() => undefined)
      if (mounted.current) close()
    } catch (error) {
      if (mounted.current)
        setError(
          error instanceof Error
            ? error.message
            : "Images could not be saved. Retry the same selection.",
        )
    } finally {
      busy.current = false
      if (mounted.current) {
        onBusy(false)
        setSaving(false)
      }
    }
  }
  function chooseIllustration(id: string | null) {
    if (!photos.clear()) return
    setIllustrationId(id)
    if (id) {
      if (ids.length) setRemovedSaved(true)
      setIds([])
      setPicked([])
    }
  }
  function makePrimary(key: string, index: number) {
    setOrder([key, ...tiles.map((tile) => tile.key).filter((k) => k !== key)])
    setAnnouncement(`Photo ${index + 1} is now primary. Save to apply.`)
  }
  const tiles = arrangePhotos<PhotoTile>(order, [
    ...ids.map((id) => {
      const pending =
        item.photos.find((p) => p.assetId === id)?.state !== "APPROVED"
      return {
        key: id,
        pending,
        image: (
          <CatalogPhotoPreview
            compact
            assetId={id}
            storeId={storeId}
            label={item.name}
            className="size-full object-cover"
          />
        ),
        note: pending ? "Check pending" : undefined,
        remove: () => {
          setIds((current) => current.filter((value) => value !== id))
          setRemovedSaved(true)
        },
      }
    }),
    ...picked.map((entry) => ({
      key: `picked:${entry.assetId}`,
      pending: false,
      image: (
        <CatalogPhotoPreview
          compact
          assetId={entry.assetId}
          storeId={entry.storeId}
          label={entry.items[0]?.name ?? item.name}
          className="size-full object-cover"
        />
      ),
      note: "From My images",
      remove: () =>
        setPicked((current) =>
          current.filter((value) => value.assetId !== entry.assetId),
        ),
    })),
    ...photos.drafts.map((draft) => ({
      key: `new:${draft.key}`,
      // New photos stay private until their image check passes.
      pending: true,
      image: (
        <img
          src={draft.preview}
          alt={`New upload for ${item.name}`}
          className="size-full object-cover"
        />
      ),
      note: "New photo",
      remove: () => void photos.remove(draft.key),
    })),
  ])
  const primaryPending = !illustration && Boolean(tiles[0]?.pending)
  return (
    <SheetFrame
      title="Images"
      popupClassName={themeClass}
      description={description}
      back={
        back
          ? {
              label: back.label,
              onClick: () => {
                if (!busy.current) back.onClick()
              },
            }
          : undefined
      }
      closeDisabled={saving}
      finalFocus={finalFocus}
      footer={
        <Button disabled={saving} onClick={() => void save()}>
          {saving
            ? "Saving…"
            : attempt.current
              ? "Retry same images"
              : "Save images"}
        </Button>
      }
    >
      <div className="space-y-5">
        {illustration ? (
          <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
            <CatalogIllustrationPreview illustrationId={illustration.id} />
            <p className="text-sm font-medium">{illustration.label}</p>
            <Button
              type="button"
              variant="outline"
              disabled={locked}
              onClick={() => setIllustrationId(null)}
            >
              Remove illustration
            </Button>
          </div>
        ) : (
          <ul aria-label="Photos" className="grid grid-cols-3 gap-2">
            {tiles.map((tile, index) => (
              <li
                key={tile.key}
                className="relative aspect-square overflow-hidden rounded-md border bg-muted"
              >
                {tile.image}
                {index === 0 ? (
                  <span className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
                    Primary
                  </span>
                ) : null}
                {tile.note || index > 0 ? (
                  <div className="absolute inset-x-1.5 bottom-1.5 flex items-end gap-1">
                    {tile.note ? (
                      <span className="min-w-0 truncate rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-medium">
                        {tile.note}
                      </span>
                    ) : null}
                    {index > 0 ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="secondary"
                        disabled={locked || photos.uploading}
                        aria-label={`Make photo ${index + 1} of ${tiles.length} primary`}
                        onClick={() => makePrimary(tile.key, index)}
                        className="ml-auto shrink-0 bg-black/60 text-white hover:bg-black/75"
                      >
                        Make primary
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  disabled={locked || photos.uploading}
                  aria-label={`Remove photo ${index + 1} of ${tiles.length}`}
                  onClick={tile.remove}
                  className="absolute top-1.5 right-1.5 rounded-full bg-black/60 text-white hover:bg-black/75"
                >
                  <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
                </Button>
              </li>
            ))}
            {total < 8 ? (
              <li className="aspect-square">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    disabled={locked || photos.uploading}
                    render={
                      <button
                        type="button"
                        className="flex size-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-primary/60 bg-primary/5 text-sm font-medium text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    }
                  >
                    <HugeiconsIcon icon={Add01Icon} aria-hidden="true" />
                    Add photo
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    appearance="dashboard"
                    align="start"
                    className={themeClass}
                  >
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        onClick={() => fileInput.current?.click()}
                      >
                        <HugeiconsIcon icon={Upload01Icon} aria-hidden="true" />
                        Upload from computer
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setGalleryOpen(true)}>
                        <HugeiconsIcon icon={Album02Icon} aria-hidden="true" />
                        My images
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setShowIllustrations(true)}
                      >
                        <HugeiconsIcon
                          icon={PaintBoardIcon}
                          aria-hidden="true"
                        />
                        Illustration library
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ) : null}
          </ul>
        )}
        <input
          ref={fileInput}
          type="file"
          hidden
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={(event) => {
            const selected = Array.from(event.currentTarget.files ?? [])
            if (selected.length && photos.add(selected, 8 - total))
              setIllustrationId(null)
            event.currentTarget.value = ""
          }}
        />
        {total >= 8 && !illustration ? (
          <p className="text-sm text-muted-foreground">
            This item has eight photos. Remove one before adding another.
          </p>
        ) : null}
        {removedSaved ? (
          <output className="block text-sm text-muted-foreground">
            Removed photos leave this item when you save. Other items that use
            the same image keep it.
          </output>
        ) : null}
        {showIllustrations && !illustration ? (
          <div className="space-y-3">
            <CatalogIllustrationPicker
              businessProfileKey={businessProfileKey}
              category={item.category}
              kind={item.kind}
              selectedId={illustrationId}
              disabled={locked || photos.uploading}
              onSelect={chooseIllustration}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowIllustrations(false)}
            >
              Hide illustrations
            </Button>
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Changes take effect when you save. New photos stay private until their
          image check passes; an illustration replaces this Store’s photos.
        </p>
        {primaryPending ? (
          <p className="text-sm text-muted-foreground">
            Your primary photo is waiting for its image check. The storefront
            shows the next approved photo until then.
          </p>
        ) : null}
        <output
          aria-live="polite"
          className="block text-sm text-muted-foreground empty:hidden"
        >
          {announcement}
        </output>
        {photos.uploading ? (
          <output className="text-sm">
            {photos.drafts.length > 1
              ? "Uploading your photos…"
              : "Uploading your photo…"}
          </output>
        ) : reuse.isPending ? (
          <output className="text-sm">Adding photos from My images…</output>
        ) : null}
        {photos.error || error ? (
          <p role="alert" className="text-sm text-destructive">
            {error ?? photos.error}
          </p>
        ) : null}
      </div>
      <CatalogPhotoGalleryDialog
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        storeId={storeId}
        item={item}
        stores={stores.data ?? []}
        available={Math.max(0, 8 - total)}
        pickedAssetIds={picked.map((entry) => entry.assetId)}
        onAdd={(entries) => {
          setIllustrationId(null)
          setPicked((current) => [
            ...current,
            ...entries.filter(
              (entry) =>
                !current.some((value) => value.assetId === entry.assetId),
            ),
          ])
        }}
      />
    </SheetFrame>
  )
}
