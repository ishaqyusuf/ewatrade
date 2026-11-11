import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { FullScreenForm } from "@/components/mobile/full-screen-form"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import {
  type GeneratedCatalogImageChoice,
  useCatalogAiImages,
} from "@/hooks/use-catalog-ai-images"
import { useColors } from "@/hooks/use-color"
import { uploadMobileCatalogPhoto } from "@/lib/catalog-photo-upload"
import { useTRPC } from "@/trpc/client"
import type {
  CatalogAiChoice,
  CatalogAiFacts,
} from "@ewatrade/utils/catalog-ai-images"
import {
  type CatalogImageOptionEditor,
  type CatalogImageReplacement,
  catalogRefinementDescendants,
} from "@ewatrade/utils/catalog-image-editor"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { ScrollView, View, useWindowDimensions } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { CatalogIllustrationPreview } from "../catalog-setup/catalog-illustration-library"
import { useCatalogImageDraft } from "../catalog-setup/use-catalog-image-draft"
import { DockedPhotoCamera } from "../docked-photo-camera"
import {
  CatalogImageAddTile,
  CatalogImageGenerateForm,
  CatalogImageProgressTile,
  catalogImageTile,
} from "./catalog-image-add-flow"
import {
  CatalogImageDeleteSheet,
  type CatalogImageRemoval,
} from "./catalog-image-delete-sheet"
import { CatalogPhotoGalleryPicker } from "./catalog-photo-gallery-picker"
import { SavedPhotoPreview } from "./saved-photo-preview"

