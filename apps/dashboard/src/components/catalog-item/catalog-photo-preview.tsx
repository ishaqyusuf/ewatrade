"use client"

import { Button } from "@ewatrade/ui"
import { useState } from "react"

export function CatalogPhotoPreview({
  assetId,
  storeId,
  label,
  compact = false,
}: { assetId: string; storeId: string; label: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false)
  if (failed)
    return compact ? (
      <span
        aria-label="Image unavailable"
        className="text-xs text-muted-foreground"
      >
        —
      </span>
    ) : (
      <div className="space-y-3 rounded-xl border bg-muted p-5">
        <output className="block text-sm text-muted-foreground">
          This image could not load.
        </output>
        <Button
          appearance="form"
          variant="outline"
          type="button"
          onClick={() => setFailed(false)}
        >
          Try image again
        </Button>
      </div>
    )
  return (
    <img
      src={`/api/catalog/photos/${encodeURIComponent(assetId)}/preview?storeId=${encodeURIComponent(storeId)}${compact ? "&variant=thumbnail" : ""}`}
      alt={label}
      className={
        compact
          ? "size-9 object-contain"
          : "h-52 w-full rounded-xl border bg-muted object-contain"
      }
      onError={() => setFailed(true)}
    />
  )
}
