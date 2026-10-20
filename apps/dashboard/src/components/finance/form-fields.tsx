"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import {
  Button,
  ControlField,
  FieldGroup,
  FormActions,
  SubmitButton,
} from "@ewatrade/ui"
import type { ReactElement, ReactNode } from "react"
import { useEffect } from "react"
import { useFinanceForm } from "./form-context"

export function FinanceField({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: ReactElement<{
    id?: string
    "aria-invalid"?: boolean
    "aria-describedby"?: string
  }>
}) {
  return (
    <ControlField label={label} error={error}>
      {children}
    </ControlField>
  )
}
/** One row in the "What changes" box: a balance before → after, or a short text. */
export type FinanceChange = {
  label: string
  before?: string
  after: string
  /** Money leaving (out) or arriving (in) a money account; other rows stay neutral. */
  tone?: "in" | "out"
  note?: string
}

export function FinanceChanges({ changes }: { changes: FinanceChange[] }) {
  if (!changes.length) return null
  return (
    <div className="border border-border text-sm">
      <p className="bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
        What changes
      </p>
      {changes.map((change) => (
        <div
          key={change.label}
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-t border-border px-3 py-2"
        >
          <span>{change.label}</span>
          <span className="whitespace-nowrap text-right tabular-nums">
            {change.before ? (
              <span className="text-muted-foreground">{change.before} → </span>
            ) : null}
            <span
              className={
                change.tone === "out"
                  ? "font-semibold text-destructive"
                  : change.tone === "in"
                    ? "font-semibold text-primary"
                    : "font-semibold"
              }
            >
              {change.after}
            </span>
          </span>
          {change.note ? (
            <span className="col-span-2 text-xs text-muted-foreground">
              {change.note}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/** Label/value rows for a review. Empty values are skipped. */
export function FinanceDetails({
  rows,
}: {
  rows: Array<[string, ReactNode] | null | false | undefined>
}) {
  const shown = rows.filter(
    (row): row is [string, ReactNode] =>
      Boolean(row) &&
      row !== null &&
      row !== false &&
      row?.[1] != null &&
      row?.[1] !== "",
  )
  if (!shown.length) return null
  return (
    <dl className="border border-border text-sm">
      {shown.map(([label, value]) => (
        <div
          key={label}
          className="grid grid-cols-[minmax(7rem,40%)_minmax(0,1fr)] gap-3 border-t border-border px-3 py-2 first:border-t-0"
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The check before saving: one plain sentence, the details, what changes, and a
 * button that names the action. The idempotent command keeps a retry safe.
 */
export function FinanceReview({
  children,
  sentence,
  changes = [],
  warning,
  note,
  confirmLabel = "Save",
  command,
  onConfirm,
  onBack,
  confirmDisabled = false,
  backDisabled = false,
}: {
  children?: ReactNode
  sentence?: ReactNode
  changes?: FinanceChange[]
  warning?: ReactNode
  note?: ReactNode
  confirmLabel?: string
  command: {
    pending: boolean
    ready?: boolean
    saved: boolean
    uncertain: boolean
    error: string | null
  }
  onConfirm: () => void
  onBack: () => void
  confirmDisabled?: boolean
  backDisabled?: boolean
}) {
  const { setLocked } = useFinanceForm()
  useEffect(() => {
    setLocked(command.pending)
    return () => setLocked(false)
  }, [command.pending, setLocked])
  return (
    <FieldGroup className="gap-5">
      {sentence ? <p className="text-sm leading-relaxed">{sentence}</p> : null}
      {children}
      <FinanceChanges changes={changes} />
      {warning ? (
        <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {warning}
        </p>
      ) : null}
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      {command.uncertain && !command.pending ? (
        <FormFeedback appearance="dashboard">
          We couldn't confirm this was saved. Try again: it won't be recorded
          twice.
          {command.error ? ` ${command.error}` : ""}
        </FormFeedback>
      ) : command.error ? (
        <FormFeedback appearance="dashboard">
          We couldn't save this. {command.error}
        </FormFeedback>
      ) : null}
      <FormActions className="sticky bottom-0 bg-background py-4">
        <Button
          type="button"
          className="rounded-none"
          variant="outline"
          onClick={onBack}
          disabled={command.pending || command.saved || backDisabled}
        >
          Back
        </Button>
        <SubmitButton
          type="button"
          isSubmitting={command.pending}
          disabled={
            command.pending ||
            (command.saved && !command.uncertain) ||
            command.ready === false ||
            confirmDisabled
          }
          onClick={onConfirm}
        >
          {command.uncertain ? "Try again" : confirmLabel}
        </SubmitButton>
      </FormActions>
    </FieldGroup>
  )
}
