import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { getBaseUrl } from "@/lib/base-url"
import { getSession } from "@/lib/session-store"
import { Image } from "expo-image"
import { useState } from "react"
import { View } from "react-native"

/** A saved Catalog photo through the authenticated private preview route. */
export function SavedPhotoPreview({
  assetId,
  storeId,
  name,
  variant = "display",
}: {
  assetId: string
  storeId: string
  name: string
  /** Thumbnails (320px) for grids; display for the large item photo. */
  variant?: "display" | "thumbnail"
}) {
  const session = getSession()
  const [failed, setFailed] = useState(false)
  if (!session?.token || !session.profile.businessSlug) return null
  if (failed)
    return variant === "thumbnail" ? (
      <View
        accessibilityLabel={`${name}: could not load`}
        className="flex-1 items-center justify-center"
      >
        <Icon className="size-[20px] text-muted-foreground" name="Camera" />
      </View>
    ) : (
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
        uri: `${getBaseUrl()}/api/catalog/photos/${encodeURIComponent(assetId)}/preview?storeId=${encodeURIComponent(storeId)}${variant === "thumbnail" ? "&variant=thumbnail" : ""}`,
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
