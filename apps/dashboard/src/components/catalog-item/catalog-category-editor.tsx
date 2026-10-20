"use client"

import { useTRPC } from "@/trpc/client"
import {
  Button,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
} from "@ewatrade/ui"
import {
  CATALOG_CATEGORY_PRESETS,
  type CatalogCategoryPreset,
  getCatalogCategoryPresets,
} from "@ewatrade/utils/catalog-category-presets"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

export function CatalogCategoryEditor({
  businessProfileKey,
  category,
  enabled,
  kind,
  onChange,
  storeId,
}: {
  businessProfileKey?: string | null
  category: string
  enabled: boolean
  kind: "product" | "service"
  onChange: (value: string) => void
  storeId: string
}) {
  const trpc = useTRPC()
  const recentQuery = useQuery(
    trpc.catalog.listItemsPage.queryOptions(
      { kind, limit: 50, sort: { field: "updatedAt", direction: "desc" } },
      { enabled, staleTime: 30_000 },
    ),
  )
  const savedQuery = useQuery(
    trpc.catalog.categories.list.queryOptions(
      { storeId },
      { enabled, retry: false, staleTime: 30_000 },
    ),
  )
  const [query, setQuery] = useState("")
  const [all, setAll] = useState(false)
  const [parent, setParent] = useState<CatalogCategoryPreset | null>(null)
  const presets = getCatalogCategoryPresets({
    businessProfileKey,
    kind,
    query,
    all: all || Boolean(query),
  })
  const recentLabels = [
    ...new Set([
      ...(savedQuery.data ?? []).flatMap((root) => [
        root.label,
        ...root.children.map((child) => `${root.label} / ${child.label}`),
      ]),
      ...(recentQuery.data?.items ?? [])
        .filter((item) =>
          item.variants.some((variant) =>
            variant.offerings.some((offering) =>
              offering.stores.some(
                (store) => store.storeId === storeId && store.isAvailable,
              ),
            ),
          ),
        )
        .flatMap((item) =>
          item.category?.trim() ? [item.category.trim()] : [],
        ),
    ]),
  ].filter((label) => label.toLowerCase().includes(query.trim().toLowerCase()))
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="catalog-category">Category (optional)</FieldLabel>
        <Input
          id="catalog-category"
          value={category}
          maxLength={120}
          placeholder="Uncategorized"
          onChange={(event) => {
            onChange(event.target.value)
            setParent(null)
          }}
        />
        <FieldDescription>
          Use your own category or choose a suggestion and optional subcategory.
        </FieldDescription>
      </Field>
      {recentQuery.isError || savedQuery.isError ? (
        <p className="text-sm text-muted-foreground">
          Recent labels could not load. You can still use suggestions or enter a
          category.
        </p>
      ) : null}
      {recentLabels.length ? (
        <FieldGroup className="gap-2">
          <p className="text-sm font-medium">
            Previously used in this business
          </p>
          <div className="flex flex-wrap gap-2">
            {recentLabels.map((label) => (
              <Button
                appearance="form"
                type="button"
                variant="outline"
                size="sm"
                key={label}
                onClick={() => {
                  onChange(label)
                  setParent(
                    CATALOG_CATEGORY_PRESETS.find(
                      (preset) =>
                        preset.label.toLowerCase() === label.toLowerCase(),
                    ) ?? null,
                  )
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Saved categories and labels from recent items available here.
          </p>
        </FieldGroup>
      ) : null}
      <Field>
        <FieldLabel htmlFor="catalog-category-search">
          Find a category
        </FieldLabel>
        <Input
          id="catalog-category-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2" aria-label="Category suggestions">
        {presets
          .filter(
            (preset) =>
              !recentLabels.some(
                (label) => label.toLowerCase() === preset.label.toLowerCase(),
              ),
          )
          .map((preset) => (
            <Button
              appearance="form"
              key={preset.key}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onChange(preset.label)
                setParent(preset)
              }}
            >
              {preset.label}
            </Button>
          ))}
      </div>
      {parent ? (
        <FieldGroup className="gap-2">
          <p className="text-sm font-medium">
            {parent.label} · optional subcategory
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              appearance="form"
              variant="outline"
              onClick={() => onChange(parent.label)}
            >
              Category only
            </Button>
            {parent.subcategories.map((child) => (
              <Button
                key={child.key}
                type="button"
                appearance="form"
                variant="outline"
                onClick={() => onChange(`${parent.label} / ${child.label}`)}
              >
                {child.label}
              </Button>
            ))}
          </div>
        </FieldGroup>
      ) : null}
      {!presets.length ? (
        <p className="text-sm text-muted-foreground">
          No matching suggestion. Enter your own category above.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          appearance="form"
          type="button"
          variant="ghost"
          onClick={() => setAll((current) => !current)}
        >
          {all ? "Suggested for your business" : "All categories"}
        </Button>
        <Button
          appearance="form"
          type="button"
          variant="ghost"
          onClick={() => {
            onChange("")
            setParent(null)
          }}
        >
          Use Uncategorized
        </Button>
      </div>
    </FieldGroup>
  )
}
