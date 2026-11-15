import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { Image } from "expo-image"
import { CatalogIllustrationPreview } from "./catalog-illustration-library"
import type { CatalogSetupModel } from "./use-catalog-setup"

/**
 * The item's picture beside its name: shows the photo or illustration once
 * one is chosen and opens the Photos editor. At large text it becomes a row.
 */
export function CatalogPhotoTile({
  model,
  onPress,
}: {
  model: CatalogSetupModel
  onPress: () => void
}) {
  const largeTextLayout = useLargeTextLayout()
  const { image, illustrationId, assetIds, reused } = model.imageDraft
  const savedCount = assetIds.length || (reused ? 1 : 0)
  const hasPicture = Boolean(
    image || illustrationId || savedCount || model.imageUrl,
  )
  const summary = illustrationId
    ? "Illustration"
    : savedCount
      ? `${savedCount} photo${savedCount === 1 ? "" : "s"}`
      : hasPicture
        ? "1 photo"
        : "Add photo"
  const picture = image ? (
    <Image
      accessible={false}
      contentFit="cover"
      source={{ uri: image.uri }}
      style={{ height: "100%", width: "100%" }}
    />
  ) : illustrationId ? (
    <CatalogIllustrationPreview id={illustrationId} size={56} />
  ) : (
    <Icon
      className={cn(
        "size-[22px]",
        hasPicture ? "text-primary" : "text-muted-foreground",
      )}
      name={hasPicture ? "Check" : "Camera"}
    />
  )

  if (largeTextLayout)
    return (
      <Pressable
        accessibilityHint={summary}
        accessibilityLabel="Photos"
        accessibilityRole="button"
        className="min-h-16 flex-row items-center gap-3 rounded-2xl bg-muted px-3.5 py-3"
        disabled={model.locked}
        haptic
        onPress={onPress}
      >
        <View className="size-12 items-center justify-center overflow-hidden rounded-xl bg-card">
          {picture}
        </View>
        <Text className="min-w-0 flex-1 text-base font-bold text-foreground">
          {hasPicture ? summary : "Add a photo"}
        </Text>
        <Icon
          className="size-[18px] text-muted-foreground"
          name="ChevronRight"
        />
      </Pressable>
    )

  return (
    <Pressable
      accessibilityHint={summary}
      accessibilityLabel="Photos"
      accessibilityRole="button"
      className={cn(
        "w-[84px] items-center justify-center gap-1 overflow-hidden rounded-2xl",
        image
          ? "bg-muted"
          : "border-[1.5px] border-dashed border-border bg-muted",
      )}
      disabled={model.locked}
      haptic
      onPress={onPress}
    >
      {image ? (
        picture
      ) : (
        <>
          {picture}
          <Text
            className={cn(
              "text-center text-xs font-bold [-rn-line-height:16]",
              hasPicture ? "text-primary" : "text-muted-foreground",
            )}
            numberOfLines={1}
          >
            {summary}
          </Text>
        </>
      )}
    </Pressable>
  )
}
