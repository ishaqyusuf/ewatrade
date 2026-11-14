"use client"

import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { Button } from "@ewatrade/ui"
import { useCatalogItemForm } from "./form-context"

export function CatalogItemSheetHeader() {
  const { setParams } = useCatalogItemParams()
  const { form, setForm } = useCatalogItemForm()
  if (!form.kind) return null
  // One line under the title: the type, and a way to change it.
  return (
    <p className="flex items-center gap-1.5 text-muted-foreground">
      {form.kind === "service" ? "Service" : "Goods"}
      <span aria-hidden="true">·</span>
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-[var(--link)]"
        onClick={() => {
          setForm((current) => ({ ...current, kind: null }))
          void setParams({ catalogCreateKind: null })
        }}
      >
        Change type
      </Button>
    </p>
  )
}
