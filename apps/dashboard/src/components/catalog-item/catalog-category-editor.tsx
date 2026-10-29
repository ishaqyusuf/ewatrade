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
import { ArrowRight01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"

export function CatalogCategoryEditor({
  category,
  enabled,
  onChange,
}: {
  businessProfileKey?: string | null
  category: string
  enabled: boolean
  kind: "product" | "service"
  onChange: (value: string) => void
  storeId: string
}) {
  const trpc = useTRPC()
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState("")
  const [parentId, setParentId] = useState<string>()
  const [after, setAfter] = useState<string>()
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])
  const searching = Boolean(query.trim())
  const settled = query.trim() === search
  const tree = useQuery(
    trpc.catalog.categories.browse.queryOptions(
      { parentId, after },
      { enabled: enabled && !searching, staleTime: 300_000, retry: false },
    ),
  )
  const matches = useQuery(
    trpc.catalog.searchProductCategories.queryOptions(
      { query: search || " " },
      {
        enabled: enabled && searching && settled,
        staleTime: 300_000,
        retry: false,
      },
    ),
  )
  const request = searching ? matches : tree
  const categories = searching
    ? settled
      ? (matches.data ?? [])
      : []
    : (tree.data?.categories ?? [])
  const loading = request.isFetching || (searching && !settled)
  function browse(key?: string) {
    setParentId(key)
    setAfter(undefined)
    setQuery("")
  }
  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Selected category</FieldLabel>
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 break-words text-sm" aria-live="polite">
            {category || "Uncategorized"}
          </p>
          {category ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange("")}
            >
              Clear category
            </Button>
          ) : null}
        </div>
        <FieldDescription>
          Choose a category below. Your current category stays until you select
          another.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="catalog-category-search">
          Find a category
        </FieldLabel>
        <Input
          id="catalog-category-search"
          placeholder="Search categories"
          maxLength={160}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Field>
      {!searching ? (
        <nav
          aria-label="Category path"
          className="flex flex-wrap items-center gap-1"
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => browse()}
          >
            All categories
          </Button>
          {tree.data?.breadcrumbs.map((ancestor) => (
            <Button
              key={ancestor.categoryKey}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => browse(ancestor.categoryKey)}
            >
              {ancestor.name}
            </Button>
          ))}
        </nav>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setQuery("")}
        >
          Browse category tree
        </Button>
      )}
      {loading ? (
        <output className="text-sm text-muted-foreground">
          Loading categories…
        </output>
      ) : null}
      {request.isError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 text-sm"
        >
          <p>Categories could not load. Your selection is unchanged.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void request.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : null}
      <ul
        aria-label="Available categories"
        aria-busy={loading}
        className="divide-y divide-border"
      >
        {categories.map((entry) => (
          <li key={entry.categoryKey} className="flex items-center gap-2 py-1">
            <Button
              type="button"
              variant="ghost"
              className="h-auto min-h-11 min-w-0 flex-1 justify-start whitespace-normal py-2 text-left"
              aria-label={`Use ${entry.label}`}
              aria-pressed={category === entry.label}
              disabled={loading}
              onClick={() => onChange(entry.label)}
            >
              <span className="min-w-0 flex-1 break-words">
                {searching ? entry.label : entry.name}
              </span>
              {category === entry.label ? (
                <HugeiconsIcon
                  icon={Tick02Icon}
                  className="size-4 shrink-0 text-primary"
                />
              ) : null}
            </Button>
            {entry.hasChildren ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={loading}
                aria-label={`Browse ${entry.name}`}
                onClick={() => browse(entry.categoryKey)}
              >
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {!loading && !request.isError && !categories.length ? (
        <p className="text-sm text-muted-foreground">
          {searching
            ? "No matching category. Try a broader product or service name."
            : "This category has no subcategories."}
        </p>
      ) : null}
      {!searching && tree.data?.nextCursor ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setAfter(tree.data?.nextCursor ?? undefined)}
        >
          More categories
        </Button>
      ) : null}
      {!searching && after ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setAfter(undefined)}
        >
          First page
        </Button>
      ) : null}
      {!searching && tree.data?.breadcrumbs.at(-1) ? (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onChange(tree.data?.breadcrumbs.at(-1)?.label ?? category)
          }
        >
          Use this category
        </Button>
      ) : null}
    </FieldGroup>
  )
}
