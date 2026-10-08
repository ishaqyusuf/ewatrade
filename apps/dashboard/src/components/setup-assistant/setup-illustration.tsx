"use client"

import { Button } from "@ewatrade/ui"
import { findCatalogCategoryPreset } from "@ewatrade/utils/catalog-category-presets"
import { findCatalogIllustration } from "@ewatrade/utils/catalog-illustrations"
import { useState } from "react"
import { CatalogIllustrationPicker } from "../catalog-item/catalog-illustration-picker"
import { CatalogIllustrationPreview } from "../catalog-item/catalog-illustration-preview"
import type { SetupCardPayload } from "./setup-format"

type Illustrated = Extract<SetupCardPayload, { kind: "product" | "service" }>

const illustratable = (payload: SetupCardPayload): payload is Illustrated =>
  (payload.kind === "product" && !payload.photoAttachmentId) ||
  payload.kind === "service"

/** The library illustration added with this record; a sent photo replaces it. */
export function setupIllustrationId(payload: SetupCardPayload) {
  if (!illustratable(payload) || !payload.illustrationId) return undefined
  return findCatalogIllustration(payload.illustrationId)
    ? payload.illustrationId
    : undefined
}

/** The picker reads categories by label, as Catalog stores them. */
function categoryLabel(categoryKey: string | undefined) {
  const key = categoryKey?.replace(/^preset:/, "")
  const root = key ? findCatalogCategoryPreset(key.split(":")[0]) : undefined
  if (!key || !root) return null
  const child = root.subcategories.find((entry) => entry.key === key)
  return child ? `${root.label} / ${child.label}` : root.label
}

/** Round record avatar: the illustration when there is one, else emoji or initial. */
export function SetupRecordAvatar({
  payload,
  emoji,
  className,
}: {
  payload: SetupCardPayload
  emoji: string | null | undefined
  className: string
}) {
  const illustrationId = setupIllustrationId(payload)
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ${className}`}
    >
      {illustrationId ? (
        <span className="size-[80%]">
          <CatalogIllustrationPreview illustrationId={illustrationId} compact />
        </span>
      ) : (
        (emoji ?? payload.name.slice(0, 1).toUpperCase())
      )}
    </span>
  )
}

/** Change, remove or choose the picture added with a product or service. */
export function SetupIllustrationControl({
  payload,
  pending,
  onSave,
}: {
  payload: SetupCardPayload
  pending: boolean
  onSave: (payload: SetupCardPayload) => void
}) {
  const [choosing, setChoosing] = useState(false)
  if (!illustratable(payload)) return null
  const current = setupIllustrationId(payload)
  const label = current ? findCatalogIllustration(current)?.label : undefined
  const save = (illustrationId: string | null) => {
    onSave({ ...payload, illustrationId })
    setChoosing(false)
  }

  return (
    <div className="mt-2 space-y-2">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span>{label ? `Picture: ${label}` : "No picture"}</span>
        <Button
          type="button"
          size="sm"
          variant="link"
          className="h-auto p-0 text-[11px]"
          disabled={pending}
          aria-expanded={choosing}
          aria-label={
            label
              ? `Change the picture for ${payload.name}`
              : `Choose a picture for ${payload.name}`
          }
          onClick={() => setChoosing((open) => !open)}
        >
          {choosing ? "Close" : label ? "Change" : "Choose a picture"}
        </Button>
        {label ? (
          <Button
            type="button"
            size="sm"
            variant="link"
            className="h-auto p-0 text-[11px]"
            disabled={pending}
            aria-label={`Remove the picture for ${payload.name}`}
            onClick={() => save(null)}
          >
            Remove
          </Button>
        ) : null}
      </p>
      {choosing ? (
        <div className="rounded-lg border border-border p-3">
          <CatalogIllustrationPicker
            category={categoryLabel(payload.categoryKey)}
            kind={payload.kind}
            selectedId={current ?? null}
            disabled={pending}
            onSelect={(id) => save(id)}
          />
        </div>
      ) : null}
    </div>
  )
}
