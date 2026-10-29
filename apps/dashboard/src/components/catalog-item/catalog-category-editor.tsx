"use client"

import { useTRPC } from "@/trpc/client"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  InputGroupAddon,
  InputGroupButton,
} from "@ewatrade/ui"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

type CategoryOption = { label: string }

export function CatalogCategoryEditor({
  category,
  enabled,
  onChange,
}: {
  category: string
  enabled: boolean
  onChange: (value: string) => void
}) {
  const trpc = useTRPC()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const term = query?.trim() ?? ""
  useEffect(() => {
    const timer = setTimeout(() => setSearch(term), 250)
    return () => clearTimeout(timer)
  }, [term])
  const settled = term === search
  const matches = useQuery(
    trpc.catalog.searchProductCategories.queryOptions(
      { query: search || " " },
      {
        enabled: enabled && Boolean(term) && settled,
        staleTime: 300_000,
        retry: false,
      },
    ),
  )
  const loading = Boolean(term) && (!settled || matches.isFetching)
  const selected = category ? { label: category } : null
  const items: CategoryOption[] = term
    ? settled
      ? (matches.data ?? [])
      : []
    : selected
      ? [selected]
      : []
  return (
    <Combobox<CategoryOption>
      items={items}
      value={selected}
      inputValue={query ?? category}
      filter={null}
      disabled={!enabled}
      autoHighlight
      itemToStringLabel={(option) => option.label}
      isItemEqualToValue={(a, b) => a.label === b.label}
      onInputValueChange={(value, details) => {
        if (
          details.reason === "input-change" ||
          details.reason === "clear-press"
        )
          setQuery(value)
      }}
      onValueChange={(option) => {
        onChange(option?.label ?? "")
        setQuery(null)
      }}
      onOpenChange={(open) => {
        if (!open) setQuery(null)
      }}
    >
      <ComboboxInput
        ref={inputRef}
        id="catalog-item-category"
        aria-label="Category"
        placeholder="Search categories"
        title={category || undefined}
        maxLength={160}
        onKeyDownCapture={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing)
            event.preventDefault()
        }}
        showTrigger={false}
        className="w-full rounded-none border-border bg-transparent [&>[data-slot=input-group-addon]:empty]:hidden"
      >
        {category || query ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Clear category"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange("")
                setQuery(null)
                inputRef.current?.focus()
              }}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </ComboboxInput>
      <ComboboxContent className="rounded-none border border-border bg-popover shadow-md ring-0 before:hidden **:data-[slot$=-item]:rounded-none">
        <ComboboxEmpty>
          {loading
            ? "Searching categories…"
            : matches.isError && term
              ? "Categories could not load. Search again to retry."
              : term
                ? "No matching categories."
                : "Type to search categories."}
        </ComboboxEmpty>
        <ComboboxList aria-busy={loading}>
          {(option: CategoryOption) => (
            <ComboboxItem
              key={option.label}
              value={option}
              className="whitespace-normal break-words"
            >
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
