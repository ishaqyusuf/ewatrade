import { ActionButton } from "@/components/mobile/action-button"
import { FullScreenForm } from "@/components/mobile/full-screen-form"
import { StatusPill } from "@/components/mobile/green-till/kit"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { canEditMobileCatalog } from "@/lib/mobile-roles"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import {
  type CatalogImageReplacement,
  catalogImageAssignments,
  catalogImageOptions,
  catalogImageVariantIds,
  catalogImagesForOption,
} from "@ewatrade/utils/catalog-image-editor"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { TRPCClientError } from "@trpc/client"
import * as Crypto from "expo-crypto"
import { useCallback, useRef, useState } from "react"
import { Text as NativeText, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { CatalogIllustrationPreview } from "../catalog-setup/catalog-illustration-library"
import { CatalogImagesEditor } from "./catalog-images-editor"
import type { CatalogItem } from "./catalog-item-presentation"
import { SavedPhotoPreview } from "./saved-photo-preview"

/**
 * Saved photos card and its editor. Pass `editing` and `onEditingChange` when
 * the screen opens the editor from the avatar or a quick action.
 */
export function CatalogSavedPhotos({
  item,
  editing: controlledEditing,
  onEditingChange,
  optionVariantId,
}: {
  item: CatalogItem
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
  optionVariantId?: string
}) {
  const trpc = useTRPC()
  const { profile } = useAuthContext()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const canManage = canEditMobileCatalog(profile)
  const availability = useQuery(
    trpc.tenant.featureAvailability.queryOptions(undefined, {
      enabled: !offline,
      retry: false,
    }),
  )
  const storeId = availability.data?.storeId
  const [localEditing, setLocalEditing] = useState(false)
  const editing = controlledEditing ?? localEditing
  const setEditing = onEditingChange ?? setLocalEditing
  const { colorScheme } = useColorScheme()
  const colors = useColors()
  const palette = GREEN_TILL_THEME[colorScheme]
  if (!storeId || offline) return null
  const photos = catalogImagesForOption(
    item.photos.filter((photo) => photo.storeId === storeId),
    optionVariantId,
  )
  const illustration = item.illustrations.find(
    (entry) => entry.storeId === storeId,
  )
  if (editing)
    return (
      <SavedPhotoEditor
        key={`${profile?.id}:${profile?.businessId}:${item.id}:${storeId}`}
        item={item}
        storeId={storeId}
        close={() => setEditing(false)}
      />
    )
  const service = item.kind === "service"
  const pending = photos.some((photo) => photo.state !== "APPROVED")
  if (!photos.length && !illustration)
    return (
      <View
        style={{
          alignItems: "center",
          borderColor: colors.border,
          borderRadius: 22,
          borderStyle: "dashed",
          borderWidth: 1.5,
          gap: 8,
          height: 132,
          justifyContent: "center",
        }}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: service ? palette.lilac : palette.amber,
            borderRadius: 16,
            height: 52,
            justifyContent: "center",
            width: 52,
          }}
        >
          <Icon
            className="size-[24px]"
            color={service ? palette.lilacForeground : palette.amberForeground}
            name={service ? "Wrench" : "Package"}
          />
        </View>
        <View className="flex-row items-center">
          <Text className="text-xs text-muted-foreground">No image yet</Text>
          {canManage ? (
            <Pressable
              accessibilityLabel="Add an image"
              accessibilityRole="button"
              className="min-h-11 justify-center"
              hitSlop={8}
              onPress={() => setEditing(true)}
            >
              <Text className="text-xs font-bold text-primary">
                {" · Add an image"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    )
  const firstPhoto = photos[0]
  return (
    <View
      style={{
        backgroundColor: photos.length ? colors.muted : palette.amber,
        borderRadius: 22,
        height: 176,
        overflow: "hidden",
      }}
    >
      {firstPhoto ? (
        <SavedPhotoPreview
          assetId={firstPhoto.assetId}
          storeId={storeId}
          name={item.name}
        />
      ) : illustration ? (
        <View className="flex-1 items-center justify-center">
          <CatalogIllustrationPreview
            id={illustration.illustrationId}
            size={150}
          />
        </View>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          gap: 6,
          left: 12,
          position: "absolute",
          top: 12,
        }}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: service ? palette.lilac : palette.sky,
            borderRadius: 999,
            flexDirection: "row",
            gap: 4,
            height: 22,
            paddingHorizontal: 8,
          }}
        >
          <Icon
            className="size-[12px]"
            color={service ? palette.lilacForeground : palette.skyForeground}
            name={service ? "Wrench" : "Package"}
          />
          <NativeText
            style={{
              color: service ? palette.lilacForeground : palette.skyForeground,
              fontSize: 16,
              fontWeight: "700",
              includeFontPadding: false,
            }}
          >
            {service ? "Service" : "Goods"}
          </NativeText>
        </View>
        {pending ? (
          <StatusPill label="Image check pending" tone="warn" />
        ) : null}
      </View>
      {photos.length > 1 ? (
        <View
          style={{
            alignSelf: "center",
            bottom: 10,
            flexDirection: "row",
            gap: 5,
            position: "absolute",
          }}
        >
          {photos.map((photo, index) => (
            <View
              key={photo.assetId}
              style={{
                backgroundColor: palette.overlayForeground,
                opacity: index ? 0.55 : 1,
                borderRadius: 6,
                height: 6,
                width: index ? 6 : 16,
              }}
            />
          ))}
        </View>
      ) : null}
      {canManage ? (
        <Pressable
          accessibilityLabel="Edit images"
          accessibilityRole="button"
          onPress={() => setEditing(true)}
          style={{
            alignItems: "center",
            backgroundColor: palette.overlayChip,
            borderRadius: 12,
            bottom: 10,
            flexDirection: "row",
            gap: 6,
            height: 34,
            paddingHorizontal: 12,
            position: "absolute",
            right: 10,
          }}
        >
          <Icon
            className="size-[15px]"
            color={palette.overlayForeground}
            name="Camera"
          />
          <NativeText
            style={{
              color: palette.overlayForeground,
              fontSize: 16,
              fontWeight: "800",
            }}
          >
            Edit images
          </NativeText>
        </Pressable>
      ) : null}
    </View>
  )
}

