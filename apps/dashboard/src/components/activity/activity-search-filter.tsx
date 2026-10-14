"use client"

import type { FilterChip } from "@/components/filter-list"
import { SearchFilter } from "@/components/search-filter"
import {
  ACTIVITY_RANGES,
  ACTIVITY_RANGE_LABELS,
  type ActivityFilters,
  type ActivityRange,
  UNKNOWN_ACTIVITY_PERSON,
  activityDateWindow,
} from "@/hooks/use-activity-filter-params"
import type {
  BusinessActivityCategory,
  BusinessActivityFilterOptions,
} from "@ewatrade/notifications/business-events"
import {
  DateControl,
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  cn,
} from "@ewatrade/ui"
import { useId } from "react"
import { ACTIVITY_CATEGORY_LABELS, formatRole } from "./activity-format"

const subContentClass =
  "min-w-48 max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"

export function ActivitySearchFilter({
  filter,
  setFilter,
  options,
  optionsError,
  onRetryOptions,
  now,
  personNames,
  onSearchPeople,
}: {
  filter: ActivityFilters
  setFilter: (values: Partial<ActivityFilters> | null) => unknown
  options: BusinessActivityFilterOptions | undefined
  optionsError: boolean
  onRetryOptions: () => void
  now: Date
  /** Names of people picked through search, beyond the first choices page. */
  personNames: ReadonlyMap<string, string>
  onSearchPeople: () => void
}) {
  const fromId = useId()
  const toId = useId()
  const categories = [
    ...new Set((options?.types ?? []).map((type) => type.category)),
  ]
  const actors = options?.actors ?? []
  const stores = options?.stores ?? []
  const actorName = (id: string) =>
    id === UNKNOWN_ACTIVITY_PERSON
      ? "Unknown person"
      : (actors.find((actor) => actor.membershipId === id)?.name ??
        personNames.get(id) ??
        "Selected person")
  const typeChoices = (options?.types ?? []).filter(
    (type) => type.availability !== "planned",
  )
  const typeLabel = (type: string) =>
    typeChoices.find((choice) => choice.type === type)?.label ?? type
  const storeName = (id: string) =>
    stores.find((store) => store.id === id)?.name ?? "Selected Store"

  const pickRange = (range: ActivityRange) => {
    if (range !== "custom") return setFilter({ range })
    const current = activityDateWindow(filter, options?.timeZone ?? "UTC", now)
    return setFilter({
      range,
      from: current.firstDay,
      to: current.lastDay,
    })
  }

  const chips: FilterChip[] = [
    ...filter.categories.map((category) => ({
      id: `category-${category}`,
      label: ACTIVITY_CATEGORY_LABELS[category],
      onRemove: () =>
        void setFilter({
          categories: filter.categories.filter((value) => value !== category),
        }),
    })),
    ...filter.types.map((type) => ({
      id: `type-${type}`,
      label: typeLabel(type),
      onRemove: () =>
        void setFilter({
          types: filter.types.filter((value) => value !== type),
        }),
    })),
    ...(filter.person
      ? [
          {
            id: "person",
            label: actorName(filter.person),
            onRemove: () => void setFilter({ person: null }),
          },
        ]
      : []),
    ...filter.storeIds.map((id) => ({
      id: `store-${id}`,
      label: storeName(id),
      onRemove: () =>
        void setFilter({
          storeIds: filter.storeIds.filter((value) => value !== id),
        }),
    })),
    ...(filter.range !== "last7"
      ? [
          {
            id: "range",
            label:
              filter.range === "custom"
                ? `${filter.from} – ${filter.to}`
                : ACTIVITY_RANGE_LABELS[filter.range],
            onRemove: () => void setFilter({ range: "last7" }),
          },
        ]
      : []),
  ]

  const optionsState = {
    loading: !options && !optionsError,
    error: optionsError,
    onRetry: onRetryOptions,
  }

  return (
    <div className="grid gap-3">
      <SearchFilter
        placeholder="Search activity..."
        value={filter.query ?? ""}
        onSearch={(query) => void setFilter({ query: query || null })}
        onClear={() => void setFilter(null)}
        filters={chips}
        mobileFilters={{
          groups: [
            {
              id: "range",
              label: "Date",
              // Presets only: Activity has no "all time" window (≤92 days).
              summary: (draft) =>
                ACTIVITY_RANGE_LABELS[
                  ACTIVITY_RANGES.find((value) => value === draft.range?.[0]) ??
                    filter.range
                ],
              render: (draft, update) => (
                <div className="grid grid-cols-2 gap-2">
                  {ACTIVITY_RANGES.filter((range) => range !== "custom").map(
                    (range) => {
                      const checked =
                        (draft.range?.[0] ??
                          (filter.range === "custom" ? "" : filter.range)) ===
                        range
                      return (
                        <label
                          key={range}
                          className={cn(
                            "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs leading-5",
                            checked
                              ? "border-foreground/60 bg-foreground/5"
                              : "border-border",
                          )}
                        >
                          <input
                            type="radio"
                            name="activity-range"
                            checked={checked}
                            className="size-4 shrink-0 accent-current"
                            onChange={() => update({ range: [range] })}
                          />
                          {ACTIVITY_RANGE_LABELS[range]}
                        </label>
                      )
                    },
                  )}
                </div>
              ),
            },
            {
              id: "categories",
              label: "Type",
              multiple: true,
              allLabel: "All types",
              options: categories.map((value) => ({
                value,
                label: ACTIVITY_CATEGORY_LABELS[value],
              })),
              ...optionsState,
            },
            {
              id: "types",
              label: "Event",
              multiple: true,
              allLabel: "All events",
              options: typeChoices.map((choice) => ({
                value: choice.type,
                label: choice.label,
              })),
              ...optionsState,
            },
            {
              id: "person",
              label: "Person",
              allLabel: "Anyone",
              options: [
                ...actors.map((actor) => ({
                  value: actor.membershipId,
                  label: actor.isFormer ? `${actor.name} (former)` : actor.name,
                })),
                { value: UNKNOWN_ACTIVITY_PERSON, label: "Unknown person" },
              ],
              ...optionsState,
            },
            ...(stores.length > 1 || filter.storeIds.length
              ? [
                  {
                    id: "stores",
                    label: "Store",
                    multiple: true,
                    allLabel: "All Stores",
                    options: stores.map((store) => ({
                      value: store.id,
                      label: store.name,
                    })),
                    ...optionsState,
                  },
                ]
              : []),
          ],
          values: {
            range: filter.range === "custom" ? [] : [filter.range],
            categories: filter.categories,
            types: filter.types,
            person: filter.person ? [filter.person] : [],
            stores: filter.storeIds,
          },
          defaults: { range: ["last7"] },
          onApply: (draft) =>
            setFilter({
              range:
                ACTIVITY_RANGES.find((value) => value === draft.range?.[0]) ??
                (filter.range === "custom" ? "custom" : "last7"),
              from: filter.from,
              to: filter.to,
              categories: (draft.categories ?? []).filter(
                (value): value is BusinessActivityCategory =>
                  value in ACTIVITY_CATEGORY_LABELS,
              ),
              types: typeChoices
                .map((choice) => choice.type)
                .filter((type) => draft.types?.includes(type)),
              person: draft.person?.[0] ?? null,
              storeIds: draft.stores ?? [],
            }),
        }}
      >
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Type</DropdownMenuSubTrigger>
            <DropdownMenuSubContent
              appearance="dashboard"
              className={subContentClass}
              sideOffset={14}
              alignOffset={-4}
            >
              {categories.length ? (
                categories.map((category) => (
                  <DropdownMenuGroup key={category}>
                    <DropdownMenuCheckboxItem
                      checked={filter.categories.includes(category)}
                      closeOnClick={false}
                      onCheckedChange={(checked) =>
                        void setFilter({
                          categories: checked
                            ? [...filter.categories, category]
                            : filter.categories.filter(
                                (value) => value !== category,
                              ),
                        })
                      }
                    >
                      All {ACTIVITY_CATEGORY_LABELS[category].toLowerCase()}
                    </DropdownMenuCheckboxItem>
                    {typeChoices
                      .filter((choice) => choice.category === category)
                      .map((choice) => (
                        <DropdownMenuCheckboxItem
                          key={choice.type}
                          className="pl-7 text-muted-foreground data-checked:text-foreground"
                          checked={filter.types.includes(choice.type)}
                          closeOnClick={false}
                          onCheckedChange={(checked) =>
                            void setFilter({
                              types: checked
                                ? [...filter.types, choice.type]
                                : filter.types.filter(
                                    (value) => value !== choice.type,
                                  ),
                            })
                          }
                        >
                          {choice.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                  </DropdownMenuGroup>
                ))
              ) : (
                <OptionsNote error={optionsError} />
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Person</DropdownMenuSubTrigger>
            <DropdownMenuSubContent
              appearance="dashboard"
              className={subContentClass}
              sideOffset={14}
              alignOffset={-4}
            >
              <DropdownMenuRadioGroup
                aria-label="Person"
                value={filter.person ?? ""}
                onValueChange={(value) =>
                  void setFilter({ person: value || null })
                }
              >
                <DropdownMenuRadioItem value="" closeOnClick>
                  Anyone
                </DropdownMenuRadioItem>
                {actors.map((actor) => (
                  <DropdownMenuRadioItem
                    key={actor.membershipId}
                    value={actor.membershipId}
                    closeOnClick
                  >
                    <span className="flex-1">{actor.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {actor.isFormer ? "Former" : formatRole(actor.role)}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
                <DropdownMenuRadioItem
                  value={UNKNOWN_ACTIVITY_PERSON}
                  closeOnClick
                >
                  <span className="flex-1">Unknown person</span>
                  <span className="text-xs text-muted-foreground">
                    Not captured
                  </span>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              {!options ? <OptionsNote error={optionsError} /> : null}
              <DropdownMenuItem closeOnClick onClick={onSearchPeople}>
                Search people…
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {stores.length > 1 || filter.storeIds.length ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Store</DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                appearance="dashboard"
                className={subContentClass}
                sideOffset={14}
                alignOffset={-4}
              >
                {stores.map((store) => (
                  <DropdownMenuCheckboxItem
                    key={store.id}
                    checked={filter.storeIds.includes(store.id)}
                    closeOnClick={false}
                    onCheckedChange={(checked) =>
                      void setFilter({
                        storeIds: checked
                          ? [...filter.storeIds, store.id]
                          : filter.storeIds.filter((id) => id !== store.id),
                      })
                    }
                  >
                    {store.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Date</DropdownMenuSubTrigger>
            <DropdownMenuSubContent
              appearance="dashboard"
              className={subContentClass}
              sideOffset={14}
              alignOffset={-4}
            >
              <DropdownMenuRadioGroup
                aria-label="Date"
                value={filter.range}
                onValueChange={(value) => {
                  const range = ACTIVITY_RANGES.find((r) => r === value)
                  if (range) void pickRange(range)
                }}
              >
                {ACTIVITY_RANGES.map((range) => (
                  <DropdownMenuRadioItem key={range} value={range} closeOnClick>
                    {ACTIVITY_RANGE_LABELS[range]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
      </SearchFilter>
      {filter.range === "custom" ? (
        <fieldset className="flex flex-wrap items-end gap-3">
          <legend className="sr-only">Custom dates</legend>
          <div className="grid gap-1">
            <label htmlFor={fromId} className="text-xs text-muted-foreground">
              From
            </label>
            <DateControl
              id={fromId}
              value={filter.from ?? ""}
              onValueChange={(from) =>
                void setFilter({ range: "custom", from, to: filter.to })
              }
            />
          </div>
          <div className="grid gap-1">
            <label htmlFor={toId} className="text-xs text-muted-foreground">
              To
            </label>
            <DateControl
              id={toId}
              value={filter.to ?? ""}
              onValueChange={(to) =>
                void setFilter({ range: "custom", from: filter.from, to })
              }
            />
          </div>
          <p className="pb-2 text-xs text-muted-foreground">
            Up to 92 days, in {options?.timeZone ?? "the Business time zone"}.
          </p>
        </fieldset>
      ) : null}
    </div>
  )
}

function OptionsNote({ error }: { error: boolean }) {
  return (
    <p className="px-2 py-2 text-xs text-muted-foreground">
      {error ? "Choices couldn't load." : "Loading choices…"}
    </p>
  )
}
