"use client"

import { cn } from "@/utils"
import {
  Button,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@ewatrade/ui"
import { type ReactNode, type RefObject, useId, useState } from "react"

export type FilterDraft = Record<string, string[]>
export type MobileFilterGroup = {
  id: string
  label: string
  multiple?: boolean
  options?: ReadonlyArray<{ value: string; label: string }>
  allLabel?: string
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  render?: (
    draft: FilterDraft,
    update: (values: FilterDraft) => void,
  ) => ReactNode
  summary?: (draft: FilterDraft) => string
}
export type MobileFilters = {
  groups: MobileFilterGroup[]
  values: FilterDraft
  defaults?: FilterDraft
  onApply: (draft: FilterDraft) => unknown
}

export function SearchFilterSheet({
  config,
  onApplied,
  triggerRef,
}: {
  config: MobileFilters
  onApplied: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
}) {
  const [draft, setDraft] = useState<FilterDraft>(() =>
    structuredClone(config.values),
  )
  const [expanded, setExpanded] = useState(config.groups[0]?.id ?? "")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const prefix = useId()
  const update = (values: FilterDraft) =>
    setDraft((current) => ({ ...current, ...values }))
  async function apply() {
    setPending(true)
    setError(false)
    try {
      await config.onApply(draft)
      onApplied()
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }
  return (
    <SheetContent
      mobileLayout="bottom"
      finalFocus={triggerRef}
      className="max-h-[86dvh] rounded-t-2xl p-0"
      popupClassName="max-md:max-h-[86dvh]"
    >
      <div
        aria-hidden="true"
        className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-muted-foreground/30"
      />
      <div className="flex shrink-0 items-center justify-between border-b px-5 py-3">
        <div>
          <SheetTitle className="text-base font-semibold">Filters</SheetTitle>
          <SheetDescription className="mt-1 text-xs text-muted-foreground">
            Choose filters, then apply your changes.
          </SheetDescription>
        </div>
        <SheetClose
          aria-label="Close filters"
          className="flex size-11 items-center justify-center rounded-md text-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ×
        </SheetClose>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5">
        {config.groups.map((group) => {
          const selected = draft[group.id] ?? []
          const summary =
            group.summary?.(draft) ??
            (selected.length
              ? selected
                  .map(
                    (value) =>
                      group.options?.find((option) => option.value === value)
                        ?.label ?? value,
                  )
                  .join(", ")
              : (group.allLabel ?? "All"))
          const open = expanded === group.id
          return (
            <section key={group.id} className="border-b last:border-b-0">
              <h3>
                <button
                  type="button"
                  id={`${prefix}-${group.id}-trigger`}
                  aria-expanded={open}
                  aria-controls={`${prefix}-${group.id}`}
                  onClick={() => setExpanded(open ? "" : group.id)}
                  className="flex min-h-16 w-full items-center gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="shrink-0 text-sm font-medium">
                    {group.label}
                  </span>
                  <span className="ml-auto truncate text-xs text-muted-foreground">
                    {summary}
                  </span>
                  <span
                    aria-hidden="true"
                    className="w-4 shrink-0 text-center text-muted-foreground"
                  >
                    {open ? "−" : "+"}
                  </span>
                </button>
              </h3>
              <section
                id={`${prefix}-${group.id}`}
                aria-labelledby={`${prefix}-${group.id}-trigger`}
                hidden={!open}
                className="pb-4"
              >
                {group.render ? (
                  open ? (
                    group.render(draft, update)
                  ) : null
                ) : (
                  <fieldset disabled={pending}>
                    <legend className="sr-only">{group.label}</legend>
                    {group.loading ? (
                      <output className="mb-3 text-sm text-muted-foreground">
                        Loading options…
                      </output>
                    ) : null}
                    {group.error ? (
                      <div role="alert" className="mb-3 text-sm">
                        Could not load options.{" "}
                        <button
                          type="button"
                          className="min-h-11 underline"
                          onClick={group.onRetry}
                        >
                          Retry
                        </button>
                      </div>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: "", label: group.allLabel ?? "All" },
                        ...(group.options ?? []),
                      ].map((option) => {
                        const checked = option.value
                          ? selected.includes(option.value)
                          : selected.length === 0
                        return (
                          <label
                            key={option.value}
                            className={cn(
                              "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs leading-5",
                              checked
                                ? "border-foreground/60 bg-foreground/5"
                                : "border-border",
                            )}
                          >
                            <input
                              type={group.multiple ? "checkbox" : "radio"}
                              name={`${prefix}-${group.id}`}
                              checked={checked}
                              className="size-4 shrink-0 accent-current"
                              onChange={() =>
                                update({
                                  [group.id]: !option.value
                                    ? []
                                    : group.multiple
                                      ? checked
                                        ? selected.filter(
                                            (value) => value !== option.value,
                                          )
                                        : [...selected, option.value]
                                      : [option.value],
                                })
                              }
                            />
                            <span className="min-w-0 break-words">
                              {option.label}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    {!group.loading &&
                    !group.error &&
                    !group.options?.length ? (
                      <p className="mt-3 text-xs text-muted-foreground">
                        No options available.
                      </p>
                    ) : null}
                  </fieldset>
                )}
              </section>
            </section>
          )
        })}
      </div>
      <div className="shrink-0 border-t px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {error ? (
          <p role="alert" className="mb-3 text-sm text-destructive">
            Could not apply filters. Please try again.
          </p>
        ) : null}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 rounded-lg"
            disabled={pending}
            onClick={() => {
              setDraft(structuredClone(config.defaults ?? {}))
              setError(false)
            }}
          >
            Reset
          </Button>
          <Button
            type="button"
            className="h-11 flex-[2] rounded-lg"
            disabled={pending}
            onClick={() => void apply()}
          >
            {pending ? "Applying…" : "Apply filters"}
          </Button>
        </div>
      </div>
    </SheetContent>
  )
}
