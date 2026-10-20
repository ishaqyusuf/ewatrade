"use client"

import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useCatalogPhoto } from "@/hooks/use-catalog-photo"
import { useTRPC } from "@/trpc/client"
import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
import { Button, Sheet } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type ComponentProps, useEffect, useRef, useState } from "react"
import { useCatalogThemeClass } from "./catalog-appearance"
import { CatalogImageEditor } from "./catalog-image-editor"
import { CatalogPhotoPreview } from "./catalog-photo-preview"

// The details sheet passes its own read of the item, so only the fields the editor uses are required.
type Item = Pick<
  RouterOutputs["catalog"]["getItem"],
  "id" | "name" | "photos" | "illustrations" | "category" | "kind"
>

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
  const photo = useCatalogPhoto(storeId)
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
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const attempt = useRef<Pick<
    RouterInputs["catalog"]["photos"]["replace"],
    "assetIds" | "clientOperationId" | "illustrationId"
  > | null>(null)
  const command = useRef(crypto.randomUUID())
  const replace = useMutation(trpc.catalog.photos.replace.mutationOptions())
  const busy = useRef(false)
  const locked = saving || Boolean(attempt.current)
  async function save() {
    if (busy.current) return
    busy.current = true
    onBusy(true)
    setSaving(true)
    setError(null)
    try {
      if (!attempt.current) {
        const added = await photo.upload(command.current)
        attempt.current = {
          assetIds: illustrationId ? [] : [...ids, ...added],
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
        {ids.map((id) => (
          <div className="space-y-2" key={id}>
            <CatalogPhotoPreview
              assetId={id}
              storeId={storeId}
              label={item.name}
            />
            <p className="text-sm text-muted-foreground">
              {item.photos.find((p) => p.assetId === id)?.state === "APPROVED"
                ? "Image check passed"
                : "Private · image check pending"}
            </p>
            <Button
              variant="outline"
              disabled={locked}
              onClick={() =>
                setIds((current) => current.filter((value) => value !== id))
              }
            >
              Remove this photo
            </Button>
          </div>
        ))}
        <CatalogImageEditor
          photo={photo}
          disabled={locked}
          illustrationId={illustrationId}
          onIllustrationChange={(id) => {
            setIllustrationId(id)
            if (id) setIds([])
          }}
          businessProfileKey={businessProfileKey}
          category={item.category}
          kind={item.kind}
          allowPhoto={ids.length < 8}
        />
        {ids.length >= 8 ? (
          <p>
            This item has eight photos. Remove one before adding another, or
            replace them with an illustration.
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Choose a photo or illustration for this Store. An illustration
          replaces this Store’s photos. Changes take effect when you save;
          images from other Stores are preserved.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </SheetFrame>
  )
}
