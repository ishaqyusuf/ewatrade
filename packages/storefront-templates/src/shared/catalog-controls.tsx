"use client"

import { Button } from "@ewatrade/ui/button"
import { cn } from "@ewatrade/ui/cn"
import { Field, FieldDescription, FieldLabel } from "@ewatrade/ui/field"
import { Input } from "@ewatrade/ui/input"
import { Select } from "@ewatrade/ui/select"
import Form from "next/form"
import Link from "next/link"
import { useEffect, useId, useRef } from "react"
import {
  type CatalogListingQuery,
  LISTING_AVAILABILITY,
  LISTING_PRICE_SORT_NOTE,
  LISTING_SEARCH_MAX,
  LISTING_SORTS,
  catalogListingCustomized,
  catalogListingPathHref,
  catalogListingPriceSorted,
  catalogListingQuery,
  pruneListingFormData,
} from "./catalog-listing"

/**
 * Standard listing controls for every catalog surface: one GET form, so search,
 * availability and sort work before hydration and soft-navigate after it.
 * The server applies them to the whole catalog; a new query always starts at page one.
 * `action` is the listing page the form and Clear filters stay on (Home by default).
 */
export function CatalogListingControls({
  category,
  subcategory,
  query,
  label = "Search items",
  stacked = false,
  className,
  action = "/",
}: {
  category?: string | null
  /** Kept with its root category, so a search stays inside the chosen subcategory. */
  subcategory?: string | null
  query?: CatalogListingQuery | null
  label?: string
  stacked?: boolean
  className?: string
  action?: string
}) {
  const current = catalogListingQuery(query)
  // Remount on every server state so uncontrolled fields show the loaded query after Back or Clear.
  return (
    <ListingForm
      key={`${category ?? ""}|${subcategory ?? ""}|${current.q ?? ""}|${current.availability ?? ""}|${current.sort ?? ""}`}
      category={category ?? null}
      subcategory={category ? (subcategory ?? null) : null}
      query={current}
      label={label}
      stacked={stacked}
      className={className}
      action={action}
    />
  )
}

function ListingForm({
  category,
  subcategory,
  query,
  label,
  stacked,
  className,
  action,
}: {
  category: string | null
  subcategory: string | null
  query: CatalogListingQuery
  label: string
  stacked: boolean
  className?: string
  action: string
}) {
  const id = useId()
  const priceSorted = catalogListingPriceSorted(query)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    const element = form.current
    if (!element) return
    const prune = (event: FormDataEvent) => pruneListingFormData(event.formData)
    element.addEventListener("formdata", prune)
    return () => element.removeEventListener("formdata", prune)
  }, [])
  return (
    <Form
      ref={form}
      action={action}
      scroll={false}
      prefetch={false}
      // biome-ignore lint/a11y/useSemanticElements: a GET form with the search landmark role is the standard search pattern.
      role="search"
      aria-label={label}
      className={cn(
        "sf-listing-controls my-4 flex gap-3",
        stacked ? "flex-col" : "flex-wrap items-end",
        className,
      )}
    >
      {category ? (
        <input type="hidden" name="category" value={category} />
      ) : null}
      {subcategory ? (
        <input type="hidden" name="subcategory" value={subcategory} />
      ) : null}
      <Field className={cn("gap-1.5", stacked ? undefined : "min-w-48 flex-1")}>
        <FieldLabel htmlFor={`${id}-q`}>Search</FieldLabel>
        <Input
          id={`${id}-q`}
          type="search"
          name="q"
          defaultValue={query.q ?? ""}
          maxLength={LISTING_SEARCH_MAX}
          placeholder={label}
          autoComplete="off"
          enterKeyHint="search"
        />
      </Field>
      <Field className={cn("gap-1.5", stacked ? undefined : "w-auto")}>
        <FieldLabel htmlFor={`${id}-availability`}>Availability</FieldLabel>
        <Select
          id={`${id}-availability`}
          name="availability"
          defaultValue={query.availability ?? ""}
          className="h-9"
        >
          <option value="">All items</option>
          {LISTING_AVAILABILITY.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field className={cn("gap-1.5", stacked ? undefined : "w-auto")}>
        <FieldLabel htmlFor={`${id}-sort`}>Sort</FieldLabel>
        <Select
          id={`${id}-sort`}
          name="sort"
          defaultValue={query.sort ?? ""}
          className="h-9"
          aria-describedby={priceSorted ? `${id}-sort-note` : undefined}
        >
          <option value="">Default order</option>
          {LISTING_SORTS.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </Select>
        {priceSorted ? (
          <FieldDescription id={`${id}-sort-note`}>
            {LISTING_PRICE_SORT_NOTE}
          </FieldDescription>
        ) : null}
      </Field>
      <div className="flex gap-2">
        <Button type="submit">Apply</Button>
        {category || catalogListingCustomized(query) ? (
          <Button
            variant="ghost"
            nativeButton={false}
            render={
              // Resets every listing control: category, subcategory, search, availability, sort, cursor and item.
              <Link
                prefetch={false}
                scroll={false}
                href={catalogListingPathHref(action)}
              />
            }
          >
            Clear filters
          </Button>
        ) : null}
      </div>
    </Form>
  )
}