/** The assigned image opens a read-only preview. The kind icon opens Images. */
export function CatalogItemThumb({
  item,
  storeId,
  size = 62,
  onOpenImages,
  optionVariantId,
}: {
  item: CatalogItem
  storeId?: string
  size?: number
  onOpenImages?: () => void
  optionVariantId?: string
}) {
  const [previewId, setPreviewId] = useState<string>()
  const { colorScheme } = useColorScheme()
  const colors = useColors()
  const palette = GREEN_TILL_THEME[colorScheme]
  const photo = storeId
    ? catalogImagesForOption(
        item.photos.filter((entry) => entry.storeId === storeId),
        optionVariantId,
      )[0]
    : undefined
  const illustration = storeId
    ? item.illustrations.find((entry) => entry.storeId === storeId)
    : undefined
  const service = item.kind === "service"
  const imageId = photo?.assetId ?? illustration?.illustrationId
  const onPress = imageId ? () => setPreviewId(imageId) : onOpenImages
  const closePreview = () => setPreviewId(undefined)
  const radius = Math.round(size * 0.29)
  const thumbnail = (
    <View
      style={{
        alignItems: "center",
        backgroundColor: photo
          ? colors.muted
          : illustration || !service
            ? palette.amber
            : palette.lilac,
        borderRadius: radius,
        height: size,
        justifyContent: "center",
        overflow: "hidden",
        width: size,
      }}
    >
      {photo && storeId ? (
        <SavedPhotoPreview
          key={photo.assetId}
          assetId={photo.assetId}
          storeId={storeId}
          name={item.name}
          variant="thumbnail"
        />
      ) : illustration ? (
        <CatalogIllustrationPreview
          id={illustration.illustrationId}
          size={size}
        />
      ) : (
        <Icon
          className="size-[26px]"
          color={service ? palette.lilacForeground : palette.amberForeground}
          name={service ? "Wrench" : "Package"}
        />
      )}
    </View>
  )
  if (!onPress) return thumbnail
  return (
    <>
      <Pressable
        accessibilityLabel={
          imageId ? `View image for ${item.name}` : "Add images"
        }
        accessibilityRole="button"
        haptic
        onPress={onPress}
        style={{ borderRadius: radius }}
      >
        {thumbnail}
      </Pressable>
      {previewId && previewId === imageId ? (
        <FullScreenForm
          visible
          title={item.name}
          onClose={closePreview}
          onBack={closePreview}
          backLabel="Back to item"
        >
          <View className="flex-1 items-center justify-center px-4 pb-4">
            {photo && storeId ? (
              <SavedPhotoPreview
                assetId={photo.assetId}
                storeId={storeId}
                name={item.name}
                contentFit="contain"
              />
            ) : illustration ? (
              <CatalogIllustrationPreview
                id={illustration.illustrationId}
                size={240}
              />
            ) : null}
          </View>
        </FullScreenForm>
      ) : null}
    </>
  )
}

