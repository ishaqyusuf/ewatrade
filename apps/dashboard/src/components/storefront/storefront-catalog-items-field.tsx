"use client"

import { useTRPC } from "@/trpc/client"
import type { EditableField } from "@ewatrade/storefront-contracts/manifest"
import {
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Spinner,
} from "@ewatrade/ui"
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  PinIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueries, useQuery } from "@tanstack/react-query"
import { useEffect, useId, useRef, useState } from "react"

type CatalogItemsField = Extract<EditableField, { kind: "catalog-items" }>
export type PinnedEntry = {
  id: string
  name: string | null
  listed: boolean
  /** Name still loading; not yet known to be unavailable. */
  pending?: boolean
}
export type PinCandidate = { id: string; name: string }

/** Pure list edits, kept separate so order rules are testable without a browser. */
export function pinCatalogItem(
  ids: readonly string[],
  id: string,
  max: number,
) {
  return ids.includes(id) || ids.length >= max ? [...ids] : [...ids, id]
}
export function unpinCatalogItem(ids: readonly string[], id: string) {
  return ids.filter((entry) => entry !== id)
}
export function moveCatalogItem(
  ids: readonly string[],
  id: string,
  direction: -1 | 1,
) {
  const next = [...ids]
  const index = next.indexOf(id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= next.length) return next
  ;[next[index], next[target]] = [next[target] as string, next[index] as string]
  return next
}

/**
 * Studio picker for a `catalog-items` field. Searches the business's own catalog
 * through the existing staff-scoped list read and stores IDs only; names here are
 * for the editor, and the storefront always renders current public facts.
 */
export function StorefrontCatalogItemsField({
  field,
  value,
  onChange,
  disabled,
  publicItems,
}: {
  field: CatalogItemsField
  value: unknown
  onChange: (value: string[]) => void
  disabled: boolean
  /** Items in the current preview load, or null before it loads. */
  publicItems: readonly { id: string; name: string }[] | null
}) {
  const trpc = useTRPC()
  const ids = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : []
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState("")
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])
  const results = useQuery(
    trpc.catalog.listItemsPage.queryOptions(
      {
        kind: field.itemKind === "SERVICE" ? "service" : "product",
        status: "active",
        limit: 8,
        ...(search ? { query: search } : {}),
      },
      { staleTime: 30_000, retry: false },
    ),
  )
  const known = new Map<string, string>()
  for (const item of publicItems ?? []) known.set(item.id, item.name)
  for (const item of results.data?.items ?? []) known.set(item.id, item.name)
  // Bounded by the field's max (≤ 8): only pins whose name isn't already known.
  const missing = ids.filter((id) => !known.has(id))
  const lookups = useQueries({
    queries: missing.map((itemId) =>
      trpc.catalog.getItem.queryOptions(
        { itemId },
        { staleTime: 60_000, retry: false },
      ),
    ),
  })
  const pending = new Set<string>()
  missing.forEach((id, index) => {
    const lookup = lookups[index]
    if (lookup?.data?.name) known.set(id, lookup.data.name)
    else if (lookup?.isPending || results.isPending) pending.add(id)
  })
  const listed = new Set((publicItems ?? []).map((item) => item.id))
  return (
    <CatalogItemsPicker
      field={field}
      entries={ids.map((id) => ({
        id,
        name: known.get(id) ?? null,
        listed: publicItems === null || listed.has(id),
        pending: pending.has(id),
      }))}
      candidates={(results.data?.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
      }))}
      query={query}
      searching={results.isFetching}
      failed={results.isError}
      disabled={disabled}
      onQuery={setQuery}
      onChange={onChange}
    />
  )
}

