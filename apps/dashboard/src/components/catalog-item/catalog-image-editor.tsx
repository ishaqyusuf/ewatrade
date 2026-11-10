"use client"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import type { useCatalogPhoto } from "@/hooks/use-catalog-photo"
import { Button, Sheet } from "@ewatrade/ui"
import { useState } from "react"
import { useCatalogThemeClass } from "./catalog-appearance"
import { CatalogImagesEditor } from "./catalog-images-editor"

/** New items use the same image editor as saved-item Images. Uploaded private
 * assets stay in the owning form draft and attach through its normal save. */
export function CatalogImageEditor({
  photo,
  disabled,
  illustrationId,
  onIllustrationChange,
  category,
  kind,
  gallery,
  contextKey,
  description = "",
  open,
  onOpenChange,
}: {
  photo: ReturnType<typeof useCatalogPhoto>
  disabled: boolean
  illustrationId: string | null
  onIllustrationChange(id: string | null): void
  businessProfileKey?: string | null
  category?: string | null
  kind: "product" | "service"
  allowPhoto?: boolean
  gallery?: {
    storeId: string
    itemName: string
    stores: Array<{ id: string; name: string }>
  }
  contextKey: string
  description?: string
  open: boolean
  onOpenChange(open: boolean): void
}) {
  const theme = useCatalogThemeClass()
  const [mediaBusy, setMediaBusy] = useState(false)
  if (!gallery?.storeId)
    return (
      <p className="text-sm text-muted-foreground">
        Choose a Store before adding images.
      </p>
    )
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!mediaBusy) onOpenChange(next)
      }}
    >
      <SheetFrame
        title="Images"
        description={gallery.itemName || "New item"}
        popupClassName={theme}
        closeDisabled={mediaBusy}
        back={{
          label: "Back to item",
          onClick: () => {
            if (!mediaBusy) onOpenChange(false)
          },
        }}
        footer={
          <Button
            type="button"
            className="rounded-full"
            disabled={mediaBusy}
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        }
      >
        <CatalogImagesEditor
          storeId={gallery.storeId}
          contextKey={contextKey}
          facts={{
            kind: kind === "service" ? "SERVICE" : "PRODUCT",
            name: gallery.itemName,
            description,
            category: category ?? "",
          }}
          assetIds={photo.assetIds}
          onChange={photo.restore}
          disabled={disabled}
          onBusyChange={setMediaBusy}
          illustrationId={illustrationId}
          onIllustrationChange={onIllustrationChange}
        />
      </SheetFrame>
    </Sheet>
  )
}
