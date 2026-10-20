"use client"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  FieldGroup,
  FormActions,
  Input,
  Separator,
  SubmitButton,
} from "@ewatrade/ui"

import { FormDateControl } from "@/components/forms/form-controls"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { z } from "zod"
import { financeSourceLabel } from "./bank-source-detail"
import { FinanceField, FinanceReview } from "./form-fields"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

type MoneyMovement = RouterOutputs["finance"]["moneyMovement"]
const utcDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    )
  }, "Choose a valid date.")
const schema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Enter a reason.")
    .max(400, "Use 400 characters or fewer."),
  date: utcDate,
})
type Values = z.infer<typeof schema>
type Review = {
  source: MoneyMovement
  effectiveAt: Date
  reason: string
}

const eligibleSourceKinds = [
  "TRANSFER",
  "OWNER_CONTRIBUTION",
  "OWNER_WITHDRAWAL",
]

export function FinanceMoneyReversalForm({
  book,
  entryId,
}: {
  book: FinanceBook
  entryId: string
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const sourceQuery = useQuery(
    trpc.finance.moneyMovement.queryOptions(
      { bookId: book.id, entryId },
      { staleTime: 0, retry: false },
    ),
  )
  const mutation = useMutation(trpc.finance.reverseMoney.mutationOptions())
  const command = useFinanceCommand(
    useCompleteFinanceForm(),
    book.id,
    "reverseMoney",
  )
  const [review, setReview] = useState<Review | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [prepareError, setPrepareError] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const form = useZodForm<Values>(schema, {
    defaultValues: { reason: "", date: today },
  })

  async function prepare(values: Values) {
    if (preparing) return
    if (!command.ready) {
      setPrepareError("Checking what you saved. Wait a moment, then try again.")
      return
    }
    setPreparing(true)
    setPrepareError(null)
    try {
      const source = await client.fetchQuery(
        trpc.finance.moneyMovement.queryOptions(
          { bookId: book.id, entryId },
          { staleTime: 0 },
        ),
      )
      if (source.bookId !== book.id) {
        throw new Error("This movement is not in your Finance.")
      }
      if (!eligibleSourceKinds.includes(source.sourceKind)) {
        throw new Error(
          "This entry is not a money movement that can be undone.",
        )
      }
      if (source.reversal) {
        throw new Error("This movement has already been undone.")
      }
      const original = new Date(source.effectiveAt)
      const requested = new Date(`${values.date}T00:00:00.000Z`)
      if (
        !Number.isFinite(original.getTime()) ||
        requested <
          new Date(
            `${source.effectiveAt.toISOString().slice(0, 10)}T00:00:00.000Z`,
          )
      ) {
        throw new Error("The date can't be before the original movement.")
      }
      if (values.date > today) {
        throw new Error("Choose a date no later than today.")
      }
      const effectiveAt = requested < original ? original : requested
      setReview({ source, effectiveAt, reason: values.reason.trim() })
    } catch (failure) {
      setPrepareError(
        failure instanceof Error
          ? failure.message
          : "Couldn't check this movement.",
      )
    } finally {
      setPreparing(false)
    }
  }

  function submit(value: Review) {
    const payload = {
      bookId: book.id,
      entryId: value.source.id,
      reason: value.reason,
      effectiveAt: value.effectiveAt,
    }
    void command.run({
      payload,
      recoveryMetadata: { entryId: value.source.id },
      write: (clientCommandId) =>
        mutation.mutateAsync({ ...payload, clientCommandId }),
    })
  }

  if (sourceQuery.isPending) {
    return <output aria-busy="true">Loading movement…</output>
  }
  if (sourceQuery.isError) {
    return (
      <Alert
        appearance="dashboard"
        variant="destructive"
        className="grid gap-3"
      >
        <AlertTitle>Couldn't load this movement</AlertTitle>
        <AlertDescription>{sourceQuery.error.message}</AlertDescription>
        <Button
          className="w-fit"
          variant="outline"
          onClick={() => void sourceQuery.refetch()}
        >
          Try again
        </Button>
      </Alert>
    )
  }
  const source = sourceQuery.data
  if (
    source.bookId !== book.id ||
    !eligibleSourceKinds.includes(source.sourceKind)
  ) {
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertTitle>Movement not available</AlertTitle>
        <AlertDescription>
          This entry is not a money movement that can be undone.
        </AlertDescription>
      </Alert>
    )
  }

  const money = (minor: string) => formatFinanceMoney(minor, book.currencyCode)
  const history = source.reversal
  if (history) {
    return (
      <FieldGroup className="grid gap-4">
        <h3 className="font-semibold">Movement already undone</h3>
        <Alert appearance="dashboard">
          <AlertDescription>The original stays in history.</AlertDescription>
        </Alert>
        <div className="border border-border p-4 text-sm">
          <p className="font-medium">Undo: {history.description}</p>
          <p>Dated {new Date(history.effectiveAt).toISOString()}</p>
        </div>
      </FieldGroup>
    )
  }

  if (review) {
    return (
      <FinanceReview
        command={command}
        onBack={() => setReview(null)}
        onConfirm={() => submit(review)}
      >
        <h3 className="font-medium">Undo this movement</h3>
        <MovementSummary source={review.source} money={money} />
        <section className="grid gap-2 border border-border p-4">
          <h4 className="font-medium">What the undo changes</h4>
          {review.source.lines.map((line) => (
            <div
              key={line.accountId}
              className="flex flex-wrap justify-between gap-2 text-sm"
            >
              <span>{line.accountName}</span>
              <span className="tabular-nums">
                {lineAmounts(line, line.creditMinor, line.debitMinor, money)}
              </span>
            </div>
          ))}
        </section>
        <p className="text-sm">
          Undo dated {review.effectiveAt.toISOString().slice(0, 10)}.
        </p>
        <p className="break-words text-sm">Why: {review.reason}</p>
        <Alert appearance="dashboard">
          <AlertDescription>
            This only changes your records; no money is sent. The original stays
            in history. Move the real money yourself if you need to.
          </AlertDescription>
        </Alert>
      </FinanceReview>
    )
  }

  const originalDate = new Date(source.effectiveAt).toISOString().slice(0, 10)
  return (
    <form
      className="grid gap-5"
      onSubmit={form.handleSubmit((values) => void prepare(values))}
    >
      <h3 className="font-semibold">Undo money movement</h3>
      <MovementSummary source={source} money={money} />
      <Alert appearance="dashboard">
        <AlertDescription>
          The original stays in history. This adds the exact opposite entry. No
          money is sent.
        </AlertDescription>
      </Alert>
      <FieldGroup className="gap-4">
        <FinanceField label="Date" error={form.formState.errors.date?.message}>
          <FormDateControl
            required
            type="date"
            min={originalDate}
            max={today}
            disabled={preparing}
            control={form.control}
            name="date"
          />
        </FinanceField>
        <FinanceField
          label="Why (required)"
          error={form.formState.errors.reason?.message}
        >
          <Input
            required
            maxLength={400}
            autoComplete="off"
            placeholder="Why are you undoing this?"
            disabled={preparing}
            {...form.register("reason")}
          />
        </FinanceField>
      </FieldGroup>
      {prepareError ? (
        <Alert appearance="dashboard" variant="destructive">
          <AlertDescription>{prepareError}</AlertDescription>
        </Alert>
      ) : null}
      <FormActions>
        <SubmitButton
          isSubmitting={preparing}
          type="submit"
          disabled={preparing || !command.ready}
        >
          {preparing ? "Refreshing movement…" : "Review undo"}
        </SubmitButton>
      </FormActions>
    </form>
  )
}

