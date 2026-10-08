import { CatalogIllustrationPreview } from "@/components/mobile/catalog-setup/catalog-illustration-library"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { getBaseUrl } from "@/lib/base-url"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { Image } from "expo-image"
import { useState } from "react"
import type { CatalogAvatarMedia } from "./catalog-avatar-model"

/** The initial means no selected media, never a photo-loading placeholder. */
export function CatalogAvatar({
  media,
  name,
  service,
}: { media: CatalogAvatarMedia; name: string; service: boolean }) {
  const { token, profile } = useAuthContext()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  if (media.kind === "initial")
    return (
      <Text
        maxFontSizeMultiplier={1.3}
        className={
          service
            ? "text-sm font-bold text-tint-lilac-foreground"
            : "text-sm font-bold text-tint-mint-foreground"
        }
      >
        {media.label}
      </Text>
    )
  if (media.kind === "illustration")
    return <CatalogIllustrationPreview id={media.illustrationId} size={42} />
  if (media.kind === "photo") {
    if (offline || !token || !profile?.businessSlug)
      return <UnavailableImage name={name} />
    return (
      <CatalogAvatarImage
        key={`${profile.businessId}:${profile.id}:${media.storeId}:${media.assetId}`}
        name={name}
        source={{
          uri: `${getBaseUrl()}/api/catalog/photos/${encodeURIComponent(media.assetId)}/preview?storeId=${encodeURIComponent(media.storeId)}&variant=thumbnail`,
          headers: {
            "x-app-authorization": `Bearer ${token}`,
            "x-tenant-slug": profile.businessSlug,
            "x-store-id": media.storeId,
          },
        }}
      />
    )
  }
  return (
    <CatalogAvatarImage
      key={media.uri}
      name={name}
      source={{ uri: media.uri }}
    />
  )
}

function UnavailableImage({ name }: { name: string }) {
  return (
    <Icon
      accessibilityLabel={`${name} · selected image unavailable`}
      className="size-[20px] text-muted-foreground"
      name="Camera"
    />
  )
}

function CatalogAvatarImage({
  source,
  name,
}: {
  source: { uri: string; headers?: Record<string, string> }
  name: string
}) {
  const [failed, setFailed] = useState(false)
  return failed ? (
    <UnavailableImage name={name} />
  ) : (
    <Image
      accessibilityLabel={name}
      source={source}
      style={{ width: 42, height: 42 }}
      contentFit="cover"
      cachePolicy="none"
      recyclingKey={source.uri}
      onError={() => setFailed(true)}
    />
  )
}
