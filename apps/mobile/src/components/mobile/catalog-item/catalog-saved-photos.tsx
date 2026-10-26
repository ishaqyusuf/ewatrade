import { ActionButton } from "@/components/mobile/action-button"
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { Image } from "expo-image"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { Text as NativeText, Modal as RNModal, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  CatalogIllustrationLibrary,
  CatalogIllustrationPreview,
  catalogIllustrationCategoryKey,
} from "../catalog-setup/catalog-illustration-library"
import { useCatalogImageDraft } from "../catalog-setup/use-catalog-image-draft"
import type { CatalogItem } from "./catalog-item-presentation"
import {
  type CatalogGalleryEntry,
  CatalogPhotoGalleryPicker,
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
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
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
  const reuse = useMutation(trpc.catalog.photos.reuse.mutationOptions())
  const [ids, setIds] = useState(() =>
    item.photos.filter((p) => p.storeId === storeId).map((p) => p.assetId),
  )
  // Picked from My images; each is copied onto this item when it saves.
  const [picked, setPicked] = useState<CatalogGalleryEntry[]>([])
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [removedSaved, setRemovedSaved] = useState(false)
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
  const disabled = locked || draft.selecting || offline || !canManage
  const total = ids.length + picked.length + (draft.image ? 1 : 0)
  const illustrationId = draft.illustrationId ?? savedIllustrationId
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
        const reused: string[] = []
        for (const entry of illustrationId && !draft.image ? [] : picked) {
          assertCurrent()
          const copy = await reuse.mutateAsync({
            storeId,
            sourceAssetId: entry.assetId,
            sourceStoreId: entry.storeId,
            clientOperationId: `${command.current}:reuse:${entry.assetId}`,
          })
          reused.push(copy.assetId)
        }
        assertCurrent()
        attempt.current = {
          assetIds: [...ids, ...reused, ...added],
          clientOperationId: command.current,
          illustrationId: draft.image || reused.length ? null : illustrationId,
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
  const tiles: Array<{
    key: string
    image: ReactNode
    note?: string
    remove(): void
  }> = [
    ...ids.map((id) => ({
      key: id,
      image: (
        <SavedPhotoPreview
          assetId={id}
          storeId={storeId}
          name={item.name}
          variant="thumbnail"
        />
      ),
      note:
        item.photos.find((p) => p.assetId === id)?.state === "APPROVED"
          ? undefined
          : "Check pending",
      remove: () => {
        setIds((value) => value.filter((entry) => entry !== id))
        setRemovedSaved(true)
      },
    })),
    ...picked.map((entry) => ({
      key: `picked:${entry.assetId}`,
      image: (
        <SavedPhotoPreview
          assetId={entry.assetId}
          storeId={entry.storeId}
          name={entry.items[0]?.name ?? item.name}
          variant="thumbnail"
        />
      ),
      note: "My images",
      remove: () =>
        setPicked((value) =>
          value.filter((other) => other.assetId !== entry.assetId),
        ),
    })),
    ...(draft.image
      ? [
          {
            key: `new:${draft.image.id}`,
            image: (
              <Image
                source={{ uri: draft.image.uri }}
                style={{ height: "100%", width: "100%" }}
                contentFit="cover"
                accessibilityLabel={`Selected for ${item.name}`}
              />
            ),
            note: "New photo",
            remove: draft.remove,
          },
        ]
      : []),
  ]
  return (
    <View className="gap-4">
      {illustrationId ? (
        <View className="items-center gap-3">
          <CatalogIllustrationPreview id={illustrationId} size={220} />
          <ActionButton
            variant="outline"
            disabled={disabled}
            onPress={() => {
              draft.remove()
              setSavedIllustrationId(null)
            }}
          >
            Remove illustration
          </ActionButton>
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {tiles.map((tile, index) => (
            <View
              key={tile.key}
              className="aspect-square w-[31%] overflow-hidden rounded-[14px] bg-muted"
            >
              {tile.image}
              {index === 0 ? (
                <View
                  style={{
                    backgroundColor: palette.overlayChip,
                    borderRadius: 6,
                    left: 6,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    position: "absolute",
                    top: 6,
                  }}
                >
                  <NativeText
                    style={{
                      color: palette.overlayForeground,
                      fontSize: 11,
                      fontWeight: "700",
                    }}
                  >
                    Cover
                  </NativeText>
                </View>
              ) : null}
              {tile.note ? (
                <View
                  style={{
                    backgroundColor: palette.overlayChip,
                    borderRadius: 6,
                    bottom: 6,
                    left: 6,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    position: "absolute",
                    right: 6,
                  }}
                >
                  <NativeText
                    numberOfLines={1}
                    style={{
                      color: palette.overlayForeground,
                      fontSize: 11,
                      fontWeight: "700",
                    }}
                  >
                    {tile.note}
                  </NativeText>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${index + 1} of ${tiles.length}`}
                disabled={disabled}
                hitSlop={8}
                onPress={tile.remove}
                style={{
                  alignItems: "center",
                  backgroundColor: palette.overlayChip,
                  borderRadius: 999,
                  height: 28,
                  justifyContent: "center",
                  position: "absolute",
                  right: 6,
                  top: 6,
                  width: 28,
                }}
              >
                <Icon
                  className="size-[14px]"
                  color={palette.overlayForeground}
                  name="X"
                />
              </Pressable>
            </View>
          ))}
          {total < 8 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add photo"
              disabled={disabled}
              onPress={() => setAddOpen(true)}
              className="aspect-square w-[31%] items-center justify-center gap-1 rounded-[14px] border-[1.5px] border-dashed border-primary bg-primary/10"
            >
              <Icon className="size-[22px] text-primary" name="Plus" />
              <Text
                numberOfLines={2}
                className="px-1 text-center text-xs font-bold text-primary"
              >
                Add photo
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
      {total >= 8 && !illustrationId ? (
        <Text className="text-sm text-muted-foreground">
          This item has eight photos. Remove one before adding another.
        </Text>
      ) : null}
      {removedSaved ? (
        <Text className="text-sm text-muted-foreground">
          Removed photos leave this item when you save. Other items that use the
          same image keep it.
        </Text>
      ) : null}
      {showLibrary ? (
        <CatalogIllustrationLibrary
          kind={item.kind === "service" ? "service" : "product"}
          businessProfileKey={businessProfileKey}
          categoryKey={catalogIllustrationCategoryKey(item.category)}
          selectedId={illustrationId}
          disabled={disabled}
          onSelect={(id) => {
            if (disabled) return
            draft.chooseIllustration(id)
            if (ids.length) setRemovedSaved(true)
            setIds([])
            setPicked([])
            setSavedIllustrationId(null)
          }}
        />
      ) : null}
      <Text className="text-sm text-muted-foreground">
        Changes take effect when you save. New photos stay private until their
        image checks pass.
      </Text>
      {reuse.isPending ? (
        <StatusBanner tone="default" message="Adding photos from My images…" />
      ) : null}
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
      <AddPhotoSheet
        open={addOpen}
        hasNewPhoto={Boolean(draft.image)}
        onClose={() => setAddOpen(false)}
        onChoose={(choice) => {
          setAddOpen(false)
          if (choice === "gallery") setGalleryOpen(true)
          else if (choice === "illustrations") setShowLibrary(true)
          else void selectPhoto(choice)
        }}
      />
      <CatalogPhotoGalleryPicker
        open={galleryOpen}
        storeId={storeId}
        item={item}
        stores={stores.data ?? []}
        available={Math.max(0, 8 - total)}
        pickedAssetIds={picked.map((entry) => entry.assetId)}
        onClose={() => setGalleryOpen(false)}
        onAdd={(entries) => {
          draft.remove()
          setSavedIllustrationId(null)
          setPicked((value) => [
            ...value,
            ...entries.filter(
              (entry) =>
                !value.some((other) => other.assetId === entry.assetId),
            ),
          ])
        }}
      />
    </View>
  )
}

function AddPhotoSheet({
  open,
  hasNewPhoto,
  onClose,
  onChoose,
}: {
  open: boolean
  hasNewPhoto: boolean
  onClose(): void
  onChoose(choice: "camera" | "photos" | "gallery" | "illustrations"): void
}) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const options = [
    ["camera", "Take a photo", "Camera"],
    [
      "photos",
      hasNewPhoto ? "Replace new photo" : "Choose from phone",
      "Image",
    ],
    ["gallery", "My images", "LayoutGrid"],
    ["illustrations", "Illustration library", "Sparkles"],
  ] as const
  // A plain native modal: the item screen's bottom-sheet host does not show
  // sheets presented from inside this editor.
  return (
    <RNModal
      animationType="fade"
      transparent
      visible={open}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close Add photo"
        onPress={onClose}
        noRipple
        transition={false}
        style={{ backgroundColor: colors.overlay, flex: 1 }}
      />
      <View
        accessibilityViewIsModal
        style={{
          backgroundColor: colors.card,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          bottom: 0,
          gap: 4,
          left: 0,
          paddingBottom: 16 + insets.bottom,
          paddingHorizontal: 12,
          paddingTop: 16,
          position: "absolute",
          right: 0,
        }}
      >
        <Text
          accessibilityRole="header"
          className="px-3 pb-2 text-base font-extrabold text-foreground"
        >
          Add photo
        </Text>
        {options.map(([choice, label, icon]) => (
          <Pressable
            key={choice}
            accessibilityRole="button"
            onPress={() => onChoose(choice)}
            className="min-h-14 flex-row items-center gap-3 rounded-2xl px-3"
          >
            <Icon className="size-[20px] text-foreground" name={icon} />
            <View className="flex-1">
              <Text className="text-base font-semibold text-foreground">
                {label}
              </Text>
              {choice === "gallery" ? (
                <Text className="text-xs text-muted-foreground">
                  Photos already on your items
                </Text>
              ) : null}
            </View>
          </Pressable>
        ))}
        <ActionButton variant="outline" onPress={onClose}>
          Cancel
        </ActionButton>
      </View>
    </RNModal>
  )
}
