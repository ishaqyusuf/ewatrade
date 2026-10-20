"use client"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  FieldGroup,
  Input,
} from "@ewatrade/ui"

import { FormDatePicker } from "@/components/forms/form-controls"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { z } from "zod"
import { financeSourceLabel } from "./bank-source-detail"
import {
  FinanceDetails,
  FinanceField,
  FinanceFormFooter,
  FinanceReview,
} from "./form-fields"
import {
  balanceChange,
  changes,
  dayIn,
  plainDay,
  todayIn,
  useMoneyBalances,
} from "./review-changes"
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
  const [review, setReview] = useState<Review | null>(null)
  const balances = useMoneyBalances(book.id)
  const command = useFinanceCommand(
    useCompleteFinanceForm(
      review
        ? `Movement undone: ${review.source.description}. The original stays in history.`
        : undefined,
    ),
    book.id,
    "reverseMoney",
  )
  const [preparing, setPreparing] = useState(false)
  const [prepareError, setPrepareError] = useState<string | null>(null)
  const today = todayIn(book.timezone)
  const { close } = useFinanceParams()
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
          <p>Dated {plainDay(dayIn(history.effectiveAt, book.timezone))}</p>
        </div>
      </FieldGroup>
    )
  }

  if (review) {
    const moved = moneyLines(review.source)
    return (
      <FinanceReview
        command={command}
        onBack={() => setReview(null)}
        onConfirm={() => submit(review)}
        confirmLabel="Undo movement"
        sentence={
          <>
            This undoes <b>{review.source.description}</b> in your records. It
            doesn't move real money. The original stays in history, marked
            Undone.
          </>
        }
        changes={changes(
          moved.map((line) =>
            balanceChange(
              balances,
              line.accountId,
              BigInt(line.creditMinor) - BigInt(line.debitMinor),
              book.currencyCode,
            ),
          ),
        )}
        note="Move the real money yourself if you need to."
      >
        <FinanceDetails
          rows={[
            ["Date", plainDay(review.effectiveAt.toISOString().slice(0, 10))],
            ["Why", review.reason],
          ]}
        />
      </FinanceReview>
    )
  }

  const originalDate = new Date(source.effectiveAt).toISOString().slice(0, 10)
  return (
    <form
      className="grid gap-5"
      onSubmit={form.handleSubmit((values) => void prepare(values))}
    >
      <MovementSummary source={source} money={money} timeZone={book.timezone} />
      <p className="text-sm text-muted-foreground">
        Undoing takes it back in your records. No real money moves, and the
        original stays in history.
      </p>
      <FieldGroup className="gap-4">
        <FinanceField label="Date" error={form.formState.errors.date?.message}>
          <FormDatePicker
            min={originalDate}
            max={today}
            disabled={preparing}
            control={form.control}
            name="date"
          />
        </FinanceField>
        <FinanceField
          label="Why are you undoing it?"
          error={form.formState.errors.reason?.message}
        >
          <Input
            required
            maxLength={400}
            autoComplete="off"
            placeholder="Typed the wrong amount"
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
      <FinanceFormFooter
        onCancel={() => void close()}
        submitLabel="Review"
        isSubmitting={preparing}
        disabled={preparing || !command.ready}
      />
    </form>
  )
}

/** The money-account lines of a movement (cash, bank, clearing). */
function moneyLines(source: MoneyMovement) {
  return source.lines.filter(
    (line) =>
      line.accountKind === "ASSET" &&
      ["CASH", "BANK", "CLEARING"].includes(line.accountPurpose),
  )
}

function MovementSummary({
  source,
  money,
  timeZone,
}: {
  source: MoneyMovement
  money: (minor: string) => string
  timeZone: string
}) {
  return (
    <section className="grid gap-2 border border-border bg-muted/40 px-3 py-2 text-sm">
      <div>
        <p className="font-medium">{source.description}</p>
        <p className="text-muted-foreground">
          {financeSourceLabel(source.sourceKind)} ·{" "}
          {plainDay(dayIn(source.effectiveAt, timeZone))}
        </p>
      </div>
      {moneyLines(source).map((line) => (
        <div key={line.accountId} className="flex justify-between gap-3">
          <span>{line.accountName}</span>
          <span className="tabular-nums">
            {BigInt(line.debitMinor) > BigInt(0)
              ? `Money in ${money(line.debitMinor)}`
              : `Money out ${money(line.creditMinor)}`}
          </span>
        </div>
      ))}
    </section>
  )
}
