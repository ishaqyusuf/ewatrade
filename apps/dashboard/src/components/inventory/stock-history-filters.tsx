"use client"
import type { FilterChip } from "@/components/filter-list"
import { SearchFilter } from "@/components/search-filter"
import { useInventoryLedgerParams } from "@/hooks/use-inventory-ledger-params"
import {
  MAX_STOCK_HISTORY_CATEGORIES,
  type StockHistoryCategoryFilter,
  useStockHistoryCategoryParams,
} from "@/hooks/use-stock-history-filter-params"
import { stockChangeGroups } from "@/lib/inventory-labels"
import { useTRPC } from "@/trpc/client"
import {
  Button,
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Input,
} from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"

/** Names of the chosen category IDs; the URL only carries IDs. */
export function useStockCategoryNames(ids: number[]) {
  const trpc = useTRPC()
  const names = useQuery(
    trpc.inventory.categorySuggestions.queryOptions(
      { ids, limit: MAX_STOCK_HISTORY_CATEGORIES },
      { enabled: ids.length > 0 },
    ),
  )
  const byId = new Map((names.data ?? []).map((row) => [row.id, row.name]))
  return (id: number) => byId.get(id) ?? "Category"
}

function useCategoryChoices(query: string) {
  const trpc = useTRPC()
  return useQuery(
    trpc.inventory.categorySuggestions.queryOptions({
      query: query.trim().slice(0, 80) || undefined,
      limit: 50,
    }),
  )
}

const MENU_KEYS = new Set(["Escape", "ArrowDown", "ArrowUp"])

function toggle(filter: StockHistoryCategoryFilter, id: number) {
  return filter.categoryNameIds.includes(id)
    ? filter.categoryNameIds.filter((value) => value !== id)
    : [...filter.categoryNameIds, id]
}

