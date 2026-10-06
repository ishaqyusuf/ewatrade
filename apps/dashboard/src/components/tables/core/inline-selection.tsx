"use client"

import { Button, Checkbox } from "@ewatrade/ui"
import { useEffect, useMemo, useState } from "react"

export type InlineSelection = {
  count: number
  allSelected: boolean
  someSelected: boolean
  disabled: boolean
  isSelected: (id: string) => boolean
  setSelected: (id: string, checked: boolean) => void
  setAll: (checked: boolean) => void
  clear: () => void
}

/** Keeps selected IDs that are still loaded; returns `previous` when unchanged. */
export function pruneInlineSelection(
  previous: ReadonlySet<string>,
  loadedIds: readonly string[],
): ReadonlySet<string> {
  const loaded = new Set(loadedIds)
  const kept = [...previous].filter((id) => loaded.has(id))
  return kept.length === previous.size ? previous : new Set(kept)
}

/**
 * Ephemeral selection for plain (non-TanStack) inline tables. Matches the
 * directory contract: stable record IDs, a new `scope` clears it, unloaded IDs
 * are dropped, and select-all covers the loaded rows only. Summary or total
 * rows must not be passed in `ids`.
 */
export function useInlineSelection({
  ids,
  scope,
  disabled = false,
}: {
  ids: readonly string[]
  scope: string
  disabled?: boolean
}): InlineSelection {
  const [selected, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [selectionScope, setSelectionScope] = useState(scope)
  if (selectionScope !== scope) {
    setSelectionScope(scope)
    setSelectedIds(new Set())
  }
  const idsKey = ids.join("\n")
  // biome-ignore lint/correctness/useExhaustiveDependencies: idsKey captures the loaded ID list.
  useEffect(() => {
    setSelectedIds((previous) => pruneInlineSelection(previous, ids))
  }, [idsKey])

  return useMemo(() => {
    const count = ids.filter((id) => selected.has(id)).length
    return {
      count,
      allSelected: ids.length > 0 && count === ids.length,
      someSelected: count > 0 && count < ids.length,
      disabled: disabled || ids.length === 0,
      isSelected: (id) => selected.has(id),
      setSelected: (id, checked) =>
        setSelectedIds((previous) => {
          const next = new Set(previous)
          if (checked) next.add(id)
          else next.delete(id)
          return next
        }),
      setAll: (checked) => setSelectedIds(checked ? new Set(ids) : new Set()),
      clear: () => setSelectedIds(new Set()),
    }
  }, [ids, selected, disabled])
}

export function InlineSelectAllCheckbox({
  selection,
  label,
}: {
  selection: InlineSelection
  label: string
}) {
  return (
    <Checkbox
      aria-label={label}
      checked={selection.allSelected}
      indeterminate={selection.someSelected}
      disabled={selection.disabled}
      onCheckedChange={(checked) => selection.setAll(checked)}
    />
  )
}

export function InlineRowCheckbox({
  selection,
  id,
  label,
}: {
  selection: InlineSelection
  id: string
  label: string
}) {
  return (
    <Checkbox
      aria-label={label}
      checked={selection.isSelected(id)}
      disabled={selection.disabled}
      onCheckedChange={(checked) => selection.setSelected(id, checked)}
    />
  )
}

/** In-place count and Deselect all; inline tables often live inside sheets. */
export function InlineSelectionStatus({
  selection,
  note,
}: {
  selection: InlineSelection
  /** States what nearby exports or actions cover, e.g. that an export ignores the selection. */
  note?: string
}) {
  return (
    <output aria-live="polite" className="block">
      {selection.count > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {selection.count} selected{note ? ` · ${note}` : ""}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-none"
            onClick={selection.clear}
          >
            Deselect all
          </Button>
        </div>
      ) : null}
    </output>
  )
}
