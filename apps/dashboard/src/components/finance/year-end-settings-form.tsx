"use client"
import { readFinanceCloseScope } from "@/actions/read-finance-close-scope"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  Button,
  FieldGroup,
  FormActions,
  Input,
  SelectControl,
  SubmitButton,
} from "@ewatrade/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { FinanceDetails, FinanceField } from "./form-fields"
import { formatFinanceDate } from "./format-date"
import type { FinanceBook } from "./types"
import {
  FINANCE_MONTH_NAMES,
  financeFirstFiscalYear,
  financeFiscalMonths,
  financeFiscalStartForYearEnd,
  financeYearEndFromStart,
  financeYearEndLabel,
} from "./year-end-state"

type FiscalCalendar = RouterOutputs["finance"]["fiscalCalendar"]

const monthOptions = FINANCE_MONTH_NAMES.map((name, index) => ({
  value: index + 1,
  label: name,
}))

/** Choose the month the business year ends, check the dates, then save. */
export function FinanceYearEndSettingsForm({
  book,
  fiscal,
  onCancel,
  onSaved,
}: {
  book: FinanceBook
  fiscal: FiscalCalendar
  onCancel: () => void
  onSaved: () => void
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const mutation = useMutation(
    trpc.finance.configureFiscalCalendar.mutationOptions(),
  )
  const saved = fiscal.calendar
  const savedEnd = saved
    ? financeYearEndFromStart(saved.startMonth, saved.startDay)
    : null
  const [endMonth, setEndMonth] = useState(savedEnd?.month ?? 12)
  const [reason, setReason] = useState("")
  const [reviewing, setReviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // One id per reviewed save, so a retry after a dropped reply isn't applied twice.
  const commandId = useRef<string | null>(null)

  const { startMonth, startDay } = financeFiscalStartForYearEnd(endMonth)
  const firstYear = financeFirstFiscalYear({
    startMonth,
    startDay,
    bookStartsAt: book.startsAt,
    now: new Date(),
  })
  const months = financeFiscalMonths(firstYear.fiscalStart, firstYear.fiscalEnd)
  const unchanged =
    saved?.startMonth === startMonth && saved?.startDay === startDay
  const yearEnd = financeYearEndLabel(startMonth, startDay)
  const nextYear = `1 ${FINANCE_MONTH_NAMES[startMonth - 1]?.slice(0, 3)} – ${
    financeYearEndFromStart(startMonth, startDay).day
  } ${FINANCE_MONTH_NAMES[endMonth - 1]?.slice(0, 3)}`
  const firstYearText = `${formatFinanceDate(firstYear.fiscalStart)} – ${formatFinanceDate(firstYear.fiscalEnd)}`

  if (fiscal.fiscalHistoryExists)
    return (
      <p className="text-sm text-muted-foreground">
        Your year ends on{" "}
        {saved ? financeYearEndLabel(saved.startMonth, saved.startDay) : "—"}.
        It can&apos;t change after a year has been closed.
      </p>
    )

  async function save() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const scope = await readFinanceCloseScope()
      if (
        !scope ||
        !["OWNER", "ADMIN"].includes(scope.role.trim().toUpperCase())
      )
        throw new Error("Only the Owner or an Admin can set the year end.")
      commandId.current ??= crypto.randomUUID()
      await mutation.mutateAsync({
        bookId: book.id,
        clientCommandId: commandId.current,
        startMonth,
        startDay,
        expectedRevision: saved?.revision ?? 0,
        reason: reason.trim(),
      })
      await Promise.all([
        client.invalidateQueries({
          queryKey: trpc.finance.fiscalCalendar.queryKey({ bookId: book.id }),
        }),
        client.invalidateQueries({
          queryKey: trpc.finance.yearEndPreview.queryKey({ bookId: book.id }),
        }),
      ])
      onSaved()
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn't save the year end.",
      )
    } finally {
      setSaving(false)
    }
  }

  if (reviewing)
    return (
      <FieldGroup className="gap-5">
        <p className="text-sm leading-relaxed">
          Your business year will end on <b>{yearEnd}</b> every year.
        </p>
        <FinanceDetails
          rows={[
            ["First year", firstYearText],
            ["Then every year", nextYear],
            ["Profit goes to", "Retained earnings (owner's money)"],
            ["Why", reason.trim()],
          ]}
        />
        <p className="text-xs text-muted-foreground">
          Saving doesn&apos;t move any money. It only sets the dates for the
          year-end preview.
        </p>
        {error ? (
          <FormFeedback appearance="dashboard">
            We couldn&apos;t save this. {error}
          </FormFeedback>
        ) : null}
        <FormActions className="sticky bottom-0 bg-background py-4">
          <Button
            type="button"
            variant="outline"
            className="rounded-none"
            disabled={saving}
            onClick={() => {
              commandId.current = null
              setError(null)
              setReviewing(false)
            }}
          >
            Back
          </Button>
          <SubmitButton
            type="button"
            isSubmitting={saving}
            disabled={saving}
            onClick={() => void save()}
          >
            {error ? "Try again" : "Save year end"}
          </SubmitButton>
        </FormActions>
      </FieldGroup>
    )

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!reason.trim()) {
          setError("Say why, so others understand later.")
          return
        }
        setError(null)
        commandId.current = null
        setReviewing(true)
      }}
    >
      <FieldGroup className="min-w-0 gap-5">
        <FinanceField
          label="Your year ends on the last day of"
          description="Most businesses in Nigeria use December."
        >
          <SelectControl
            options={monthOptions}
            value={endMonth}
            onValueChange={setEndMonth}
          />
        </FinanceField>
        {savedEnd && !savedEnd.lastDayOfMonth ? (
          <p className="text-sm text-muted-foreground">
            Your saved year end is{" "}
            {financeYearEndLabel(saved?.startMonth ?? 1, saved?.startDay ?? 1)}.
            Choosing a month here moves it to that month&apos;s last day.
          </p>
        ) : null}
        {firstYear.firstPeriodStub ? (
          <div className="grid gap-0.5 border-l-2 border-amber-500 bg-amber-500/10 px-3 py-2 text-sm">
            <p className="font-medium">
              Your first year is short: {firstYearText} ({months}{" "}
              {months === 1 ? "month" : "months"})
            </p>
            <p className="text-muted-foreground">
              Your books started on {formatFinanceDate(book.startsAt)}. Every
              year after runs {nextYear}.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your first year runs {firstYearText}.
          </p>
        )}
        <FinanceField label="Why?">
          <Input
            maxLength={400}
            placeholder={`Our year ends in ${FINANCE_MONTH_NAMES[endMonth - 1]}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </FinanceField>
        <p className="text-xs text-muted-foreground">
          You can change this until you close your first year.
        </p>
        {unchanged ? (
          <p className="text-sm text-muted-foreground">
            This is already your year end.
          </p>
        ) : null}
        {error ? (
          <FormFeedback appearance="dashboard">{error}</FormFeedback>
        ) : null}
        <FormActions className="sticky bottom-0 bg-background py-4">
          <Button
            type="button"
            variant="outline"
            className="rounded-none"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <SubmitButton type="submit" isSubmitting={false} disabled={unchanged}>
            Review
          </SubmitButton>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
