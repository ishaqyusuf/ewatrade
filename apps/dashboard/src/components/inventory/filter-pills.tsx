"use client"

import { cn } from "@/utils"

/**
 * One row of filter pills. Phones scroll it sideways instead of wrapping it
 * into a block of buttons; each pill is a 44px touch target.
 */
export function FilterPills<Id extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: ReadonlyArray<{ id: Id; label: string }>
  value: Id
  onChange: (id: Id) => void
}) {
  return (
    <fieldset className="-mx-4 my-0 flex min-w-0 gap-2 overflow-x-auto border-0 px-4 py-0 scrollbar-hide md:mx-0 md:flex-wrap md:px-0">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={cn(
              "h-11 shrink-0 rounded-full border px-4 text-sm transition-colors",
              active
                ? "border-foreground bg-foreground font-medium text-background"
                : "border-border bg-card text-foreground hover:bg-[var(--hover)]",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </fieldset>
  )
}
