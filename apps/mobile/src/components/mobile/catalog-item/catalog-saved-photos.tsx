import { ActionButton } from "@/components/mobile/action-button"
import { FullScreenForm } from "@/components/mobile/full-screen-form"
import { StatusPill } from "@/components/mobile/green-till/kit"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { uploadMobileCatalogPhoto } from "@/lib/catalog-photo-upload"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { canEditMobileCatalog } from "@/lib/mobile-roles"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { Image } from "expo-image"
import { type ReactNode, useEffect, useRef, useState } from "react"
import {
  AccessibilityInfo,
  Text as NativeText,
  Modal as RNModal,
  View,
} from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  CatalogIllustrationLibrary,
  CatalogIllustrationPreview,
  catalogIllustrationCategoryKey,
} from "../catalog-setup/catalog-illustration-library"
import { useCatalogImageDraft } from "../catalog-setup/use-catalog-image-draft"
import { DockedPhotoCamera } from "../docked-photo-camera"
import { CatalogImagesEditor } from "./catalog-images-editor"
import type { CatalogItem } from "./catalog-item-presentation"
import {
  type CatalogGalleryEntry,
  CatalogPhotoGalleryPicker,
  catalogGalleryLabel,
} from "./catalog-photo-gallery-picker"
import { SavedPhotoPreview } from "./saved-photo-preview"

/**
 * Saved photos card and its editor. Pass `editing` and `onEditingChange` when
 * the screen opens the editor from elsewhere (a top-bar or quick action).
 */
export function CatalogSavedPhotos({
  item,
  editing: controlledEditing,
  onEditingChange,
}: {
  item: CatalogItem
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
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
  const photos = item.photos.filter((photo) => photo.storeId === storeId)
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

/** Square thumbnail: first saved photo, else illustration, else a kind icon. */
export function CatalogItemThumb({
  item,
  size = 62,
}: { item: CatalogItem; size?: number }) {
  const trpc = useTRPC()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const availability = useQuery(
    trpc.tenant.featureAvailability.queryOptions(undefined, {
      enabled: !offline,
      retry: false,
    }),
  )
  const { colorScheme } = useColorScheme()
  const colors = useColors()
  const palette = GREEN_TILL_THEME[colorScheme]
  const storeId = offline ? undefined : availability.data?.storeId
  const photo = storeId
    ? item.photos.find((entry) => entry.storeId === storeId)
    : undefined
  const illustration = storeId
    ? item.illustrations.find((entry) => entry.storeId === storeId)
    : undefined
  const service = item.kind === "service"
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: photo
          ? colors.muted
          : illustration || !service
            ? palette.amber
            : palette.lilac,
        borderRadius: Math.round(size * 0.29),
        height: size,
        justifyContent: "center",
        overflow: "hidden",
        width: size,
      }}
    >
      {photo && storeId ? (
        <SavedPhotoPreview
          assetId={photo.assetId}
          storeId={storeId}
          name={item.name}
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
}

function SavedPhotoEditor({
  item,
  storeId,
  close,
}: { item: CatalogItem; storeId: string; close(): void }) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const [ids, setIds] = useState(() =>
    item.photos
      .filter((photo) => photo.storeId === storeId)
      .map((photo) => photo.assetId),
  )
  const [illustrationId, setIllustrationId] = useState(
    () =>
      item.illustrations.find((image) => image.storeId === storeId)
        ?.illustrationId ?? null,
  )
  const expected = useRef({ assetIds: [...ids], illustrationId })
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
    setError(null)
    attempt.current ??= {
      catalogItemId: item.id,
      storeId,
      clientOperationId: Crypto.randomUUID(),
      assetIds: [...ids],
      illustrationId,
      expectedAssetIds: [...expected.current.assetIds],
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
      if (mounted.current) setSaving(false)
    }
  }
  return (
    <FullScreenForm
      visible
      title="Images"
      onClose={close}
      onBack={saving ? undefined : close}
      backLabel={`Back to ${item.name}`}
      closeDisabled={saving}
      footer={
        <ActionButton
          disabled={saving || mediaBusy}
          isLoading={saving}
          onPress={() => void save()}
        >
          {attempt.current ? "Retry same images" : "Save changes"}
        </ActionButton>
      }
    >
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-xs text-muted-foreground">{item.name}</Text>
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
          onChange={setIds}
          disabled={saving || !!attempt.current}
          onBusyChange={setMediaBusy}
          onPersisted={(assetIds) => {
            expected.current.assetIds = assetIds
          }}
          illustrationId={illustrationId}
          onIllustrationChange={setIllustrationId}
        />
        {error ? <StatusBanner tone="warning" message={error} /> : null}
      </KeyboardAwareScrollView>
    </FullScreenForm>
  )
}
