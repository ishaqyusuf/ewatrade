import { ActionButton } from "@/components/mobile/action-button"
import { StatusPill } from "@/components/mobile/green-till/kit"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { getBaseUrl } from "@/lib/base-url"
import { uploadMobileCatalogPhoto } from "@/lib/catalog-photo-upload"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { canEditMobileCatalog } from "@/lib/mobile-roles"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { Image } from "expo-image"
import { useEffect, useRef, useState } from "react"
import { Text as NativeText, View } from "react-native"
import {
  CatalogIllustrationLibrary,
  CatalogIllustrationPreview,
  catalogIllustrationCategoryKey,
} from "../catalog-setup/catalog-illustration-library"
import { useCatalogImageDraft } from "../catalog-setup/use-catalog-image-draft"
import type { CatalogItem } from "./catalog-item-presentation"

export function CatalogSavedPhotos({ item }: { item: CatalogItem }) {
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
  const [editing, setEditing] = useState(false)
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
      <View className="gap-4">
        <Text className="text-base font-extrabold text-foreground">Images</Text>
        <SavedPhotoEditor
          key={`${profile?.id}:${profile?.businessId}:${item.id}:${storeId}`}
          item={item}
          storeId={storeId}
          close={() => setEditing(false)}
        />
      </View>
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
          <Text className="text-[12.5px] text-muted-foreground">
            No image yet
          </Text>
          {canManage ? (
            <Pressable
              accessibilityLabel="Add an image"
              accessibilityRole="button"
              className="min-h-11 justify-center"
              hitSlop={8}
              onPress={() => setEditing(true)}
            >
              <Text className="text-[12.5px] font-bold text-primary">
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
              fontSize: 10.5,
              fontWeight: "700",
              includeFontPadding: false,
            }}
          >
            {service ? "Service" : "Product"}
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
              fontSize: 12,
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

function SavedPhotoPreview({
  assetId,
  storeId,
  name,
}: { assetId: string; storeId: string; name: string }) {
  const session = getSession()
  const [failed, setFailed] = useState(false)
  if (!session?.token || !session.profile.businessSlug) return null
  if (failed)
    return (
      <View className="flex-1 items-center justify-center gap-1.5">
        <Icon className="size-[22px] text-muted-foreground" name="Camera" />
        <Text className="text-xs text-muted-foreground">
          This image could not load. Refresh to try again.
        </Text>
      </View>
    )
  return (
    <Image
      source={{
        uri: `${getBaseUrl()}/api/catalog/photos/${encodeURIComponent(assetId)}/preview?storeId=${encodeURIComponent(storeId)}`,
        headers: {
          "x-app-authorization": `Bearer ${session.token}`,
          "x-tenant-slug": session.profile.businessSlug,
          "x-store-id": storeId,
        },
      }}
      style={{ height: "100%", width: "100%" }}
      contentFit="cover"
      cachePolicy="none"
      accessibilityLabel={name}
      onError={() => setFailed(true)}
    />
  )
}

function SavedPhotoEditor({
  item,
  storeId,
  close,
}: { item: CatalogItem; storeId: string; close(): void }) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const { profile } = useAuthContext()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const stores = useQuery(
    trpc.tenant.stores.queryOptions(undefined, {
      enabled: !offline && canEditMobileCatalog(profile),
      retry: false,
    }),
  )
  const businessProfileKey = stores.data?.find(
    (store) => store.id === storeId,
  )?.businessProfileKey
  const createIntent = useMutation(
    trpc.catalog.photos.createIntent.mutationOptions(),
  )
  const replace = useMutation(trpc.catalog.photos.replace.mutationOptions())
  const [ids, setIds] = useState(() =>
    item.photos.filter((p) => p.storeId === storeId).map((p) => p.assetId),
  )
  const [savedIllustrationId, setSavedIllustrationId] = useState(
    () =>
      item.illustrations.find((entry) => entry.storeId === storeId)
        ?.illustrationId ?? null,
  )
  const [showLibrary, setShowLibrary] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const command = useRef(Crypto.randomUUID())
  const attempt = useRef<{
    assetIds: string[]
    clientOperationId: string
    illustrationId: string | null
  } | null>(null)
  const busy = useRef(false)
  const mounted = useRef(true)
  const scope = `${profile?.id}:${profile?.businessId}:${storeId}`
  const canManage = canEditMobileCatalog(profile)
  const current = useRef({ scope, offline, canManage })
  current.current = { scope, offline, canManage }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const locked = saving || Boolean(attempt.current)
  const draft = useCatalogImageDraft({
    scopeKey: scope,
    canEdit: () =>
      !busy.current &&
      !attempt.current &&
      !current.current.offline &&
      current.current.canManage,
  })
  async function selectPhoto(source: "photos" | "camera") {
    await draft.select(source)
  }
  useEffect(() => {
    if (draft.image) setSavedIllustrationId(null)
  }, [draft.image])
  async function save() {
    if (busy.current || draft.selecting || offline || !canManage) return
    busy.current = true
    setSaving(true)
    setError(null)
    const assertCurrent = () => {
      if (
        !mounted.current ||
        current.current.scope !== scope ||
        current.current.offline ||
        !current.current.canManage
      )
        throw new Error(
          "Account, Store or connection changed. Reopen this item.",
        )
    }
    try {
      assertCurrent()
      if (!attempt.current) {
        const added = draft.image
          ? [
              await uploadMobileCatalogPhoto({
                image: draft.image,
                storeId,
                clientOperationId: `${command.current}:photo:${draft.image.id}`,
                assertCurrent,
                createIntent: (input) => createIntent.mutateAsync(input),
              }),
            ]
          : []
        assertCurrent()
        attempt.current = {
          assetIds: [...ids, ...added],
          clientOperationId: command.current,
          illustrationId: draft.image
            ? null
            : (draft.illustrationId ?? savedIllustrationId),
        }
      }
      await replace.mutateAsync({
        ...attempt.current,
        catalogItemId: item.id,
        storeId,
      })
      void client
        .invalidateQueries({ queryKey: trpc.catalog.pathKey() })
        .catch(() => undefined)
      assertCurrent()
      if (mounted.current) close()
    } catch (error) {
      if (mounted.current)
        setError(
          error instanceof Error
            ? error.message
            : "Photos could not be saved. Retry the same selection.",
        )
    } finally {
      busy.current = false
      if (mounted.current) setSaving(false)
    }
  }
  return (
    <View className="gap-4">
      {(draft.illustrationId ?? savedIllustrationId) ? (
        <View className="items-center gap-3">
          <CatalogIllustrationPreview
            id={draft.illustrationId ?? savedIllustrationId ?? ""}
            size={220}
          />
          <ActionButton
            variant="outline"
            disabled={locked || draft.selecting || offline || !canManage}
            onPress={() => {
              draft.remove()
              setSavedIllustrationId(null)
            }}
          >
            Remove illustration
          </ActionButton>
        </View>
      ) : null}
      {ids.map((id) => (
        <View key={id} className="gap-2">
          <View className="h-[176px] overflow-hidden rounded-[22px] bg-muted">
            <SavedPhotoPreview
              assetId={id}
              storeId={storeId}
              name={item.name}
            />
          </View>
          <ActionButton
            variant="outline"
            disabled={locked || draft.selecting || offline || !canManage}
            onPress={() =>
              setIds((current) => current.filter((value) => value !== id))
            }
          >
            Remove this photo
          </ActionButton>
        </View>
      ))}
      {draft.image ? (
        <>
          <Image
            source={{ uri: draft.image.uri }}
            style={{ width: "100%", height: 220 }}
            contentFit="contain"
            accessibilityLabel={`Selected ${item.name}`}
          />
          <ActionButton
            variant="outline"
            disabled={locked || draft.selecting || offline || !canManage}
            onPress={draft.remove}
          >
            Remove selected photo
          </ActionButton>
        </>
      ) : null}
      {ids.length < 8 ? (
        <>
          <ActionButton
            variant="outline"
            icon="Camera"
            disabled={locked || draft.selecting || offline || !canManage}
            onPress={() => void selectPhoto("photos")}
          >
            {draft.image ? "Replace selected photo" : "Choose a photo"}
          </ActionButton>
          <ActionButton
            variant="outline"
            icon="Camera"
            disabled={locked || draft.selecting || offline || !canManage}
            onPress={() => void selectPhoto("camera")}
          >
            Take a photo
          </ActionButton>
        </>
      ) : null}
      <ActionButton
        variant="outline"
        disabled={locked || draft.selecting || offline || !canManage}
        onPress={() => setShowLibrary((value) => !value)}
      >
        Illustration library
      </ActionButton>
      {showLibrary ? (
        <CatalogIllustrationLibrary
          kind={item.kind === "service" ? "service" : "product"}
          businessProfileKey={businessProfileKey}
          categoryKey={catalogIllustrationCategoryKey(item.category)}
          selectedId={draft.illustrationId ?? savedIllustrationId}
          disabled={locked || draft.selecting || offline || !canManage}
          onSelect={(id) => {
            if (locked || offline || !canManage || draft.selecting) return
            draft.chooseIllustration(id)
            setIds([])
            setSavedIllustrationId(null)
          }}
        />
      ) : null}
      <Text className="text-sm text-muted-foreground">
        Changes take effect when you save. New photos stay private until their
        image checks pass.
      </Text>
      {draft.error || error ? (
        <StatusBanner tone="warning" message={error ?? draft.error ?? ""} />
      ) : null}
      <ActionButton
        disabled={saving || draft.selecting || offline || !canManage}
        isLoading={saving}
        onPress={() => void save()}
      >
        {attempt.current ? "Retry same images" : "Save images"}
      </ActionButton>
      <ActionButton
        variant="outline"
        disabled={saving || draft.selecting}
        onPress={close}
      >
        Cancel
      </ActionButton>
    </View>
  )
}
