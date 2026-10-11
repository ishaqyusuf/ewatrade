"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
  cn,
} from "@ewatrade/ui"
import type { ReactNode } from "react"

/** One change dialog: title, plain description, body and optional footer. */
export function OrderDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  busy = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  busy?: boolean
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <DialogContent className="grid max-w-lg gap-5 p-6 text-foreground max-md:content-start max-md:overflow-y-auto">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-sm text-muted-foreground">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="grid min-w-0 gap-4">{children}</div>
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}

/** Reason chips fill the box; the text stays editable. */
export function ReasonField({
  value,
  onChange,
  chips,
  label = "Reason",
  required = true,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  chips: string[]
  label?: string
  required?: boolean
  disabled?: boolean
}) {
  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">
        {label}
        {required ? null : (
          <span className="font-normal text-muted-foreground"> (optional)</span>
        )}
      </legend>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            aria-pressed={value === chip}
            className={cn(
              "rounded-full border border-border px-3 py-1 text-xs transition-colors hover:bg-muted",
              value === chip &&
                "border-primary bg-primary/10 text-foreground hover:bg-primary/15",
            )}
            onClick={() => onChange(value === chip ? "" : chip)}
          >
            {chip}
          </button>
        ))}
      </div>
      <Textarea
        aria-label={label}
        maxLength={500}
        placeholder="Or write your own reason"
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </fieldset>
  )
}

/** What the review says will happen, and anything that blocks it. */
export function ReviewEffects({
  loading,
  error,
  effects,
  blockers,
  onRetry,
}: {
  loading: boolean
  error: string | null
  effects: string[]
  blockers: string[]
  onRetry: () => void
}) {
  if (loading)
    return (
      <output className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
        Checking what this changes…
      </output>
    )
  if (error)
    return (
      <div role="alert" className="grid gap-2">
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={onRetry}
        >
          Check again
        </Button>
      </div>
    )
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        What changes
      </p>
      <ul className="grid gap-1 text-sm">
        {effects.map((effect) => (
          <li key={effect} className="break-words">
            {effect}
          </li>
        ))}
      </ul>
      {blockers.length ? (
        <ul className="grid gap-1 text-sm text-red-700 dark:text-red-300">
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function MutationError({ message }: { message: string | null }) {
  return message ? (
    <FormFeedback appearance="dashboard">{message}</FormFeedback>
  ) : null
}

/** Labelled form row with the control below its label. */
export function DialogField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
