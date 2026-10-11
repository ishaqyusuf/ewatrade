"use client"
import { CatalogIllustrationPreview } from "@/components/catalog-item/catalog-illustration-preview"
import { CatalogPhotoPreview } from "@/components/catalog-item/catalog-photo-preview"
import { useTRPC } from "@/trpc/client"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { Image01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"

type ProductDraft = Extract<GeneralAction, { action: "product_create" }>

/** The Store the assistant works in; photos are uploaded and previewed there. */
export function useAssistantStoreId() {
  const trpc = useTRPC()
  return useQuery(trpc.tenant.current.queryOptions()).data?.activeStore?.id
}

/** A product draft's photo or library picture, or an empty photo spot. */
export function GeneralProductPicture({
  payload,
  onAdd,
}: {
  payload: ProductDraft
  /** Opens the editor when there is no picture yet. */
  onAdd?: () => void
}) {
  const storeId = useAssistantStoreId()
  const frame =
    "flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40"
  if (payload.photoAssetId && storeId)
    return (
      <div className={frame}>
        <CatalogPhotoPreview
          assetId={payload.photoAssetId}
          storeId={storeId}
          label={`${payload.name} photo`}
          compact
        />
      </div>
    )
  if (payload.illustrationId)
    return (
      <div className={`${frame} p-1.5`}>
        <CatalogIllustrationPreview
          illustrationId={payload.illustrationId}
          compact
        />
      </div>
    )
  if (!onAdd) return null
  return (
    <button
      type="button"
      onClick={onAdd}
      className={`${frame} flex-col gap-0.5 border-dashed text-[11px] text-muted-foreground hover:text-foreground`}
    >
      <HugeiconsIcon icon={Image01Icon} className="size-4" />
      Add photo
    </button>
  )
}
