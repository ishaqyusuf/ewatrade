"use client"

import { Image01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"
import { CatalogIllustrationPreview } from "./catalog-illustration-preview"

/**
 * The item's photo beside its name. It opens the images editor (photos,
 * My images, illustrations and AI images), so adding a photo is one tap
 * from the top of the form.
 */
export function CatalogItemPhotoTile({
  previewUrl,
  illustrationId,
  itemName,
  disabled,
  onOpen,
}: {
  previewUrl: string | null
  illustrationId: string | null
  itemName: string
  disabled?: boolean
  onOpen: () => void
}) {
  const filled = Boolean(previewUrl || illustrationId)
  // A preview that cannot load (e.g. still being checked) still reads as added.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      aria-label={filled ? "Change photo" : "Add photo"}
      className={`grid size-20 shrink-0 place-items-center overflow-hidden rounded-[var(--ui-radius-control)] text-muted-foreground hover:bg-[var(--hover)] disabled:opacity-60 ${filled ? "border bg-muted" : "border border-dashed border-[var(--input)]"}`}
    >
      {previewUrl && failedUrl === previewUrl ? (
        <span className="grid justify-items-center gap-1">
          <HugeiconsIcon icon={Tick02Icon} className="size-6" />
          <span className="text-xs font-medium">Photo added</span>
        </span>
      ) : previewUrl ? (
        <img
          src={previewUrl}
          alt={itemName || "Item photo"}
          className="size-full object-cover"
          onError={() => setFailedUrl(previewUrl)}
        />
      ) : illustrationId ? (
        <span className="size-16">
          <CatalogIllustrationPreview compact illustrationId={illustrationId} />
        </span>
      ) : (
        <span className="grid justify-items-center gap-1">
          <HugeiconsIcon icon={Image01Icon} className="size-6" />
          <span className="text-xs font-medium">Photo</span>
        </span>
      )}
    </button>
  )
}
