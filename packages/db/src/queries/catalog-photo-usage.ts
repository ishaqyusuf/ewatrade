import { normalizeCatalogImageUsage } from "@ewatrade/utils/catalog-image-editor"

export const catalogPhotoUsageSelect = {
  optionVariantId: true,
  additionalOptions: { select: { variantId: true } },
} as const

export function catalogPhotoUsage(asset: {
  optionVariantId?: string | null
  additionalOptions?: { variantId: string }[]
}) {
  return normalizeCatalogImageUsage([
    asset.optionVariantId ?? null,
    ...(asset.additionalOptions ?? []).map(({ variantId }) => variantId),
  ])
}
