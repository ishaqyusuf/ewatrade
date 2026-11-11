"use client"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useTRPC } from "@/trpc/client"
import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
import { Button, Sheet } from "@ewatrade/ui"
import {
  type CatalogImageReplacement,
  catalogImageAssignments,
  catalogImageOptions,
  catalogImageUsage,
  catalogImageUsages,
} from "@ewatrade/utils/catalog-image-editor"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type ComponentProps, useEffect, useRef, useState } from "react"
import { useCatalogThemeClass } from "./catalog-appearance"
import { CatalogImagesEditor } from "./catalog-images-editor"

type Item = Pick<
  RouterOutputs["catalog"]["getItem"],
  | "id"
  | "name"
  | "description"
  | "photos"
  | "illustrations"
  | "category"
  | "kind"
  | "variants"
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
  const [saving, setSaving] = useState(false)
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next)
      }}
    >
      {open ? (
        <SavedPhotoEditor
          key={`${item.id}:${storeId}`}
          item={item}
          storeId={storeId}
          close={() => onOpenChange(false)}
          onBusy={setSaving}
        />
      ) : null}
    </Sheet>
  )
}
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
  back?: { label: string; onClick(): void }
  close(): void
  onBusy(value: boolean): void
  finalFocus?: ComponentProps<typeof SheetFrame>["finalFocus"]
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const theme = useCatalogThemeClass()
  const [initialPhotos] = useState(() =>
    item.photos.filter((photo) => photo.storeId === storeId),
  )
  const [ids, setIds] = useState(() =>
    initialPhotos.map((photo) => photo.assetId),
  )
  const [assignments, setAssignments] = useState(() =>
    catalogImageAssignments(ids, initialPhotos.map(catalogImageUsage)),
  )
  const [illustrationId, setIllustrationId] = useState(
    () =>
      item.illustrations.find((image) => image.storeId === storeId)
        ?.illustrationId ?? null,
  )
  const expected = useRef({
    assetIds: [...ids],
    illustrationId,
    photoUsages: catalogImageUsages(ids, assignments),
  })
  const [saving, setSaving] = useState(false)
  const [mediaBusy, setMediaBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const attempt = useRef<RouterInputs["catalog"]["photos"]["replace"] | null>(
    null,
  )
  const mounted = useRef(true)
  const running = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const replace = useMutation(trpc.catalog.photos.replace.mutationOptions())
  async function save() {
    if (running.current || mediaBusy) return
    running.current = true
    setSaving(true)
    onBusy(true)
    setError(null)
    attempt.current ??= {
      catalogItemId: item.id,
      storeId,
      clientOperationId: crypto.randomUUID(),
      assetIds: [...ids],
      photoUsages: catalogImageUsages(ids, assignments),
      illustrationId,
      expectedAssetIds: [...expected.current.assetIds],
      expectedPhotoUsages: expected.current.photoUsages,
      expectedIllustrationId: expected.current.illustrationId,
    }
    try {
      await replace.mutateAsync(attempt.current)
      await client.invalidateQueries({ queryKey: trpc.catalog.pathKey() })
      if (mounted.current) close()
    } catch (error) {
      if (mounted.current)
        setError(
          error instanceof Error
            ? error.message
            : "Images could not be saved. Retry the same selection.",
        )
    } finally {
      running.current = false
      if (mounted.current) {
        setSaving(false)
        onBusy(false)
      }
    }
  }
  return (
    <SheetFrame
      title="Images"
      popupClassName={theme}
      description={description}
      back={back}
      closeDisabled={saving}
      finalFocus={finalFocus}
      footer={
        <Button
          type="button"
          disabled={saving || mediaBusy}
          className="rounded-full"
          onClick={() => void save()}
        >
          {saving
            ? "Saving…"
            : attempt.current
              ? "Retry same images"
              : "Save changes"}
        </Button>
      }
    >
      <CatalogImagesEditor
        storeId={storeId}
        contextKey={item.id}
        catalogItemId={item.id}
        facts={{
          kind: item.kind === "service" ? "SERVICE" : "PRODUCT",
          name: item.name,
          description: item.description ?? "",
          category: item.category ?? "",
        }}
        assetIds={ids}
        onChange={(assetIds, replacements?: CatalogImageReplacement[]) => {
          setIds(assetIds)
          setAssignments((previous) =>
            catalogImageAssignments(
              assetIds,
              catalogImageUsages(assetIds, previous, replacements),
            ),
          )
        }}
        optionEditor={{
          options: catalogImageOptions(item.variants),
          assignments,
          onAssign: (assetId, usage) =>
            setAssignments((previous) => ({
              ...previous,
              [assetId]: usage,
            })),
        }}
        disabled={saving || !!attempt.current}
        onBusyChange={setMediaBusy}
        onPersisted={(assetIds, photoUsages) => {
          setIds(assetIds)
          setAssignments(catalogImageAssignments(assetIds, photoUsages))
          expected.current = {
            assetIds,
            photoUsages,
            illustrationId: null,
          }
        }}
        illustrationId={illustrationId}
        onIllustrationChange={setIllustrationId}
      />
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </SheetFrame>
  )
}