function lineAmounts(
  line: { accountKind: string; accountPurpose: string },
  debit: string,
  credit: string,
  money: (minor: string) => string,
) {
  const moneyAccount =
    line.accountKind === "ASSET" &&
    ["CASH", "BANK", "CLEARING"].includes(line.accountPurpose)
  return moneyAccount
    ? `Money in ${money(debit)} · Money out ${money(credit)}`
    : `Debit ${money(debit)} · Credit ${money(credit)}`
}

function MovementSummary({
  source,
  money,
}: {
  source: MoneyMovement
  money: (minor: string) => string
}) {
  return (
    <section className="grid gap-3 border border-border p-4">
      <div>
        <p className="font-medium">{source.description}</p>
        <p className="text-sm text-muted-foreground">
          {financeSourceLabel(source.sourceKind)} ·{" "}
          {new Date(source.effectiveAt).toISOString()}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Added {new Date(source.recordedAt).toISOString()}
      </p>
      <div className="grid gap-2">
        {source.lines.map((line, index) => (
          <div key={line.accountId} className="grid gap-2 text-sm">
            {index > 0 ? <Separator /> : null}
            <div className="grid gap-1 sm:grid-cols-[1fr_auto]">
              <span>{line.accountName}</span>
              <span className="tabular-nums">
                {lineAmounts(line, line.debitMinor, line.creditMinor, money)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
