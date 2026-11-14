"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { OrderDialog } from "@/components/orders/overview/order-dialog-frame"
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
  description,
  error,
  children,
}: {
  label: string
  description?: string
  error?: string
  children: ReactElement<{
    id?: string
    "aria-invalid"?: boolean
    "aria-describedby"?: string
  }>
}) {
  return (
    <ControlField label={label} description={description} error={error}>
      {children}
    </ControlField>
  )
}
/**
 * Top of a change made inside a record's own sheet: "← Back to …", then the
 * action's name and what it does.
 */
export function FinanceBackTo({
  label,
  onBack,
  title,
  description,
}: {
  label: string
  onBack: () => void
  title: string
  description?: string
}) {
  return (
    <div className="grid gap-1 border-b border-border pb-3">
      <button
        type="button"
        onClick={onBack}
        className="-ml-0.5 justify-self-start text-sm text-muted-foreground hover:text-foreground"
      >
        ← {label}
      </button>
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}

/** Cancel and the primary action, kept in view at the bottom of the sheet. */
export function FinanceFormFooter({
  onCancel,
  submitLabel,
  isSubmitting = false,
  disabled = false,
}: {
  onCancel?: () => void
  submitLabel: string
  isSubmitting?: boolean
  disabled?: boolean
}) {
  return (
    <FormActions className="sticky -bottom-6 z-10 -mx-6 border-t border-border bg-background px-6 py-4">
      {onCancel ? (
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      ) : null}
      <SubmitButton
        type="submit"
        isSubmitting={isSubmitting}
        disabled={disabled}
      >
        {submitLabel}
      </SubmitButton>
    </FormActions>
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
      <p className="bg-muted/50 px-3 py-2 text-sm font-medium text-muted-foreground">
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
            <span className="col-span-2 text-sm text-muted-foreground">
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
  alert,
}: {
  /**
   * Money confirms (moving, paying, undoing): show the check as an alert
   * dialog over the form; its title names the amount and who.
   */
  alert?: { title: string }
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
  const feedback =
    command.uncertain && !command.pending ? (
      <FormFeedback appearance="dashboard">
        We couldn't confirm this was saved. Try again: it won't be recorded
        twice.
        {command.error ? ` ${command.error}` : ""}
      </FormFeedback>
    ) : command.error ? (
      <FormFeedback appearance="dashboard">
        We couldn't save this. {command.error}
      </FormFeedback>
    ) : null
  const back = (
    <Button
      type="button"
      variant="outline"
      onClick={onBack}
      disabled={command.pending || command.saved || backDisabled}
    >
      Back
    </Button>
  )
  const confirm = (
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
  )
  if (alert)
    return (
      <OrderDialog
        alert
        open
        busy={command.pending || command.saved}
        onOpenChange={(open) => {
          if (!open) onBack()
        }}
        title={alert.title}
        footer={
          <>
            {back}
            {confirm}
          </>
        }
      >
        {sentence ? (
          <p className="text-sm leading-relaxed">{sentence}</p>
        ) : null}
        {children}
        <FinanceChanges changes={changes} />
        {warning ? (
          <p className="rounded-[var(--ui-radius-item)] bg-[var(--warning)] px-3 py-2 text-sm text-[color:var(--warning-foreground)]">
            {warning}
          </p>
        ) : null}
        {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
        {feedback}
      </OrderDialog>
    )
  return (
    <FieldGroup className="gap-5">
      {children}
      <FinanceChanges changes={changes} />
      {warning ? (
        <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {warning}
        </p>
      ) : null}
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      {feedback}
      <FormActions className="sticky -bottom-6 z-10 -mx-6 border-t border-border bg-background px-6 py-4">
        {back}
        {confirm}
      </FormActions>
    </FieldGroup>
  )
}
