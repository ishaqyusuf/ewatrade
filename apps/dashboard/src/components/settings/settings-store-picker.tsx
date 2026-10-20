"use client"

import { SelectControl } from "@ewatrade/ui"
import { useId } from "react"

export const ALL_STORES = "all"

/** The one Store picker every store-specific settings page shows in its header. */
export function SettingsStorePicker({
  includeAll,
  onChange,
  stores,
  value,
}: {
  /** Adds "All stores" for pages with business-wide settings. */
  includeAll?: boolean
  onChange: (storeId: string) => void
  stores: Array<{ id: string; name: string }>
  value: string
}) {
  const id = useId()
  if (stores.length < 2 && !includeAll) return null
  return (
    <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <label htmlFor={id}>Store</label>
      <SelectControl
        id={id}
        className="h-9 min-w-36 font-semibold text-foreground"
        value={value}
        options={[
          ...(includeAll ? [{ value: ALL_STORES, label: "All stores" }] : []),
          ...stores.map((store) => ({ value: store.id, label: store.name })),
        ]}
        onValueChange={onChange}
      />
    </div>
  )
}
