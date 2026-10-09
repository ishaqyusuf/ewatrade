import { CatalogIllustrationPreview } from "@/components/mobile/catalog-setup/catalog-illustration-library"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme } from "@/hooks/use-color"
import { getBaseUrl } from "@/lib/base-url"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { Image } from "expo-image"
import { useState } from "react"
import type { CatalogAvatarMedia } from "./catalog-avatar-model"
import type { CatalogAvatarTint } from "./catalog-shelf-model"

/** Static class pairs so NativeWind sees every tint. */
export const CATALOG_AVATAR_TINT = {
  mint: { bg: "bg-tint-mint", fg: "text-tint-mint-foreground" },
  amber: { bg: "bg-tint-amber", fg: "text-tint-amber-foreground" },
  sky: { bg: "bg-tint-sky", fg: "text-tint-sky-foreground" },
  lilac: { bg: "bg-tint-lilac", fg: "text-tint-lilac-foreground" },
  rose: { bg: "bg-tint-rose", fg: "text-tint-rose-foreground" },
} as const satisfies Record<CatalogAvatarTint, { bg: string; fg: string }>

/** The initial means no selected media, never a photo-loading placeholder. */
export function CatalogAvatar({
  media,
  name,
  service,
  tint = service ? "sky" : "mint",
}: {
  media: CatalogAvatarMedia
  name: string
  service: boolean
  tint?: CatalogAvatarTint
}) {
  const { token, profile } = useAuthContext()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const { colorScheme } = useColorScheme()
  if (media.kind === "initial")
    return service ? (
      <Icon
        className="size-[19px]"
        color={GREEN_TILL_THEME[colorScheme][`${tint}Foreground`]}
        name="Wrench"
      />
    ) : (
      <Text
        maxFontSizeMultiplier={1.3}
        className={`text-[15px] font-bold ${CATALOG_AVATAR_TINT[tint].fg}`}
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
