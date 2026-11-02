"use client"

import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { Image01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { CatalogPhotoGalleryDialog } from "./catalog-photo-gallery-dialog"

/** Opens My images from Catalog to upload and organise photos with no item. */
export function OpenMyImages({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const [open, setOpen] = useState(false)
  const stores = useQuery({
    ...trpc.tenant.stores.queryOptions(),
    enabled: open,
  })
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <HugeiconsIcon icon={Image01Icon} aria-hidden="true" />
        My images
      </Button>
      <CatalogPhotoGalleryDialog
        open={open}
        onOpenChange={setOpen}
        storeId={storeId}
        stores={stores.data ?? []}
      />
    </>
  )
}