function SavedPhotoEditor({
  item,
  storeId,
  close,
}: { item: CatalogItem; storeId: string; close(): void }) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const [selection, setSelection] = useState(() => {
    const photos = item.photos.filter((photo) => photo.storeId === storeId)
    return {
      assetIds: photos.map((photo) => photo.assetId),
      optionVariantIds: photos.map((photo) => photo.optionVariantId ?? null),
      illustrationId:
        item.illustrations.find((image) => image.storeId === storeId)
          ?.illustrationId ?? null,
    }
  })
  const saved = useRef(selection)
  const [saving, setSaving] = useState(false)
  const [writing, setWriting] = useState(false)
  const [error, setError] = useState<{
    message: string
    canRetry: boolean
  } | null>(null)
  const attempt = useRef<RouterInputs["catalog"]["photos"]["replace"] | null>(
    null,
  )
  const running = useRef(false)
  const onBusyChange = useCallback((_busy: boolean, writing: boolean) => {
    setWriting(writing)
  }, [])
  const replace = useMutation(trpc.catalog.photos.replace.mutationOptions())
  const refreshCatalog = () =>
    client.invalidateQueries({ queryKey: trpc.catalog.pathKey() })
  async function save(command: RouterInputs["catalog"]["photos"]["replace"]) {
    if (running.current) return
    running.current = true
    setSaving(true)
    setError(null)
    try {
      const result = await replace.mutateAsync(command)
      saved.current = {
        assetIds: result.assetIds,
        optionVariantIds:
          result.optionVariantIds ?? command.optionVariantIds ?? [],
        illustrationId: result.illustrationId ?? null,
      }
      attempt.current = null
    } catch (error) {
      setError({
        message:
          error instanceof Error
            ? error.message
            : "Images could not be saved. Try again.",
        canRetry:
          !(error instanceof TRPCClientError) ||
          error.data?.code !== "CONFLICT",
      })
    } finally {
      // Refetch mounted Catalog views and mark inactive search/list pages stale.
      // A lost response may also have committed, so refresh on failure.
      await refreshCatalog()
      running.current = false
      setSaving(false)
    }
  }
  function changeImages(
    assetIds: string[],
    illustrationId: string | null,
    replacements?: CatalogImageReplacement[],
    assignmentsToApply?: Array<{ assetId: string; variantId: string | null }>,
  ) {
    if (running.current || attempt.current) return
    const previous = saved.current
    const assignments = catalogImageAssignments(
      previous.assetIds,
      previous.optionVariantIds,
    )
    const optionVariantIds = catalogImageVariantIds(
      assetIds,
      assignmentsToApply?.length
        ? {
            ...assignments,
            ...Object.fromEntries(
              assignmentsToApply.map(({ assetId, variantId }) => [
                assetId,
                variantId,
              ]),
            ),
          }
        : assignments,
      replacements,
    )
    if (
      previous.illustrationId === illustrationId &&
      previous.assetIds.length === assetIds.length &&
      previous.assetIds.every(
        (id, index) =>
          id === assetIds[index] &&
          previous.optionVariantIds[index] === optionVariantIds[index],
      )
    )
      return
    const command = {
      catalogItemId: item.id,
      storeId,
      clientOperationId: Crypto.randomUUID(),
      assetIds,
      optionVariantIds,
      illustrationId,
      expectedAssetIds: previous.assetIds,
      expectedOptionVariantIds: previous.optionVariantIds,
      expectedIllustrationId: previous.illustrationId,
    }
    attempt.current = command
    setSelection({ assetIds, optionVariantIds, illustrationId })
    void save(command)
  }
  const goBack = () => {
    if (!running.current && !writing) close()
  }
  const saveFeedback = saving ? (
    <Text
      accessibilityLiveRegion="polite"
      className="text-xs text-muted-foreground"
    >
      Saving images…
    </Text>
  ) : error ? (
    <View className="gap-2">
      <StatusBanner tone="warning" message={error.message} />
      {error.canRetry ? (
        <ActionButton
          variant="outline"
          onPress={() => {
            if (attempt.current) void save(attempt.current)
          }}
        >
          Retry saving images
        </ActionButton>
      ) : null}
    </View>
  ) : null
  return (
    <FullScreenForm
      visible
      title="Images"
      onClose={goBack}
      onBack={goBack}
      backLabel={`Back to ${item.name}`}
      closeDisabled={saving || writing}
    >
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {saveFeedback}
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
          assetIds={selection.assetIds}
          generationChoices={catalogImageOptions(item.variants).filter(
            (option) => option.status === "active",
          )}
          onChange={changeImages}
          optionEditor={{
            options: catalogImageOptions(item.variants),
            assignments: catalogImageAssignments(
              selection.assetIds,
              selection.optionVariantIds,
            ),
            onAssign: (assetId, variantId) =>
              changeImages(
                selection.assetIds,
                selection.illustrationId,
                undefined,
                [{ assetId, variantId }],
              ),
          }}
          disabled={saving || !!attempt.current}
          onBusyChange={onBusyChange}
          saveFeedback={saveFeedback}
          onPersisted={(assetIds, optionVariantIds) => {
            const next = { assetIds, optionVariantIds, illustrationId: null }
            saved.current = next
            setSelection(next)
          }}
          illustrationId={selection.illustrationId}
        />
      </KeyboardAwareScrollView>
    </FullScreenForm>
  )
}
