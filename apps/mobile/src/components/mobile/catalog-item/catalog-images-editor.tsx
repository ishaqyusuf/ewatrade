import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { FullScreenForm } from "@/components/mobile/full-screen-form"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useCatalogAiImages } from "@/hooks/use-catalog-ai-images"
import { useColors } from "@/hooks/use-color"
import { uploadMobileCatalogPhoto } from "@/lib/catalog-photo-upload"
import { useTRPC } from "@/trpc/client"
import {
  type CatalogAiFacts,
  catalogAiAllowanceLabel,
} from "@ewatrade/utils/catalog-ai-images"
import { catalogRefinementDescendants } from "@ewatrade/utils/catalog-image-editor"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { Modal as RNModal, ScrollView, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { CatalogIllustrationBrowser } from "../catalog-setup/catalog-illustration-browser"
import { CatalogIllustrationPreview } from "../catalog-setup/catalog-illustration-library"
import { useCatalogImageDraft } from "../catalog-setup/use-catalog-image-draft"
import { DockedPhotoCamera } from "../docked-photo-camera"
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
  illustrationId = null,
  saveFeedback,
}: {
  storeId: string
  contextKey: string
  catalogItemId?: string
  facts: CatalogAiFacts
  assetIds: string[]
  onChange(ids: string[], illustrationId: string | null): void
  disabled?: boolean
  onBusyChange?(busy: boolean, writing: boolean): void
  onPersisted?(ids: string[]): void
  illustrationId?: string | null
  saveFeedback?: ReactNode
}) {
  const colors = useColors()
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
  const change = (ids: string[]) => {
    if (disabled) return
    onChange(ids, null)
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
      const next = [
        ...new Set(
          selected.current.map((id) =>
            result.removedAssetIds.includes(id) ? result.rootAssetId : id,
          ),
        ),
      ]
      if (result.assetIds && onPersisted) onPersisted(result.assetIds)
      else change(next)
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
  const status =
    ai.pending?.state === "UNCERTAIN"
      ? "Checking this request. Your generation stays reserved; no duplicate will be started."
      : ai.pending
        ? ai.pending.state === "PENDING_REVIEW"
          ? "Checking your new image…"
          : ai.pending.mode === "refine"
            ? "Refining your photo…"
            : "Creating your image…"
        : null
  const note = (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: noteOpen }}
        className="min-h-11 justify-center"
        onPress={() => setNoteOpen(!noteOpen)}
      >
        <Text className="text-xs text-muted-foreground underline">
          {noteOpen ? "Hide optional note" : "+ Add a note (optional)"}
        </Text>
      </Pressable>
      {noteOpen ? (
        <FormField
          label="Additional direction (optional)"
          value={ai.note}
          onChangeText={ai.setNote}
          multiline
          maxLength={500}
          placeholder="e.g. A warm, neutral background"
        />
      ) : null}
    </>
  )
  return (
    <View className="gap-4">
      {illustrationId ? (
        <View className="items-center gap-3 rounded-[20px] bg-card p-4">
          <CatalogIllustrationPreview id={illustrationId} size={160} />
          <ActionButton
            variant="outline"
            disabled={disabled || busy}
            onPress={() => onChange([], null)}
          >
            Remove illustration
          </ActionButton>
        </View>
      ) : null}
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-extrabold text-foreground">
          Your images
        </Text>
        <Text className="text-xs text-muted-foreground">
          {assetIds.length} / 8
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-3">
        {assetIds.map((id, index) => (
          <View
            key={id}
            style={{
              width: "48%",
              aspectRatio: 1,
              overflow: "hidden",
              borderRadius: 16,
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
            {index === 0 ? (
              <View className="absolute left-2 top-2 rounded-lg bg-card px-2 py-1">
                <Text className="text-[10px] font-extrabold text-foreground">
                  Primary
                </Text>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove image ${index + 1}`}
              disabled={disabled || busy}
              className="absolute right-1 top-1 size-11 items-center justify-center"
              onPress={() => change(assetIds.filter((entry) => entry !== id))}
            >
              <View className="size-7 items-center justify-center rounded-full bg-card">
                <Icon name="X" className="size-[14px] text-foreground" />
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Refine image ${index + 1} with AI`}
              disabled={!canRefine(id)}
              className="absolute bottom-1 right-1 min-h-11 items-center justify-center px-1"
              onPress={() => void ai.start(id)}
            >
              <View
                className="flex-row items-center gap-1 rounded-xl bg-card px-3 py-2"
                style={{ opacity: canRefine(id) ? 1 : 0.5 }}
              >
                <Icon name="Sparkles" className="size-[13px] text-foreground" />
                <Text className="text-xs font-extrabold text-foreground">
                  Refine
                </Text>
              </View>
            </Pressable>
            {index > 0 ? (
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
        ))}
      </View>
      <View className="flex-row gap-2">
        {[
          ["camera", "Take photo", "Camera"],
          ["photos", "Choose", "Image"],
          ["gallery", "My images", "LayoutGrid"],
        ].map(([source, label, icon]) => (
          <Pressable
            key={source}
            accessibilityRole="button"
            accessibilityLabel={label}
            disabled={disabled || busy || assetIds.length >= 8}
            onPress={() =>
              source === "gallery"
                ? setMyImages(true)
                : void device.select(source === "camera" ? "camera" : "photos")
            }
            style={{
              flex: 1,
              minHeight: 72,
              borderRadius: 16,
              backgroundColor: colors.card,
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              opacity: disabled || busy || assetIds.length >= 8 ? 0.5 : 1,
            }}
          >
            <Icon
              name={icon as IconKeys}
              className="size-[20px] text-primary"
            />
            <Text className="text-xs font-bold text-foreground">{label}</Text>
          </Pressable>
        ))}
      </View>
      <View className="gap-2 rounded-[20px] bg-card p-4">
        <View className="flex-row items-center gap-2">
          <Icon name="Sparkles" className="size-[16px] text-primary" />
          <Text className="text-sm font-extrabold text-foreground">
            Create a new image
          </Text>
        </View>
        <Text className="mb-2 text-xs text-muted-foreground">
          Uses your {facts.kind === "SERVICE" ? "service" : "product"} details.
        </Text>
        <ActionButton
          icon="Sparkles"
          className="rounded-2xl"
          disabled={
            disabled ||
            busy ||
            !ai.available ||
            assetIds.length >= 8 ||
            !facts.name.trim()
          }
          onPress={() => void ai.start()}
        >
          Generate with AI
        </ActionButton>
        {note}
      </View>
      {ai.query.data ? (
        <Text className="border-t border-border pt-3 text-[11px] text-muted-foreground">
          {catalogAiAllowanceLabel(
            ai.query.data.usage.remaining,
            ai.query.data.usage.period,
          )}
          {ai.query.data.usage.reserved
            ? ` · ${ai.query.data.usage.reserved} reserved`
            : ""}
        </Text>
      ) : null}
      {status ? (
        <StatusBanner
          tone="default"
          message={`${status} You can leave Images and return.`}
        />
      ) : null}
      {!ai.query.isPending && !ai.available && !ai.pending ? (
        <Text className="text-xs text-muted-foreground">
          {ai.query.data?.usage.remaining === 0
            ? "You have used your free generations."
            : "AI generation is currently unavailable."}{" "}
          Your images remain available.
        </Text>
      ) : null}
      {uploading ? (
        <StatusBanner tone="default" message="Adding photo…" />
      ) : null}
      {sources.data?.some((photo) => photo.state === "PENDING_REVIEW") ? (
        <Text className="text-xs text-muted-foreground">
          Your photo stays private while its image check runs. Refine becomes
          available after it passes.
        </Text>
      ) : null}
      {feedback ? <StatusBanner tone="warning" message={feedback} /> : null}
      {ai.retryRequest ? (
        <ActionButton
          variant="outline"
          disabled={ai.busy && !ai.pending}
          onPress={() => void ai.start()}
        >
          Retry same request
        </ActionButton>
      ) : null}
      <ActionButton
        variant="ghost"
        disabled={disabled || busy}
        onPress={() => setIllustrations(true)}
      >
        Illustration library
      </ActionButton>
      <DockedPhotoCamera {...device.camera} />
      <CatalogPhotoGalleryPicker
        open={myImages}
        onClose={() => setMyImages(false)}
        storeId={storeId}
        item={{ id: catalogItemId ?? "", name: facts.name || "this item" }}
        stores={stores.data ?? []}
        available={8 - assetIds.length}
        pickedAssetIds={assetIds}
        onAdd={(entries) => void addFromGallery(entries)}
      />
      {illustrations ? (
        <RNModal
          visible
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setIllustrations(false)}
        >
          <CatalogIllustrationBrowser
            onClose={() => setIllustrations(false)}
            kind={facts.kind === "SERVICE" ? "service" : "product"}
            itemName={facts.name}
            businessProfileKey={
              stores.data?.find((store) => store.id === storeId)
                ?.businessProfileKey
            }
            selectedId={illustrationId}
            onUse={(id) => {
              onChange([], id)
              setIllustrations(false)
            }}
          />
        </RNModal>
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
            {displayed === activeId ? " · Default" : ""}
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
                    Default
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
          {status ? <StatusBanner tone="default" message={status} /> : null}
          <Text className="text-xs text-muted-foreground">
            Check colour, shape and labels before using an AI edit.
          </Text>
          {note}
        </KeyboardAwareScrollView>
      </FullScreenForm>
    </View>
  )
}
