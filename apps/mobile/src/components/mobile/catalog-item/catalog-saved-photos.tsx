import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { getBaseUrl } from "@/lib/base-url"
import { uploadMobileCatalogPhoto } from "@/lib/catalog-photo-upload"
import { canEditMobileCatalog } from "@/lib/mobile-roles"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { findCatalogIllustration } from "@ewatrade/utils/catalog-illustrations"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { Image } from "expo-image"
import { useEffect, useRef, useState } from "react"
import { View } from "react-native"
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
  if (!storeId || offline) return null
  const photos = item.photos.filter((photo) => photo.storeId === storeId)
  const illustration = item.illustrations.find(
    (entry) => entry.storeId === storeId,
  )
  return (
    <View className="gap-4">
      <Text className="text-lg font-bold text-foreground">Images</Text>
      {editing ? (
        <SavedPhotoEditor
          key={`${profile?.id}:${profile?.businessId}:${item.id}:${storeId}`}
          item={item}
          storeId={storeId}
          close={() => setEditing(false)}
        />
      ) : (
        <>
          {illustration ? (
            <View className="items-center gap-2">
              <CatalogIllustrationPreview
                id={illustration.illustrationId}
                size={220}
              />
              <Text className="text-muted-foreground">
                {findCatalogIllustration(illustration.illustrationId)?.label}
              </Text>
            </View>
          ) : null}
          {photos.map((photo) => (
            <View className="gap-2" key={photo.assetId}>
              <SavedPhotoPreview
                assetId={photo.assetId}
                storeId={storeId}
                name={item.name}
              />
              <Text className="text-sm text-muted-foreground">
                {photo.state === "APPROVED"
                  ? "Image check passed"
                  : "Private · image check pending"}
              </Text>
            </View>
          ))}
          {!photos.length && !illustration ? (
            <Text className="text-sm text-muted-foreground">
              No image yet. You can add one later.
            </Text>
          ) : null}
          {canManage ? (
            <ActionButton
              variant="outline"
              icon="Camera"
              onPress={() => setEditing(true)}
            >
              {photos.length || illustration ? "Edit images" : "Add an image"}
            </ActionButton>
          ) : null}
        </>
      )}
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
  return (
    <View className="gap-2 overflow-hidden rounded-2xl border border-border bg-card">
      <Image
        source={{
          uri: `${getBaseUrl()}/api/catalog/photos/${encodeURIComponent(assetId)}/preview?storeId=${encodeURIComponent(storeId)}`,
          headers: {
            "x-app-authorization": `Bearer ${session.token}`,
            "x-tenant-slug": session.profile.businessSlug,
            "x-store-id": storeId,
          },
        }}
        style={{ width: "100%", height: 220 }}
        contentFit="contain"
        cachePolicy="none"
        accessibilityLabel={name}
        onError={() => setFailed(true)}
      />
      {failed ? (
        <StatusBanner
          tone="warning"
          message="This image could not load. Refresh to try again."
        />
      ) : null}
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
          <SavedPhotoPreview assetId={id} storeId={storeId} name={item.name} />
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