/** Shared body for the new-item full-screen Images step and saved-item editor. */
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
  optionEditor,
  generationChoices,
  illustrationId = null,
  saveFeedback,
}: {
  storeId: string
  contextKey: string
  catalogItemId?: string
  facts: CatalogAiFacts
  assetIds: string[]
  onChange(
    ids: string[],
    illustrationId: string | null,
    replacements?: CatalogImageReplacement[],
    choices?: GeneratedCatalogImageChoice[],
  ): void
  disabled?: boolean
  onBusyChange?(busy: boolean, writing: boolean): void
  onPersisted?(ids: string[], variantIds: (string | null)[]): void
  optionEditor?: CatalogImageOptionEditor
  generationChoices?: CatalogAiChoice[]
  illustrationId?: string | null
  saveFeedback?: ReactNode
}) {
  const colors = useColors()
  const { width } = useWindowDimensions()
  const [gridWidth, setGridWidth] = useState(0)
  const tileSize = Math.floor(((gridWidth || width - 32) - 12) / 2)
  const trpc = useTRPC()
  const client = useQueryClient()
  const stores = useQuery(trpc.tenant.stores.queryOptions())
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [myImages, setMyImages] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [refinementNoteOpen, setRefinementNoteOpen] = useState(false)
  const [viewer, setViewer] = useState<number | null>(null)
  const [viewed, setViewed] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removal, setRemoval] = useState<CatalogImageRemoval | null>(null)
  const active = useRef({ mounted: true, storeId })
  const selected = useRef(assetIds)
  const uploadingId = useRef<string | null>(null)
  const touchX = useRef(0)
  selected.current = assetIds
  active.current.storeId = storeId
  useEffect(() => {
    active.current.mounted = true
    return () => {
      active.current.mounted = false
    }
  }, [])
  const change = (
    ids: string[],
    replacements?: CatalogImageReplacement[],
    choices?: GeneratedCatalogImageChoice[],
  ) => {
    if (disabled) return
    onChange(ids, null, replacements, choices)
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
  const device = useCatalogImageDraft({
    scopeKey: `${storeId}:${contextKey}`,
    canEdit: () => !disabled && !ai.busy,
  })
  const createIntent = useMutation(
    trpc.catalog.photos.createIntent.mutationOptions(),
  )
  const reuse = useMutation(trpc.catalog.photos.reuse.mutationOptions())
  const removeVersion = useMutation(
    trpc.catalog.aiImages.deleteRefinement.mutationOptions(),
  )
  const writing = uploading || removeVersion.isPending
  const busy = writing || ai.busy
  const availableChoices = generationChoices ?? optionEditor?.options ?? []
  const gallery = useQuery(
    trpc.catalog.photos.gallery.queryOptions(
      { storeId, scope: "all", limit: 1 },
      { enabled: !!storeId && !disabled, retry: false },
    ),
  )
  useEffect(() => {
    onBusyChange?.(busy, writing)
    return () => onBusyChange?.(false, false)
  }, [busy, onBusyChange, writing])
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
  const assignedVariantId = activeId
    ? (optionEditor?.assignments[activeId] ?? null)
    : null
  const optionMissing =
    assignedVariantId !== null &&
    !optionEditor?.options.some((option) => option.id === assignedVariantId)
  const showOptions =
    optionEditor && (optionEditor.options.length > 0 || optionMissing)
  const versions = useQuery(
    trpc.catalog.aiImages.versions.queryOptions(
      { storeId, assetId: activeId ?? "none" },
      { enabled: !!activeId },
    ),
  )
  useEffect(() => {
    setViewed(activeId ?? null)
    setConfirmDelete(false)
    setRefinementNoteOpen(false)
  }, [activeId])
  const version = versions.data?.versions.find(
    (entry) => entry.assetId === viewed,
  )
  const displayed = viewed ?? activeId
  const assertCurrent = () => {
    if (!active.current.mounted || active.current.storeId !== storeId)
      throw new Error("Store changed. Reopen Images before adding a photo.")
  }
  const uploadActions = useRef({
    storeId,
    assertCurrent,
    change,
    createIntent: createIntent.mutateAsync,
    remove: device.remove,
  })
  uploadActions.current = {
    storeId,
    assertCurrent,
    change,
    createIntent: createIntent.mutateAsync,
    remove: device.remove,
  }
  useEffect(() => {
    const image = device.image
    const actions = uploadActions.current
    if (!image || uploadingId.current === image.id) return
    uploadingId.current = image.id
    setUploading(true)
    setError(null)
    void uploadMobileCatalogPhoto({
      image,
      storeId: actions.storeId,
      clientOperationId: `images:${image.id}`,
      assertCurrent: actions.assertCurrent,
      createIntent: (request) => actions.createIntent(request),
    })
      .then((id) => {
        actions.assertCurrent()
        if (selected.current.length < 8)
          actions.change([...selected.current, id])
        actions.remove()
      })
      .catch((error) => {
        if (active.current.mounted)
          setError(
            error instanceof Error
              ? error.message
              : "The photo could not be added.",
          )
      })
      .finally(() => {
        if (active.current.mounted) setUploading(false)
      })
  }, [device.image])
  async function addFromGallery(
    entries: Array<{ assetId: string; storeId: string }>,
  ) {
    setUploading(true)
    setError(null)
    const next = [...selected.current]
    const previousCount = next.length
    try {
      for (const entry of entries.slice(0, 8 - next.length)) {
        const result = await reuse.mutateAsync({
          storeId,
          sourceStoreId: entry.storeId,
          sourceAssetId: entry.assetId,
          clientOperationId: `images-reuse:${Crypto.randomUUID()}`,
        })
        assertCurrent()
        next.push(result.assetId)
      }
    } catch (error) {
      if (active.current.mounted)
        setError(
          error instanceof Error ? error.message : "Image could not be copied.",
        )
    } finally {
      if (active.current.mounted && active.current.storeId === storeId) {
        if (next.length > previousCount) change(next)
        setUploading(false)
      }
    }
  }
  async function deleteRefinement() {
    if (!displayed || !versions.data) return
    setError(null)
    try {
      const result = await removeVersion.mutateAsync({
        storeId,
        assetId: displayed,
        clientOperationId: Crypto.randomUUID(),
        expectedVersionAssetIds: catalogRefinementDescendants(
          versions.data.versions,
          displayed,
        ),
      })
      assertCurrent()
      const replacements = selected.current
        .filter((id) => result.removedAssetIds.includes(id))
        .map((id) => ({ from: id, to: result.rootAssetId }))
      const next = [
        ...new Set(
          selected.current.map((id) =>
            result.removedAssetIds.includes(id) ? result.rootAssetId : id,
          ),
        ),
      ]
      if (result.assetIds && result.optionVariantIds)
        onPersisted?.(result.assetIds, result.optionVariantIds)
      else change(next, replacements)
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
  const canRefine = (id: string) =>
    !disabled &&
    !busy &&
    ai.available &&
    (sources.data?.some(
      (photo) => photo.id === id && photo.state === "APPROVED",
    ) ||
      versions.data?.versions.some((entry) => entry.assetId === id))
  const feedback = error ?? device.error ?? ai.error ?? ai.query.error?.message
  const jobs = ai.query.data?.jobs ?? []
  const latestRun = jobs[0]?.runId
  const generationFailed =
    !ai.busy &&
    jobs.some((job) => job.runId === latestRun && job.state === "FAILED")
  return (
    <View className="gap-4">
      {ai.progress.length ? (
        <View className="flex-row flex-wrap items-center justify-between gap-2 rounded-2xl bg-card px-3 py-2">
          <Text
            accessibilityLiveRegion="polite"
            className="text-sm font-bold text-foreground"
          >
            {ai.progress.length > 1
              ? `${ai.progress.length} images in progress`
              : "Image generation in progress"}
          </Text>
          <ActionButton
            variant="ghost"
            disabled={!ai.canCancel}
            onPress={() => void ai.cancel()}
          >
            {ai.cancelling ? "Stopping…" : "Cancel generation"}
          </ActionButton>
        </View>
      ) : null}
      <View
        onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}
      >
        <CatalogImageAddTile
          size={tileSize}
          disabled={disabled || busy || assetIds.length >= 8}
          hasGalleryImages={!!gallery.data?.entries.length}
          canGenerate={ai.available && !ai.retryRequest && !!facts.name.trim()}
          onChoose={(source) => {
            if (disabled || busy || assetIds.length >= 8) return
            if (source === "generate") setGenerating(true)
            else if (source === "my-images") setMyImages(true)
            else void device.select(source)
          }}
        />
        {ai.progress.map(({ id, choice, label }) => (
          <CatalogImageProgressTile
            key={id}
            size={tileSize}
            choice={choice}
            label={label}
          />
        ))}
        {illustrationId ? (
          <View
            style={{
              ...catalogImageTile,
              width: tileSize,
              height: tileSize,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.card,
            }}
          >
            <CatalogIllustrationPreview id={illustrationId} size={96} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove illustration"
              disabled={disabled || busy}
              className="absolute right-1 top-1 size-11 items-center justify-center"
              onPress={() =>
                setRemoval({ kind: "illustration", id: illustrationId })
              }
            >
              <View className="size-7 items-center justify-center rounded-full bg-card">
                <Icon name="X" className="size-[14px] text-foreground" />
              </View>
            </Pressable>
          </View>
        ) : null}
        {assetIds.map((id, index) => {
          const assignment = (assetId: string) =>
            optionEditor
              ? (optionEditor.assignments[assetId] ?? null)
              : (ai.query.data?.jobs.find(
                  (job) => job.outputAssetId === assetId,
                )?.choice?.id ?? null)
          const assigned = assignment(id)
          const isPrimary =
            assetIds.find((assetId) => assignment(assetId) === assigned) === id
          const optionName = assigned
            ? (availableChoices.find((option) => option.id === assigned)
                ?.name ?? "Removed option")
            : null
          return (
            <View
              key={id}
              style={{
                ...catalogImageTile,
                width: tileSize,
                height: tileSize,
                backgroundColor: colors.muted,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`View image ${index + 1}`}
                style={{ flex: 1 }}
                onPress={() => {
                  setViewer(index)
                  setViewed(id)
                }}
              >
                <SavedPhotoPreview
                  assetId={id}
                  storeId={storeId}
                  name={`Image ${index + 1} of ${facts.name}`}
                  variant="thumbnail"
                />
              </Pressable>
              {isPrimary || optionName ? (
                <View className="absolute left-2 top-2 rounded-lg bg-card px-2 py-1">
                  <Text className="text-[10px] font-extrabold text-foreground">
                    {optionName ?? "Primary"}
                  </Text>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove image ${index + 1}`}
                disabled={disabled || busy}
                className="absolute right-1 top-1 size-11 items-center justify-center"
                onPress={() => setRemoval({ kind: "photo", id })}
              >
                <View className="size-7 items-center justify-center rounded-full bg-card">
                  <Icon name="X" className="size-[14px] text-foreground" />
                </View>
              </Pressable>
              {!isPrimary ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Make image ${index + 1} primary`}
                  disabled={disabled || busy}
                  className="absolute bottom-1 left-1 min-h-11 justify-center px-1"
                  onPress={() =>
                    change([id, ...assetIds.filter((entry) => entry !== id)])
                  }
                >
                  <Text className="rounded-md bg-card px-1 py-1 text-[9px] font-bold text-foreground">
                    Make primary
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )
        })}
      </View>
      {uploading ? (
        <StatusBanner tone="default" message="Adding photo…" />
      ) : null}
      {sources.data?.some((photo) => photo.state === "PENDING_REVIEW") ? (
        <Text className="text-xs text-muted-foreground">
          Your photo stays private while its image check runs.
        </Text>
      ) : null}
      {feedback ? <StatusBanner tone="warning" message={feedback} /> : null}
      {!feedback && generationFailed ? (
        <StatusBanner
          tone="warning"
          message="An image could not be generated. Try again."
        />
      ) : null}
      {ai.retryRequest && !ai.busy ? (
        <ActionButton variant="outline" onPress={() => void ai.start()}>
          Retry same request
        </ActionButton>
      ) : null}
      <CatalogImageDeleteSheet
        target={removal}
        storeId={storeId}
        itemName={facts.name}
        disabled={disabled || busy}
        onClose={() => setRemoval(null)}
        onDelete={({ kind, id }) => {
          if (kind === "illustration") {
            if (illustrationId === id) onChange([], null)
          } else if (selected.current.includes(id)) {
            change(selected.current.filter((entry) => entry !== id))
          }
        }}
      />
      <DockedPhotoCamera {...device.camera} />
      <CatalogPhotoGalleryPicker
        open={myImages}
        onClose={() => setMyImages(false)}
        storeId={storeId}
        initialScope="all"
        item={{ id: catalogItemId ?? "", name: facts.name || "this item" }}
        stores={stores.data ?? []}
        available={8 - assetIds.length}
        pickedAssetIds={assetIds}
        onAdd={(entries) => void addFromGallery(entries)}
      />
      {generating ? (
        <CatalogImageGenerateForm
          note={ai.note}
          onChangeNote={ai.setNote}
          kind={facts.kind === "SERVICE" ? "service" : "product"}
          choices={availableChoices}
          capacity={8 - assetIds.length}
          usage={ai.query.data?.usage}
          onClose={() => setGenerating(false)}
          onGenerate={(choices) => {
            setGenerating(false)
            void ai.start(undefined, choices)
            ai.setNote("")
          }}
        />
      ) : null}
      <FullScreenForm
        visible={viewer !== null && !!activeId}
        title={`Image ${(viewer ?? 0) + 1} of ${assetIds.length}`}
        onClose={() => setViewer(null)}
        onBack={() => setViewer(null)}
        backLabel="Back to images"
        footer={
          <ActionButton
            icon="Sparkles"
            disabled={!displayed || !canRefine(displayed)}
            onPress={() => displayed && void ai.start(displayed)}
          >
            {version?.sourceAssetId ? "Refine again" : "Refine with AI"}
          </ActionButton>
        }
      >
        <KeyboardAwareScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-xs text-muted-foreground">
            {version?.label ?? "Image"}
            {displayed === activeId ? " · Current version" : ""}
          </Text>
          <View
            style={{
              height: 320,
              backgroundColor: colors.muted,
              borderRadius: 20,
              overflow: "hidden",
            }}
            onTouchStart={(event) => {
              touchX.current = event.nativeEvent.pageX
            }}
            onTouchEnd={(event) => {
              const distance = event.nativeEvent.pageX - touchX.current
              if (Math.abs(distance) > 60 && assetIds.length > 1)
                setViewer(
                  ((viewer ?? 0) + (distance < 0 ? 1 : -1) + assetIds.length) %
                    assetIds.length,
                )
            }}
          >
            {displayed ? (
              <SavedPhotoPreview
                key={displayed}
                assetId={displayed}
                storeId={storeId}
                name={`${facts.name} · ${version?.label ?? "Image"}`}
                contentFit="contain"
              />
            ) : null}
            {assetIds.length > 1 ? (
              <View className="absolute inset-x-3 top-1/2 flex-row justify-between">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous image"
                  className="size-11 items-center justify-center rounded-full bg-card"
                  onPress={() =>
                    setViewer(
                      ((viewer ?? 0) - 1 + assetIds.length) % assetIds.length,
                    )
                  }
                >
                  <Icon
                    name="ChevronLeft"
                    className="size-[20px] text-foreground"
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next image"
                  className="size-11 items-center justify-center rounded-full bg-card"
                  onPress={() =>
                    setViewer(((viewer ?? 0) + 1) % assetIds.length)
                  }
                >
                  <Icon
                    name="ChevronRight"
                    className="size-[20px] text-foreground"
                  />
                </Pressable>
              </View>
            ) : null}
          </View>
          {showOptions && activeId ? (
            <View className="gap-2">
              <Text className="text-sm font-bold text-foreground">
                Use image for
              </Text>
              {optionMissing ? (
                <Text className="text-xs text-muted-foreground">
                  Assigned to a removed option
                </Text>
              ) : null}
              <View className="flex-row flex-wrap gap-2">
                {[
                  { id: null, name: "General item image" },
                  ...optionEditor.options,
                ].map((option) => {
                  const selected = option.id === assignedVariantId
                  return (
                    <Pressable
                      key={option.id ?? "general"}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected,
                        disabled: disabled || busy,
                      }}
                      className={`min-h-11 justify-center rounded-xl border px-3 ${selected ? "border-primary" : "border-border"}`}
                      disabled={disabled || busy}
                      onPress={() => optionEditor.onAssign(activeId, option.id)}
                    >
                      <Text className="text-xs font-semibold text-foreground">
                        {option.name}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              {saveFeedback}
            </View>
          ) : null}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, padding: 2 }}
          >
            {versions.data?.versions.map((entry) => (
              <Pressable
                key={entry.assetId}
                accessibilityRole="button"
                accessibilityState={{ selected: entry.assetId === displayed }}
                onPress={() => {
                  setViewed(entry.assetId)
                  setConfirmDelete(false)
                }}
                style={{
                  minHeight: 52,
                  borderWidth: entry.assetId === displayed ? 2 : 1,
                  borderColor:
                    entry.assetId === displayed
                      ? colors.primary
                      : colors.border,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  justifyContent: "center",
                  backgroundColor: colors.card,
                }}
              >
                <Text className="text-xs font-bold text-foreground">
                  {entry.label}
                </Text>
                {entry.assetId === activeId ? (
                  <Text className="text-[10px] text-muted-foreground">
                    Current version
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
          <View className="flex-row items-center justify-between gap-2">
            {displayed && displayed !== activeId ? (
              <ActionButton
                variant="outline"
                disabled={disabled || busy}
                onPress={() =>
                  change(
                    assetIds.map((id, index) =>
                      index === viewer ? displayed : id,
                    ),
                    activeId ? [{ from: activeId, to: displayed }] : [],
                  )
                }
              >
                Use {version?.label.toLowerCase() ?? "this version"}
              </ActionButton>
            ) : (
              <Text className="text-xs text-muted-foreground">
                Shown in your image list
              </Text>
            )}
            {version?.sourceAssetId ? (
              <Pressable
                accessibilityRole="button"
                disabled={disabled || busy}
                className="min-h-11 justify-center"
                onPress={() => setConfirmDelete(true)}
              >
                <Text className="text-xs font-bold text-foreground">
                  Delete refinement
                </Text>
              </Pressable>
            ) : null}
          </View>
          {confirmDelete ? (
            <View className="gap-3 rounded-2xl bg-card p-4">
              <Text className="text-sm text-foreground">
                Delete this refinement and any refinements made from it? Your
                original stays.
              </Text>
              <ActionButton
                variant="outline"
                onPress={() => setConfirmDelete(false)}
              >
                Keep
              </ActionButton>
              <ActionButton
                disabled={disabled || busy}
                onPress={() => void deleteRefinement()}
              >
                Delete refinement
              </ActionButton>
            </View>
          ) : null}
          {versions.error ? (
            <StatusBanner tone="warning" message={versions.error.message} />
          ) : null}
          {saveFeedback}
          {feedback ? <StatusBanner tone="warning" message={feedback} /> : null}
          {ai.progress[0] ? (
            <StatusBanner tone="default" message={ai.progress[0].label} />
          ) : null}
          <Text className="text-xs text-muted-foreground">
            Check colour, shape and labels before using an AI edit.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: refinementNoteOpen }}
            className="min-h-11 justify-center"
            onPress={() => setRefinementNoteOpen(!refinementNoteOpen)}
          >
            <Text className="text-xs text-muted-foreground underline">
              {refinementNoteOpen
                ? "Hide optional note"
                : "Add a note (optional)"}
            </Text>
          </Pressable>
          {refinementNoteOpen ? (
            <FormField
              label="Add a note (optional)"
              value={ai.note}
              onChangeText={ai.setNote}
              multiline
              maxLength={500}
            />
          ) : null}
        </KeyboardAwareScrollView>
      </FullScreenForm>
    </View>
  )
}
