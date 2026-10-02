"use client"

import type { useCatalogPhoto } from "@/hooks/use-catalog-photo"
import { Button, Field, FieldLabel, Input } from "@ewatrade/ui"
import { findCatalogIllustration } from "@ewatrade/utils/catalog-illustrations"
import { useId } from "react"
import { CatalogIllustrationPicker } from "./catalog-illustration-picker"
import { CatalogIllustrationPreview } from "./catalog-illustration-preview"

export function CatalogImageEditor({
  photo,
  disabled,
  illustrationId,
  onIllustrationChange,
  businessProfileKey,
  category,
  kind,
  allowPhoto = true,
}: {
  photo: ReturnType<typeof useCatalogPhoto>
  disabled: boolean
  illustrationId: string | null
  onIllustrationChange(id: string | null): void
  businessProfileKey?: string | null
  category?: string | null
  kind: "product" | "service"
  allowPhoto?: boolean
}) {
  const id = useId()
  const illustration = findCatalogIllustration(illustrationId)
  return (
    <div className="space-y-5">
      {illustration ? (
        <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
          <CatalogIllustrationPreview illustrationId={illustration.id} />
          <p className="text-sm font-medium">{illustration.label}</p>
          <Button
            type="button"
            appearance="form"
            variant="outline"
            disabled={disabled || photo.uploading}
            onClick={() => onIllustrationChange(null)}
          >
            Remove illustration
          </Button>
        </div>
      ) : photo.preview ? (
        <div className="space-y-3">
          <img
            src={photo.preview}
            alt="Selected catalog item"
            className="h-60 w-full rounded-xl border bg-muted object-contain"
          />
          <p className="break-words text-sm text-muted-foreground">
            {photo.file?.name}
          </p>
          <Button
            type="button"
            appearance="form"
            variant="outline"
            disabled={disabled || photo.uploading}
            onClick={() => photo.select(null)}
          >
            Remove photo
          </Button>
        </div>
      ) : (
        <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed bg-muted/30 p-6 text-center text-muted-foreground">
          No image yet. You can add one later.
        </div>
      )}
      {allowPhoto ? (
        <Field>
          <FieldLabel htmlFor={id}>
            {photo.file ? "Replace photo" : "Choose a photo"}
          </FieldLabel>
          <Input
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            disabled={disabled || photo.uploading}
            onChange={(event) => {
              const selected = event.currentTarget.files?.[0]
              if (selected && photo.select(selected)) onIllustrationChange(null)
              event.currentTarget.value = ""
            }}
          />
        </Field>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Your photo uploads when you save. It remains private until its image
        check passes. JPG, PNG, WebP or HEIC, up to 10 MB.
      </p>
      <CatalogIllustrationPicker
        businessProfileKey={businessProfileKey}
        category={category}
        kind={kind}
        selectedId={illustrationId}
        disabled={disabled || photo.uploading}
        onSelect={(id) => {
          if (photo.select(null)) onIllustrationChange(id)
        }}
      />
      {photo.uploading ? (
        <output className="text-sm">Uploading your photo…</output>
      ) : null}
      {photo.error ? (
        <p role="alert" className="text-sm text-destructive">
          {photo.error}
        </p>
      ) : null}
    </div>
  )
}
