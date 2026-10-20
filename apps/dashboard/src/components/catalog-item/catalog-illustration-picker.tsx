"use client"

import { Button, Field, FieldLabel, Input } from "@ewatrade/ui"
import { CATALOG_CATEGORY_PRESETS } from "@ewatrade/utils/catalog-category-presets"
import { getCatalogIllustrations } from "@ewatrade/utils/catalog-illustrations"
import { useId, useState } from "react"
import { CatalogIllustrationPreview } from "./catalog-illustration-preview"

export function CatalogIllustrationPicker({
  businessProfileKey,
  category,
  kind,
  selectedId,
  disabled,
  onSelect,
}: {
  businessProfileKey?: string | null
  category?: string | null
  kind: "product" | "service"
  selectedId: string | null
  disabled: boolean
  onSelect(id: string): void
}) {
  const id = useId()
  const [query, setQuery] = useState("")
  const [all, setAll] = useState(false)
  const [rootLabel = "", childLabel = ""] = (category ?? "")
    .split(" / ")
    .map((label) => label.trim().toLowerCase())
  const root = CATALOG_CATEGORY_PRESETS.find(
    (preset) => preset.label.toLowerCase() === rootLabel,
  )
  const categoryKey =
    root?.subcategories.find(
      (child) => child.label.toLowerCase() === childLabel,
    )?.key ?? root?.key
  const entries = getCatalogIllustrations({
    businessProfileKey,
    categoryKey,
    kind,
    query,
    all: all || Boolean(query.trim()),
  }).filter((entry) => all || query.trim() || entry.recommended)
  return (
    <section className="space-y-4" aria-label="Illustration library">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium">Illustration library</h4>
        <Button
          type="button"
          appearance="form"
          variant="outline"
          disabled={disabled}
          aria-pressed={all}
          onClick={() => setAll((current) => !current)}
        >
          {all ? "Recommended" : "Browse all"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {query.trim()
          ? "Search results from the entire library."
          : all
            ? "All illustrations. Choose any design for your item."
            : "Recommended for your business, category and item type."}
      </p>
      <Field>
        <FieldLabel htmlFor={id}>Search all illustrations</FieldLabel>
        <Input
          id={id}
          type="search"
          value={query}
          disabled={disabled}
          placeholder="Search by name or keyword"
          onChange={(event) => setQuery(event.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {entries.map(({ illustration, recommended }) => (
          <Button
            key={illustration.id}
            type="button"
            appearance="form"
            variant="outline"
            disabled={disabled}
            aria-pressed={selectedId === illustration.id}
            className="h-auto min-w-0 flex-col items-stretch gap-2 whitespace-normal p-3 text-left aria-pressed:border-primary aria-pressed:bg-accent"
            onClick={() => onSelect(illustration.id)}
          >
            <span aria-hidden="true" className="aspect-square w-full">
              <CatalogIllustrationPreview
                illustrationId={illustration.id}
                compact
              />
            </span>
            <span className="break-words text-sm">{illustration.label}</span>
            {recommended ? (
              <span className="text-xs font-normal text-muted-foreground">
                Recommended
              </span>
            ) : null}
          </Button>
        ))}
      </div>
      {!entries.length ? (
        <output className="block text-sm text-muted-foreground">
          No illustrations match. Try another keyword or Browse all.
        </output>
      ) : null}
    </section>
  )
}
