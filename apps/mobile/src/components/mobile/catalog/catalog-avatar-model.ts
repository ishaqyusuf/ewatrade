export type CatalogAvatarMedia =
  | { kind: "illustration"; illustrationId: string }
  | { kind: "photo"; assetId: string; storeId: string }
  | { kind: "image"; uri: string }
  | { kind: "initial"; label: string }

type CatalogMediaSelection = {
  name: string
  illustrations?: ReadonlyArray<{ storeId: string; illustrationId: string }>
  photos?: ReadonlyArray<{
    storeId: string
    assetId: string
    sortOrder: number
    state: string
  }>
}

/** Selected Store media wins over legacy URLs and the no-selection initial. */
export function selectCatalogAvatar(
  item: CatalogMediaSelection,
  storeId?: string,
  legacyImageUrl?: string | null,
): CatalogAvatarMedia {
  if (storeId) {
    const illustration = item.illustrations?.find(
      (entry) => entry.storeId === storeId,
    )
    if (illustration)
      return {
        kind: "illustration",
        illustrationId: illustration.illustrationId,
      }
    const photo = item.photos
      ?.filter(
        (entry) =>
          entry.storeId === storeId &&
          (entry.state === "APPROVED" || entry.state === "PENDING_REVIEW"),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder)[0]
    if (photo) return { kind: "photo", assetId: photo.assetId, storeId }
  }
  if (legacyImageUrl?.trim())
    return { kind: "image", uri: legacyImageUrl.trim() }
  return {
    kind: "initial",
    label: Array.from(item.name.trim())[0]?.toLocaleUpperCase() ?? "?",
  }
}
