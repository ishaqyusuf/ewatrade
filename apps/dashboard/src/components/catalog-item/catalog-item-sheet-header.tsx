"use client"

import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { Button } from "@ewatrade/ui"
import { useCatalogItemForm } from "./form-context"

export function CatalogItemSheetHeader() {
  const { setParams } = useCatalogItemParams()
  const { form, setForm } = useCatalogItemForm()
  if (!form.kind) return null
  return (
    <Button
      appearance="form"
      type="button"
      size="sm"
      variant="ghost"
      className="mt-1 -ml-2 text-muted-foreground"
      onClick={() => {
        setForm((current) => ({ ...current, kind: null }))
        void setParams({ catalogCreateKind: null })
      }}
    >
      Change type
    </Button>
  )
}
