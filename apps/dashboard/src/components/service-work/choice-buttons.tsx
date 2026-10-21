"use client"

import { Button, cn } from "@ewatrade/ui"

/** A short single choice shown as a row of buttons (e.g. WhatsApp / SMS / Don't send). */
export function ChoiceButtons<T extends string>({
  label,
  onChange,
  options,
  value,
  disabled,
}: {
  label: string
  onChange: (value: T) => void
  options: Array<{ label: string; value: T }>
  value: T
  disabled?: boolean
}) {
  return (
    <fieldset
      aria-label={label}
      className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0"
    >
      {options.map((option) => {
        const checked = option.value === value
        return (
          <Button
            key={option.value}
            type="button"
            aria-pressed={checked}
            variant="outline"
            size="sm"
            disabled={disabled}
            className={cn(
              checked && "border-primary bg-primary/5 text-primary",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        )
      })}
    </fieldset>
  )
}

/** Small uppercase heading for a group of fields inside a service sheet. */
export function SheetSection({
  children,
  title,
  optional,
  className,
}: {
  children: React.ReactNode
  title: string
  optional?: boolean
  className?: string
}) {
  return (
    <section
      className={cn(
        "grid gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0",
        className,
      )}
    >
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
        {optional ? (
          <span className="ml-1.5 font-normal tracking-normal normal-case">
            Optional
          </span>
        ) : null}
      </h3>
      {children}
    </section>
  )
}