export function CatalogItemsPicker({
  field,
  entries,
  candidates,
  query,
  searching,
  failed,
  disabled,
  onQuery,
  onChange,
}: {
  field: CatalogItemsField
  entries: PinnedEntry[]
  candidates: PinCandidate[]
  query: string
  searching: boolean
  failed: boolean
  disabled: boolean
  onQuery: (value: string) => void
  onChange: (value: string[]) => void
}) {
  const id = useId()
  const ids = entries.map((entry) => entry.id)
  const full = ids.length >= field.maxItems
  const [announcement, setAnnouncement] = useState("")
  const [focus, setFocus] = useState<string | null>(null)
  const list = useRef<HTMLOListElement>(null)
  useEffect(() => {
    if (!focus) return
    const target = list.current?.querySelector<HTMLButtonElement>(
      `[data-pin-action="${focus}"]`,
    )
    // A move button at the list edge is disabled; keep focus on the row's other control.
    ;(target && !target.disabled
      ? target
      : list.current?.querySelector<HTMLButtonElement>(
          `[data-pin-row="${focus.split(":")[0]}"] button:not(:disabled)`,
        )
    )?.focus()
    setFocus(null)
  }, [focus])
  const label = (entry: PinnedEntry) =>
    entry.name ?? (entry.pending ? "Loading item…" : "Unavailable item")
  const move = (entry: PinnedEntry, direction: -1 | 1) => {
    const next = moveCatalogItem(ids, entry.id, direction)
    onChange(next)
    setFocus(`${entry.id}:${direction < 0 ? "up" : "down"}`)
    setAnnouncement(
      `${label(entry)} moved to position ${next.indexOf(entry.id) + 1} of ${next.length}.`,
    )
  }
  const remove = (entry: PinnedEntry, index: number) => {
    const next = unpinCatalogItem(ids, entry.id)
    onChange(next)
    const neighbour = next[Math.min(index, next.length - 1)]
    if (neighbour) setFocus(`${neighbour}:remove`)
    else document.getElementById(`${id}-search`)?.focus()
    setAnnouncement(`${label(entry)} unpinned.`)
  }
  const pin = (candidate: PinCandidate) => {
    const next = pinCatalogItem(ids, candidate.id, field.maxItems)
    onChange(next)
    setAnnouncement(
      `${candidate.name} pinned at position ${next.indexOf(candidate.id) + 1}.`,
    )
  }
  return (
    <fieldset className="sf-pin-field" aria-describedby={`${id}-hint`}>
      <legend>
        {field.label}
        <small>
          {ids.length} of {field.maxItems}
        </small>
      </legend>
      <p id={`${id}-hint`} className="sf-config-hint">
        Shown first, in this order. Other spots fill automatically. Hidden,
        archived or sold-elsewhere items are skipped on your website.
      </p>
      {entries.length ? (
        <ol className="sf-pin-list" ref={list} aria-label={field.label}>
          {entries.map((entry, index) => (
            <li key={entry.id} data-pin-row={entry.id}>
              <span className="sf-pin-order" aria-hidden="true">
                {index + 1}
              </span>
              <span className="sf-pin-name">
                {label(entry)}
                {!entry.pending && (!entry.listed || !entry.name) ? (
                  <small>Not on your website now. It will be skipped.</small>
                ) : null}
              </span>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                data-pin-action={`${entry.id}:up`}
                aria-label={`Move ${label(entry)} up`}
                disabled={disabled || index === 0}
                onClick={() => move(entry, -1)}
              >
                <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                data-pin-action={`${entry.id}:down`}
                aria-label={`Move ${label(entry)} down`}
                disabled={disabled || index === entries.length - 1}
                onClick={() => move(entry, 1)}
              >
                <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                data-pin-action={`${entry.id}:remove`}
                aria-label={`Unpin ${label(entry)}`}
                disabled={disabled}
                onClick={() => remove(entry, index)}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="sf-pin-empty">
          No pinned products. Featured picks automatically.
        </p>
      )}
      <label htmlFor={`${id}-search`} className="sf-pin-search-label">
        Find a product to pin
      </label>
      <InputGroup>
        <InputGroupAddon>
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
        </InputGroupAddon>
        <InputGroupInput
          id={`${id}-search`}
          type="search"
          value={query}
          maxLength={160}
          placeholder="Search your catalog"
          disabled={disabled}
          onChange={(event) => onQuery(event.target.value)}
        />
        {searching ? (
          <InputGroupAddon align="inline-end">
            <Spinner />
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      {failed ? (
        <p className="sf-pin-empty" role="alert">
          Your catalog couldn't be searched. Try again.
        </p>
      ) : candidates.length ? (
        <ul className="sf-pin-results" aria-label="Search results">
          {candidates.map((candidate) => {
            const chosen = ids.includes(candidate.id)
            return (
              <li key={candidate.id}>
                <span>{candidate.name}</span>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  aria-label={
                    chosen
                      ? `${candidate.name} is pinned`
                      : `Pin ${candidate.name}`
                  }
                  disabled={disabled || chosen || full}
                  onClick={() => pin(candidate)}
                >
                  <HugeiconsIcon icon={PinIcon} strokeWidth={2} />
                  {chosen ? "Pinned" : "Pin"}
                </Button>
              </li>
            )
          })}
        </ul>
      ) : searching ? null : (
        <p className="sf-pin-empty">No matching active products.</p>
      )}
      {full ? (
        <p className="sf-config-hint">
          You can pin up to {field.maxItems}. Unpin one to choose another.
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </fieldset>
  )
}
