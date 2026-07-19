"use client"

import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { Button } from "@ewatrade/ui"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export function OpenCatalogItemSheet() {
  const { setCatalogItemMode } = useCatalogItemParams()

  return (
    <Button
      type="button"
      className="gap-2"
      onClick={() => setCatalogItemMode("create")}
    >
      <HugeiconsIcon icon={Add01Icon} className="size-4" />
      Add item
    </Button>
  )
}
