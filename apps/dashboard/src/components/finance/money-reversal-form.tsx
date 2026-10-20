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
import { FinanceField, FinanceReview } from "./form-fields"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

type MoneyMovement = RouterOutputs["finance"]["moneyMovement"]
const utcDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid UTC date.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    )
  }, "Choose a valid UTC date.")
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
      setPrepareError(
        "Checking saved submissions. Wait before reviewing again.",
      )
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
        throw new Error("This movement belongs to another finance book.")
      }
      if (!eligibleSourceKinds.includes(source.sourceKind)) {
        throw new Error("This entry is not an eligible money movement.")
      }
      if (source.reversal) {
        throw new Error("This movement has already been reversed.")
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
        throw new Error(
          "The reversal date cannot precede the original movement.",
        )
      }
      if (values.date > today) {
        throw new Error("Choose a date no later than today (UTC).")
      }
      const effectiveAt = requested < original ? original : requested
      setReview({ source, effectiveAt, reason: values.reason.trim() })
    } catch (failure) {
      setPrepareError(
        failure instanceof Error
          ? failure.message
          : "Unable to review this movement.",
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
    return <output aria-busy="true">Loading movement details…</output>
  }
  if (sourceQuery.isError) {
    return (
      <Alert
        appearance="dashboard"
        variant="destructive"
        className="grid gap-3"
      >
        <AlertTitle>Movement could not be loaded</AlertTitle>
        <AlertDescription>{sourceQuery.error.message}</AlertDescription>
        <Button
          appearance="form"
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
        <AlertTitle>Movement unavailable</AlertTitle>
        <AlertDescription>
          This entry is not an eligible money movement in this finance book.
        </AlertDescription>
      </Alert>
    )
  }

  const money = (minor: string) => formatFinanceMoney(minor, book.currencyCode)
  const history = source.reversal
  if (history) {
    return (
      <FieldGroup className="grid gap-4">
        <h3 className="font-semibold">Movement already reversed</h3>
        <Alert appearance="dashboard">
          <AlertDescription>
            The original movement remains in the statement history.
          </AlertDescription>
        </Alert>
        <div className="border border-border p-4 text-sm">
          <p className="font-medium">Correction: {history.description}</p>
          <p>
            Effective {new Date(history.effectiveAt).toISOString()} · recorded{" "}
            {new Date(history.recordedAt).toISOString()}
          </p>
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
        <h3 className="font-medium">Review movement reversal</h3>
        <MovementSummary source={review.source} money={money} />
        <section className="grid gap-2 border border-border p-4">
          <h4 className="font-medium">Opposite accounting correction</h4>
          {review.source.lines.map((line) => (
            <div
              key={line.accountId}
              className="flex flex-wrap justify-between gap-2 text-sm"
            >
              <span>{line.accountName}</span>
              <span className="tabular-nums">
                Debit {money(line.creditMinor)} · Credit{" "}
                {money(line.debitMinor)}
              </span>
            </div>
          ))}
        </section>
        <p className="text-sm">
          Reversal effective at {review.effectiveAt.toISOString()} UTC.
        </p>
        <p className="break-words text-sm">Reason: {review.reason}</p>
        <Alert appearance="dashboard">
          <AlertDescription>
            This posts an accounting correction only. It does not move actual
            cash or bank funds; reconcile the real-world movement separately.
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
      <h3 className="font-semibold">Reverse money movement</h3>
      <MovementSummary source={source} money={money} />
      <Alert appearance="dashboard">
        <AlertDescription>
          The original entry and its account lines stay in history. This action
          posts their exact accounting opposite.
        </AlertDescription>
      </Alert>
      <FieldGroup className="gap-4">
        <FinanceField
          label="Effective date (UTC)"
          error={form.formState.errors.date?.message}
        >
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
          label="Reason"
          error={form.formState.errors.reason?.message}
        >
          <Input
            required
            maxLength={400}
            autoComplete="off"
            placeholder="Explain why this movement is being corrected"
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
          {preparing ? "Refreshing movement…" : "Review reversal"}
        </SubmitButton>
      </FormActions>
    </form>
  )
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
          {source.sourceKind.replaceAll("_", " ")} ·{" "}
          {new Date(source.effectiveAt).toISOString()} UTC
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Recorded {new Date(source.recordedAt).toISOString()}
      </p>
      <div className="grid gap-2">
        {source.lines.map((line, index) => (
          <div key={line.accountId} className="grid gap-2 text-sm">
            {index > 0 ? <Separator /> : null}
            <div className="grid gap-1 sm:grid-cols-[1fr_auto]">
              <span>
                {line.accountName}{" "}
                <span className="text-muted-foreground">
                  ({line.accountKind} · {line.accountPurpose})
                </span>
              </span>
              <span className="tabular-nums">
                Debit {money(line.debitMinor)} · Credit{" "}
                {money(line.creditMinor)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
