import { ActionButton } from "@/components/mobile/action-button"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { getBaseUrl } from "@/lib/base-url"
import { uploadMobileCatalogPhoto } from "@/lib/catalog-photo-upload"
import { getSession } from "@/lib/session-store"
import { useTRPC } from "@/trpc/client"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { findCatalogIllustration } from "@ewatrade/utils/catalog-illustrations"
import { useMutation } from "@tanstack/react-query"
import { Image } from "expo-image"
import { useRef, useState } from "react"
import {
  CatalogIllustrationLibrary,
  CatalogIllustrationPreview,
} from "../catalog-setup/catalog-illustration-library"
import { useCatalogImageDraft } from "../catalog-setup/use-catalog-image-draft"

type ProductDraft = Extract<GeneralAction, { action: "product_create" }>

/** A product draft's saved photo or library picture, for the proposal card. */
export function GeneralProductThumb({
  payload,
  size = 56,
}: {
  payload: ProductDraft
  size?: number
}) {
  const session = getSession()
  const storeId = session?.profile.storeId
  if (payload.photoAssetId && storeId && session?.token)
    return (
      <View
        className="overflow-hidden rounded-xl border border-border"
        style={{ width: size, height: size }}
      >
        <Image
          source={{
            uri: `${getBaseUrl()}/api/catalog/photos/${encodeURIComponent(payload.photoAssetId)}/preview?storeId=${encodeURIComponent(storeId)}&variant=thumbnail`,
            headers: {
              "x-app-authorization": `Bearer ${session.token}`,
              "x-tenant-slug": session.profile.businessSlug ?? "",
              "x-store-id": storeId,
            },
          }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="none"
          accessibilityLabel={payload.name}
        />
      </View>
    )
  if (payload.illustrationId)
    return (
      <View className="items-center justify-center rounded-xl border border-border p-1">
        <CatalogIllustrationPreview
          id={payload.illustrationId}
          size={size - 8}
        />
      </View>
    )
  return null
}

/**
 * Picture state for the product draft editor: the kept photo or library
 * picture, a newly taken or chosen photo, and the upload on save.
 */
export function useProductPicture(initial: GeneralAction, disabled: boolean) {
  const trpc = useTRPC()
  const createIntent = useMutation(
    trpc.catalog.photos.createIntent.mutationOptions(),
  )
  const product = initial.action === "product_create" ? initial : null
  const draft = useCatalogImageDraft({
    canEdit: () => !disabled,
    scopeKey: product ? `${product.name}` : "none",
  })
  // Undefined lets the server pick a matching picture; null means removed.
  const [illustrationId, setIllustrationId] = useState(product?.illustrationId)
  const [keptPhoto, setKeptPhoto] = useState(product?.photoAssetId)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const operation = useRef(`${Date.now()}`)
  return {
    image: draft.image,
    keptPhoto,
    illustrationId,
    selecting: draft.selecting,
    uploading,
    error: error ?? draft.error,
    select: draft.select,
    choose(id: string) {
      draft.remove()
      setKeptPhoto(undefined)
      setIllustrationId(id)
    },
    remove() {
      if (draft.image) draft.remove()
      else if (keptPhoto) setKeptPhoto(undefined)
      else setIllustrationId(null)
    },
    /** Uploads a new photo; null when the upload failed (its message shows). */
    async resolve(): Promise<Pick<
      ProductDraft,
      "illustrationId" | "photoAssetId"
    > | null> {
      let photoAssetId = keptPhoto
      if (draft.image) {
        const storeId = getSession()?.profile.storeId
        if (!storeId) {
          setError("Choose a Store before adding a photo.")
          return null
        }
        setUploading(true)
        setError(null)
        try {
          photoAssetId = await uploadMobileCatalogPhoto({
            image: draft.image,
            storeId,
            clientOperationId: `assistant-product-${operation.current}:photo:${draft.image.id}`,
            assertCurrent: () => {},
            createIntent: (input) => createIntent.mutateAsync(input),
          })
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Photo upload failed. Your draft is unchanged.",
          )
          return null
        } finally {
          setUploading(false)
        }
      }
      return {
        photoAssetId,
        illustrationId: photoAssetId ? undefined : illustrationId,
      }
    },
  }
}

/** Picture row: preview, take or choose a photo, pick from the library, remove. */
export function GeneralProductPictureField({
  picture,
  disabled,
}: {
  picture: ReturnType<typeof useProductPicture>
  disabled: boolean
}) {
  const [library, setLibrary] = useState(false)
  const busy = disabled || picture.uploading || picture.selecting
  const illustration =
    picture.image || picture.keptPhoto
      ? undefined
      : findCatalogIllustration(picture.illustrationId)
  return (
    <View className="gap-3">
      <Text className="text-sm font-bold text-foreground">Picture</Text>
      <View className="flex-row items-center gap-3">
        <View className="size-16 items-center justify-center overflow-hidden rounded-xl border border-border">
          {picture.image ? (
            <Image
              source={{ uri: picture.image.uri }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              accessibilityLabel="New product photo"
            />
          ) : picture.keptPhoto ? (
            <Text className="px-1 text-center text-xs text-muted-foreground">
              Photo added
            </Text>
          ) : illustration ? (
            <CatalogIllustrationPreview id={illustration.id} size={56} />
          ) : (
            <Text className="text-xs text-muted-foreground">None</Text>
          )}
        </View>
        <View className="flex-1 flex-row flex-wrap gap-2">
          <ActionButton
            variant="outline"
            disabled={busy}
            onPress={() => void picture.select("camera")}
          >
            Take photo
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={busy}
            onPress={() => void picture.select("photos")}
          >
            Choose photo
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={busy}
            onPress={() => setLibrary((open) => !open)}
          >
            {library ? "Hide pictures" : "Pictures"}
          </ActionButton>
          {picture.image || picture.keptPhoto || illustration ? (
            <ActionButton
              variant="ghost"
              disabled={busy}
              onPress={picture.remove}
            >
              Remove
            </ActionButton>
          ) : null}
        </View>
      </View>
      {library ? (
        <CatalogIllustrationLibrary
          kind="product"
          selectedId={illustration?.id ?? null}
          disabled={busy}
          onSelect={(id) => {
            picture.choose(id)
            setLibrary(false)
          }}
        />
      ) : null}
      {picture.uploading ? (
        <Text className="text-sm text-muted-foreground">
          Uploading your photo…
        </Text>
      ) : null}
      {picture.error ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-sm text-destructive"
        >
          {picture.error}
        </Text>
      ) : (
        <Text className="text-xs text-muted-foreground">
          A photo replaces the picture.
        </Text>
      )}
    </View>
  )
}
