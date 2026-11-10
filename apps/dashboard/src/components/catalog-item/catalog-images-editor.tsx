"use client"

import { useCatalogAiImages } from "@/hooks/use-catalog-ai-images"
import { uploadCatalogFile } from "@/hooks/use-catalog-photo"
import { useTRPC } from "@/trpc/client"
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Textarea,
} from "@ewatrade/ui"
import {
  type CatalogAiFacts,
  catalogAiAllowanceLabel,
} from "@ewatrade/utils/catalog-ai-images"
import { catalogRefinementDescendants } from "@ewatrade/utils/catalog-image-editor"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useId, useRef, useState } from "react"
import { CatalogIllustrationPicker } from "./catalog-illustration-picker"
import { CatalogIllustrationPreview } from "./catalog-illustration-preview"
import { CatalogPhotoGalleryDialog } from "./catalog-photo-gallery-dialog"
import { CatalogPhotoPreview } from "./catalog-photo-preview"

export function CatalogImagesEditor({
  storeId,
  contextKey,
  catalogItemId,
  facts,
  assetIds,
  onChange,
  disabled = false,
  onBusyChange,
  onPersisted,
  illustrationId = null,
  onIllustrationChange,
}: {
  storeId: string
  contextKey: string
  catalogItemId?: string
  facts: CatalogAiFacts
  assetIds: string[]
  onChange(ids: string[]): void
  disabled?: boolean
  onBusyChange?(busy: boolean): void
  onPersisted?(ids: string[]): void
  illustrationId?: string | null
  onIllustrationChange?(id: string | null): void
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const stores = useQuery(trpc.tenant.stores.queryOptions())
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [myImages, setMyImages] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [illustrations, setIllustrations] = useState(false)
  const [viewer, setViewer] = useState<number | null>(null)
  const [viewed, setViewed] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const noteId = useId()
  const input = useRef<HTMLInputElement>(null)
  const active = useRef({ mounted: true, storeId })
  const selected = useRef(assetIds)
  selected.current = assetIds
  active.current.storeId = storeId
  useEffect(() => {
    active.current.mounted = true
    return () => {
      active.current.mounted = false
    }
  }, [])
  const change = (ids: string[]) => {
    if (disabled) return
    onIllustrationChange?.(null)
    onChange(ids)
  }
  const ai = useCatalogAiImages({
    storeId,
    contextKey,
    catalogItemId,
    facts,
    assetIds,
    onChange: change,
    enabled: !disabled,
  })
  const createIntent = useMutation(
    trpc.catalog.photos.createIntent.mutationOptions(),
  )
  const reuse = useMutation(trpc.catalog.photos.reuse.mutationOptions())
  const removeVersion = useMutation(
    trpc.catalog.aiImages.deleteRefinement.mutationOptions(),
  )
  const busy = uploading || ai.busy || removeVersion.isPending
  useEffect(() => {
    onBusyChange?.(busy)
    return () => onBusyChange?.(false)
  }, [busy, onBusyChange])
  const sources = useQuery(
    trpc.catalog.aiImages.sources.queryOptions(
      { storeId, assetIds },
      {
        enabled: !!storeId && assetIds.length > 0,
        refetchInterval: (query) =>
          query.state.data?.some((photo) =>
            ["UPLOADING", "PENDING_REVIEW"].includes(photo.state),
          )
            ? 2000
            : false,
      },
    ),
  )
  const activeId = viewer !== null ? assetIds[viewer] : undefined
  const versions = useQuery(
    trpc.catalog.aiImages.versions.queryOptions(
      { storeId, assetId: activeId ?? "none" },
      { enabled: !!activeId },
    ),
  )
  useEffect(() => {
    setViewed(activeId ?? null)
    setConfirmDelete(false)
  }, [activeId])
  const version = versions.data?.versions.find(
    (entry) => entry.assetId === viewed,
  )
  const displayed = viewed ?? activeId
  const assertCurrent = () => {
    if (!active.current.mounted || active.current.storeId !== storeId)
      throw new Error("Store changed. Reopen Images before adding a photo.")
  }
  async function upload(files: File[]) {
    if (disabled || busy) return
    setUploading(true)
    setError(null)
    try {
      const next = [...selected.current]
      for (const file of files.slice(0, 8 - next.length)) {
        const id = await uploadCatalogFile({
          file,
          storeId,
          clientOperationId: `images:${crypto.randomUUID()}`,
          assertCurrent,
          createIntent: (request) => createIntent.mutateAsync(request),
        })
        assertCurrent()
        next.push(id)
        change([...next])
      }
    } catch (error) {
      if (active.current.mounted)
        setError(
          error instanceof Error ? error.message : "Photo could not be added.",
        )
    } finally {
      if (active.current.mounted) setUploading(false)
    }
  }
  async function addFromGallery(
    entries: Array<{ assetId: string; storeId: string }>,
  ) {
    setUploading(true)
    setError(null)
    try {
      const next = [...selected.current]
      for (const entry of entries.slice(0, 8 - next.length)) {
        const result = await reuse.mutateAsync({
          storeId,
          sourceStoreId: entry.storeId,
          sourceAssetId: entry.assetId,
          clientOperationId: `images-reuse:${crypto.randomUUID()}`,
        })
        assertCurrent()
        next.push(result.assetId)
        change([...next])
      }
    } catch (error) {
      if (active.current.mounted)
        setError(
          error instanceof Error ? error.message : "Image could not be copied.",
        )
    } finally {
      if (active.current.mounted) setUploading(false)
    }
  }
  async function deleteRefinement() {
    if (!displayed || !versions.data) return
    setError(null)
    try {
      const result = await removeVersion.mutateAsync({
        storeId,
        assetId: displayed,
        clientOperationId: crypto.randomUUID(),
        expectedVersionAssetIds: catalogRefinementDescendants(
          versions.data.versions,
          displayed,
        ),
      })
      assertCurrent()
      const next = [
        ...new Set(
          selected.current.map((id) =>
            result.removedAssetIds.includes(id) ? result.rootAssetId : id,
          ),
        ),
      ]
      if (result.assetIds) onPersisted?.(result.assetIds)
      change(next)
      setViewed(result.rootAssetId)
      setConfirmDelete(false)
      await client.invalidateQueries({ queryKey: trpc.catalog.pathKey() })
    } catch (error) {
      if (active.current.mounted)
        setError(
          error instanceof Error
            ? error.message
            : "The refinement could not be deleted.",
        )
    }
  }
  const feedback = error ?? ai.error ?? ai.query.error?.message
  const status =
    ai.pending?.state === "UNCERTAIN"
      ? "Checking this request. Your generation stays reserved; we will not start a duplicate."
      : ai.pending
        ? ai.pending.state === "PENDING_REVIEW"
          ? "Checking the new image…"
          : ai.pending.mode === "refine"
            ? "Refining your photo…"
            : "Creating your image…"
        : null
  const canRefine = (id: string) =>
    !disabled &&
    !busy &&
    ai.available &&
    (sources.data?.some(
      (photo) => photo.id === id && photo.state === "APPROVED",
    ) ||
      versions.data?.versions.some((version) => version.assetId === id))
  return (
    <div className="space-y-5">
      {illustrationId ? (
        <div className="space-y-3 rounded-2xl border bg-muted/30 p-4">
          <CatalogIllustrationPreview illustrationId={illustrationId} />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || busy}
            onClick={() => onIllustrationChange?.(null)}
          >
            Remove illustration
          </Button>
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Your images</h3>
        <span className="text-xs text-muted-foreground">
          {assetIds.length} / 8
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {assetIds.map((id, index) => (
          <div
            key={id}
            className="relative aspect-square overflow-hidden rounded-2xl bg-muted"
          >
            <button
              type="button"
              aria-label={`View image ${index + 1}`}
              className="block size-full"
              onClick={() => {
                setViewer(index)
                setViewed(id)
              }}
            >
              <CatalogPhotoPreview
                compact
                assetId={id}
                storeId={storeId}
                label={`Image ${index + 1} of ${facts.name}`}
                className="size-full object-cover"
              />
            </button>
            {index === 0 ? (
              <span className="absolute top-2 left-2 rounded-md bg-background/95 px-2 py-1 text-[10px] font-semibold">
                Primary
              </span>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              aria-label={`Refine image ${index + 1} with AI`}
              className="absolute right-2 bottom-2 h-8 rounded-xl px-2 text-xs"
              disabled={!canRefine(id)}
              onClick={() => void ai.start(id)}
            >
              ✧ Refine
            </Button>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              aria-label={`Remove image ${index + 1}`}
              className="absolute top-2 right-2 size-7 rounded-full"
              disabled={disabled || busy}
              onClick={() => change(assetIds.filter((entry) => entry !== id))}
            >
              ×
            </Button>
            {index > 0 ? (
              <button
                type="button"
                disabled={disabled || busy}
                className="absolute bottom-2 left-2 rounded-md bg-background/95 px-1.5 py-1 text-[10px]"
                onClick={() =>
                  change([id, ...assetIds.filter((entry) => entry !== id)])
                }
              >
                Make primary
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-20 flex-col gap-2 rounded-2xl"
          disabled={disabled || busy || assetIds.length >= 8}
          onClick={() => input.current?.click()}
        >
          <span aria-hidden>＋</span>Upload photo
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-20 flex-col gap-2 rounded-2xl"
          disabled={disabled || busy || assetIds.length >= 8}
          onClick={() => setMyImages(true)}
        >
          <span aria-hidden>▦</span>My images
        </Button>
      </div>
      <input
        ref={input}
        hidden
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ""
          void upload(files)
        }}
      />
      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold">✧ Create a new image</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Uses your {facts.kind === "SERVICE" ? "service" : "product"}{" "}
            details.
          </p>
        </div>
        <Button
          type="button"
          className="w-full rounded-xl"
          disabled={
            disabled ||
            busy ||
            !ai.available ||
            assetIds.length >= 8 ||
            !facts.name.trim()
          }
          onClick={() => void ai.start()}
        >
          ✧ Generate with AI
        </Button>
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-4"
          aria-expanded={noteOpen}
          onClick={() => setNoteOpen(!noteOpen)}
        >
          {noteOpen ? "Hide optional note" : "+ Add a note (optional)"}
        </button>
        {noteOpen ? (
          <label htmlFor={noteId} className="block text-xs">
            Additional direction
            <Textarea
              id={noteId}
              className="mt-2"
              maxLength={500}
              value={ai.note}
              onChange={(event) => ai.setNote(event.target.value)}
              placeholder="e.g. A warm, neutral background"
            />
          </label>
        ) : null}
      </section>
      {ai.query.data ? (
        <p className="border-t pt-3 text-xs text-muted-foreground">
          {catalogAiAllowanceLabel(
            ai.query.data.usage.remaining,
            ai.query.data.usage.period,
          )}
          {ai.query.data.usage.reserved
            ? ` · ${ai.query.data.usage.reserved} reserved`
            : ""}
        </p>
      ) : null}
      {status ? (
        <output className="text-sm text-muted-foreground">
          {status} You can leave Images and return.
        </output>
      ) : null}
      {!ai.query.isPending && !ai.available && !ai.pending ? (
        <p className="text-xs text-muted-foreground">
          {ai.query.data?.usage.remaining === 0
            ? "You have used your free generations."
            : "AI generation is currently unavailable."}{" "}
          Your images remain available.
        </p>
      ) : null}
      {uploading ? <output className="text-sm">Adding photo…</output> : null}
      {sources.data?.some((photo) => photo.state === "PENDING_REVIEW") ? (
        <p className="text-xs text-muted-foreground">
          Your new photo is private while its image check runs. Refine becomes
          available after it passes.
        </p>
      ) : null}
      {feedback ? (
        <p role="alert" className="text-sm text-destructive">
          {feedback}
        </p>
      ) : null}
      {ai.retryRequest ? (
        <Button
          type="button"
          variant="outline"
          disabled={mutationBusy(ai.busy, ai.pending?.state)}
          onClick={() => void ai.start()}
        >
          Retry same request
        </Button>
      ) : null}
      {onIllustrationChange ? (
        <>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled || busy}
            onClick={() => setIllustrations(!illustrations)}
          >
            {illustrations ? "Hide illustrations" : "Illustration library"}
          </Button>
          {illustrations ? (
            <CatalogIllustrationPicker
              businessProfileKey={
                stores.data?.find((store) => store.id === storeId)
                  ?.businessProfileKey
              }
              category={facts.category}
              kind={facts.kind === "SERVICE" ? "service" : "product"}
              selectedId={illustrationId}
              disabled={disabled || busy}
              onSelect={(id) => {
                onChange([])
                onIllustrationChange(id)
              }}
            />
          ) : null}
        </>
      ) : null}
      <CatalogPhotoGalleryDialog
        open={myImages}
        onOpenChange={setMyImages}
        storeId={storeId}
        item={{ id: catalogItemId ?? "", name: facts.name || "this item" }}
        stores={stores.data ?? []}
        available={8 - assetIds.length}
        pickedAssetIds={assetIds}
        onAdd={(entries) => void addFromGallery(entries)}
      />
      <Dialog
        open={viewer !== null && !!activeId}
        onOpenChange={(open) => {
          if (!open) setViewer(null)
        }}
      >
        <DialogContent
          className="inset-0 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-4 rounded-none border-0 bg-background p-5 sm:max-w-none"
          hideClose
        >
          <header className="flex shrink-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              aria-label="Back to images"
              onClick={() => setViewer(null)}
            >
              ‹
            </Button>
            <div className="flex-1">
              <DialogTitle>
                Image {(viewer ?? 0) + 1} of {assetIds.length}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                {version?.label ?? "Image"}
                {displayed === activeId ? " · Default" : ""}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              aria-label="Close image gallery"
              onClick={() => setViewer(null)}
            >
              ×
            </Button>
          </header>
          <div className="relative min-h-0 flex-1 rounded-2xl bg-muted">
            {displayed ? (
              <CatalogPhotoPreview
                key={displayed}
                assetId={displayed}
                storeId={storeId}
                label={`${facts.name} · ${version?.label ?? "Image"}`}
                className="size-full object-contain"
              />
            ) : null}
            {assetIds.length > 1 ? (
              <div className="pointer-events-none absolute inset-x-3 top-1/2 flex justify-between">
                <Button
                  className="pointer-events-auto rounded-full"
                  variant="secondary"
                  aria-label="Previous image"
                  onClick={() =>
                    setViewer(
                      ((viewer ?? 0) - 1 + assetIds.length) % assetIds.length,
                    )
                  }
                >
                  ‹
                </Button>
                <Button
                  className="pointer-events-auto rounded-full"
                  variant="secondary"
                  aria-label="Next image"
                  onClick={() =>
                    setViewer(((viewer ?? 0) + 1) % assetIds.length)
                  }
                >
                  ›
                </Button>
              </div>
            ) : null}
          </div>
          <nav
            aria-label="Image versions"
            className="flex shrink-0 gap-2 overflow-x-auto p-1"
          >
            {versions.data?.versions.map((entry) => (
              <Button
                key={entry.assetId}
                type="button"
                variant={displayed === entry.assetId ? "default" : "outline"}
                className="h-auto shrink-0 flex-col rounded-xl px-4 py-2 text-xs"
                onClick={() => {
                  setViewed(entry.assetId)
                  setConfirmDelete(false)
                }}
              >
                {entry.label}
                {entry.assetId === activeId ? <small>Default</small> : null}
              </Button>
            ))}
          </nav>
          <div className="flex shrink-0 items-center justify-between gap-3">
            {displayed !== activeId && displayed ? (
              <Button
                type="button"
                variant="outline"
                disabled={disabled || busy}
                onClick={() =>
                  change(
                    assetIds.map((id, index) =>
                      index === viewer ? displayed : id,
                    ),
                  )
                }
              >
                Use {version?.label.toLowerCase() ?? "this version"}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Shown in your image list
              </p>
            )}
            {version?.sourceAssetId ? (
              <Button
                type="button"
                variant="ghost"
                disabled={disabled || busy}
                onClick={() => setConfirmDelete(true)}
              >
                Delete refinement
              </Button>
            ) : null}
          </div>
          {confirmDelete ? (
            <div className="space-y-2 rounded-xl bg-muted p-3">
              <p className="text-sm">
                Delete this refinement and any refinements made from it? Your
                original stays.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDelete(false)}
              >
                Keep
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => void deleteRefinement()}
              >
                Delete refinement
              </Button>
            </div>
          ) : null}
          {versions.error ? (
            <p role="alert" className="text-sm text-destructive">
              {versions.error.message}
            </p>
          ) : null}
          {feedback ? (
            <p role="alert" className="text-sm text-destructive">
              {feedback}
            </p>
          ) : null}
          {status ? <output className="text-sm">{status}</output> : null}
          <p className="text-xs text-muted-foreground">
            Check colour, shape and labels before using an AI edit.
          </p>
          <Button
            type="button"
            className="shrink-0 rounded-full"
            disabled={!displayed || !canRefine(displayed)}
            onClick={() => displayed && void ai.start(displayed)}
          >
            ✧ {version?.sourceAssetId ? "Refine again" : "Refine with AI"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
function mutationBusy(busy: boolean, state: string | undefined) {
  return busy && !state
}