/** Uncategorized, then saved names a change must all have (match all). */
function CategoryChoices({
  value,
  onChange,
  menu,
}: {
  value: StockHistoryCategoryFilter
  onChange: (value: StockHistoryCategoryFilter) => void
  /** Menu items in the desktop dropdown; plain checkboxes in the phone sheet. */
  menu: boolean
}) {
  const [query, setQuery] = useState("")
  const choices = useCategoryChoices(query)
  const full = value.categoryNameIds.length >= MAX_STOCK_HISTORY_CATEGORIES
  const rows: {
    key: string
    label: ReactNode
    checked: boolean
    disabled?: boolean
    onCheck: () => void
  }[] = [
    {
      key: "uncategorized",
      label: (
        <span className="flex flex-1 items-center justify-between gap-3">
          Uncategorized
          <span className="text-xs text-muted-foreground">No categories</span>
        </span>
      ),
      checked: value.uncategorized,
      onCheck: () =>
        onChange({ categoryNameIds: [], uncategorized: !value.uncategorized }),
    },
    ...(choices.data ?? []).map((choice) => {
      const checked = value.categoryNameIds.includes(choice.id)
      return {
        key: String(choice.id),
        label: choice.name,
        checked,
        disabled: full && !checked,
        onCheck: () =>
          onChange({
            categoryNameIds: toggle(value, choice.id),
            uncategorized: false,
          }),
      }
    }),
  ]
  const [uncategorized, ...names] = rows
  const status = choices.isPending ? (
    <output className="block px-2 py-2 text-sm text-muted-foreground">
      Loading categories…
    </output>
  ) : choices.isError ? (
    <div role="alert" className="px-2 py-2 text-sm">
      Could not load categories.{" "}
      <button
        type="button"
        className="underline"
        onClick={() => void choices.refetch()}
      >
        Retry
      </button>
    </div>
  ) : !names.length ? (
    <p className="px-2 py-2 text-sm text-muted-foreground">
      {query.trim()
        ? `No categories match “${query.trim()}”`
        : "No saved categories yet."}
    </p>
  ) : null
  const footer = (
    <p className="px-2 py-2 text-xs text-muted-foreground">
      {value.categoryNameIds.length
        ? `${value.categoryNameIds.length} of ${MAX_STOCK_HISTORY_CATEGORIES} picked`
        : `Pick up to ${MAX_STOCK_HISTORY_CATEGORIES}`}
    </p>
  )
  const search = (
    <Input
      type="search"
      value={query}
      maxLength={80}
      placeholder="Search categories"
      aria-label="Search categories"
      className="h-9 rounded-none"
      // Typing stays in the field instead of moving the menu's highlight;
      // the arrows go on to the menu so the keyboard reaches the results.
      onKeyDown={(event) => {
        if (!MENU_KEYS.has(event.key)) event.stopPropagation()
      }}
      onChange={(event) => setQuery(event.target.value)}
    />
  )
  if (menu)
    return (
      <>
        <div className="p-1">{search}</div>
        {uncategorized ? (
          <DropdownMenuCheckboxItem
            checked={uncategorized.checked}
            closeOnClick={false}
            onCheckedChange={uncategorized.onCheck}
          >
            {uncategorized.label}
          </DropdownMenuCheckboxItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Has all of these</DropdownMenuLabel>
          <div className="max-h-64 overflow-y-auto">
            {names.map((row) => (
              <DropdownMenuCheckboxItem
                key={row.key}
                checked={row.checked}
                disabled={row.disabled}
                closeOnClick={false}
                onCheckedChange={row.onCheck}
              >
                {row.label}
              </DropdownMenuCheckboxItem>
            ))}
          </div>
          {status}
        </DropdownMenuGroup>
        {footer}
      </>
    )
  return (
    <fieldset className="grid gap-2">
      <legend className="sr-only">Categories</legend>
      {search}
      {rows.map((row, index) => (
        <label
          key={row.key}
          className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-xs leading-5 ${row.checked ? "border-foreground/60 bg-foreground/5" : "border-border"} ${row.disabled ? "opacity-50" : "cursor-pointer"} ${index === 1 ? "mt-2" : ""}`}
        >
          <input
            type="checkbox"
            checked={row.checked}
            disabled={row.disabled}
            className="size-4 shrink-0 accent-current"
            onChange={row.onCheck}
          />
          <span className="flex min-w-0 flex-1 break-words">{row.label}</span>
        </label>
      ))}
      {status}
      {footer}
    </fieldset>
  )
}

/** Search, categories (filter menu, chips, phone sheet) and change groups. */
export function StockHistoryFilters() {
  const { params, setParams } = useInventoryLedgerParams()
  const categories = useStockHistoryCategoryParams()
  const { filter } = categories
  const nameOf = useStockCategoryNames(filter.categoryNameIds)
  const chips: FilterChip[] = filter.uncategorized
    ? [
        {
          id: "uncategorized",
          label: "Uncategorized",
          onRemove: () => void categories.clear(),
        },
      ]
    : filter.categoryNameIds.map((id) => ({
        id: `category-${id}`,
        label: nameOf(id),
        onRemove: () =>
          void categories.setCategories(
            filter.categoryNameIds.filter((value) => value !== id),
          ),
      }))
  const apply = (next: StockHistoryCategoryFilter) =>
    next.uncategorized
      ? categories.setUncategorized(true)
      : categories.setCategories(next.categoryNameIds)
  const summary = (value: StockHistoryCategoryFilter) =>
    value.uncategorized
      ? "Uncategorized"
      : value.categoryNameIds.length
        ? value.categoryNameIds.map(nameOf).join(", ")
        : "Any"
  const fromDraft = (draft: Record<string, string[]>) => ({
    categoryNameIds: (draft.categories ?? []).map(Number),
    uncategorized: draft.uncategorized?.[0] === "true",
  })
  const group = params.filter ?? "all"
  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <SearchFilter
        placeholder="Search reason, note or store"
        value={params.q ?? ""}
        maxLength={120}
        onSearch={(q) => void setParams({ q: q.trim() || null })}
        onClear={() => {
          void setParams({ q: null, filter: null })
          void categories.clear()
        }}
        filters={chips}
        mobileFilters={{
          groups: [
            {
              id: "categories",
              label: "Categories",
              // Picks in the draft may not have loaded names yet.
              summary: (draft) => {
                const next = fromDraft(draft)
                const count = next.categoryNameIds.length
                return next.uncategorized
                  ? "Uncategorized"
                  : count
                    ? count === 1
                      ? "1 category"
                      : `All of ${count} categories`
                    : "Any"
              },
              render: (draft, update) => (
                <CategoryChoices
                  menu={false}
                  value={fromDraft(draft)}
                  onChange={(next) =>
                    update({
                      categories: next.categoryNameIds.map(String),
                      uncategorized: next.uncategorized ? ["true"] : [],
                    })
                  }
                />
              ),
            },
          ],
          values: {
            categories: filter.categoryNameIds.map(String),
            uncategorized: filter.uncategorized ? ["true"] : [],
          },
          defaults: { categories: [], uncategorized: [] },
          onApply: (draft) => apply(fromDraft(draft)),
        }}
      >
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span className="flex-1">Categories</span>
              <span className="max-w-32 truncate text-xs text-muted-foreground">
                {summary(filter)}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent
              appearance="dashboard"
              className="w-72 max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"
              sideOffset={14}
              alignOffset={-4}
            >
              <CategoryChoices menu value={filter} onChange={apply} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
      </SearchFilter>
      <div className="flex flex-wrap gap-1" aria-label="Kind of change">
        {stockChangeGroups.map((row) => (
          <Button
            key={row.id}
            variant={group === row.id ? "secondary" : "ghost"}
            size="sm"
            className="rounded-none"
            aria-pressed={group === row.id}
            onClick={() =>
              void setParams({ filter: row.id === "all" ? null : row.id })
            }
          >
            {row.label}
          </Button>
        ))}
        {(params.q || params.filter) && !chips.length ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void setParams({ q: null, filter: null })}
          >
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  )
}
