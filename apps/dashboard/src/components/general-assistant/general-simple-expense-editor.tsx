"use client"
import { useTRPC } from "@/trpc/client"
import {
  type GeneralAction,
  type SimpleExpense,
  similarSaleNames,
  simpleExpenseAction,
} from "@ewatrade/assistant/general/contracts"
import { Button, Input } from "@ewatrade/ui"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils/currency"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useId, useState } from "react"
import { GeneralChatPhotoThumb } from "./general-chat-photo"
import { localDay, moneyInEffectiveAt } from "./general-simple-money-in-editor"

type Named = { id: string; name: string }

/** A chosen row offers the others; a typed name offers close matches. */
function suggestions<T extends Named>(
  rows: T[],
  name: string | undefined,
  chosenId: string | undefined,
) {
  if (name && !chosenId) {
    const close = similarSaleNames(name, rows)
    return close.length ? close : rows
  }
  return rows.filter((row) => row.id !== chosenId)
}

function Pills<T extends Named>({
  rows,
  disabled,
  onPick,
}: {
  rows: T[]
  disabled: boolean
  onPick: (row: T) => void
}) {
  if (!rows.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {rows.slice(0, 6).map((row) => (
        <Button
          key={row.id}
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onPick(row)}
        >
          {row.name}
        </Button>
      ))}
    </div>
  )
}

export function GeneralSimpleExpenseEditor({
  initial,
  disabled,
  onSave,
  onCancel,
}: {
  initial: SimpleExpense
  disabled: boolean
  onSave: (payload: GeneralAction) => void
  onCancel: () => void
}) {
  const fieldId = useId()
  const [expense, setExpense] = useState(initial)
  const [amount, setAmount] = useState(minorToMajorInput(initial.amountMinor))
  const [day, setDay] = useState(() =>
    localDay(initial.effectiveAt ? new Date(initial.effectiveAt) : new Date()),
  )
  const [error, setError] = useState("")
  const trpc = useTRPC()
  // Names only; a failed read just leaves typing.
  const options = useQuery({
    ...trpc.assistant.simpleExpenseOptions.queryOptions({}),
    retry: false,
  })
  const startDay = options.data?.book
    ? localDay(new Date(options.data.book.startsAt))
    : undefined
  const today = localDay(new Date())
  const patch = (changes: Partial<SimpleExpense>) =>
    setExpense((current) => ({ ...current, ...changes }))
  const accounts = suggestions(
    options.data?.accounts ?? [],
    expense.accountName,
    expense.moneyAccountId,
  )
  const categories = suggestions(
    options.data?.categories ?? [],
    expense.categoryName,
    expense.expenseCategoryId,
  )
  function save() {
    const amountMinor = majorToMinor(amount)
    if (amount.trim() && (amountMinor === null || amountMinor <= 0)) {
      setError("Enter a valid amount.")
      return
    }
    const effectiveAt = moneyInEffectiveAt(day, initial.effectiveAt)
    if (effectiveAt === null || day > today) {
      setError("Choose today or an earlier date.")
      return
    }
    if (startDay && day < startDay) {
      setError(
        `Bookkeeping starts on ${new Date(
          options.data?.book?.startsAt ?? "",
        ).toLocaleDateString([], {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}.`,
      )
      return
    }
    const parsed = simpleExpenseAction.safeParse({
      ...expense,
      amountMinor: amountMinor ?? undefined,
      effectiveAt,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details.")
      return
    }
    onSave(parsed.data)
  }
  return (
    <div className="grid gap-4">
      <label htmlFor={`${fieldId}-amount`} className="grid gap-2 text-sm">
        Amount
        <Input
          id={`${fieldId}-amount`}
          inputMode="decimal"
          value={amount}
          disabled={disabled}
          placeholder="e.g. 5000"
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <label htmlFor={`${fieldId}-for`} className="grid gap-2 text-sm">
        What was it for?
        <Input
          id={`${fieldId}-for`}
          value={expense.description ?? ""}
          disabled={disabled}
          maxLength={200}
          placeholder="e.g. feed"
          onChange={(event) =>
            patch({ description: event.target.value || undefined })
          }
        />
      </label>
      <div className="grid gap-2 text-sm">
        Paid?
        <div className="flex gap-2">
          {(
            [
              [true, "Paid"],
              [false, "Not paid yet"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={label}
              size="sm"
              aria-pressed={expense.paid === value}
              variant={expense.paid === value ? "default" : "outline"}
              disabled={disabled}
              onClick={() =>
                // An unpaid bill takes no money from an account.
                patch(
                  value
                    ? { paid: true }
                    : {
                        paid: false,
                        accountName: undefined,
                        moneyAccountId: undefined,
                      },
                )
              }
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      {expense.paid ? (
        <div className="grid gap-2">
          <label htmlFor={`${fieldId}-account`} className="grid gap-2 text-sm">
            From account
            <Input
              id={`${fieldId}-account`}
              value={expense.accountName ?? ""}
              disabled={disabled}
              maxLength={160}
              placeholder="e.g. Shop cash"
              onChange={(event) =>
                // A new name is matched again when saved.
                patch({
                  accountName: event.target.value || undefined,
                  moneyAccountId: undefined,
                })
              }
            />
          </label>
          <Pills
            rows={accounts}
            disabled={disabled}
            onPick={(account) =>
              patch({ accountName: account.name, moneyAccountId: account.id })
            }
          />
          {expense.accountName && !expense.moneyAccountId ? (
            <p className="text-xs text-muted-foreground">
              Choose one of your accounts. New spending accounts are added in
              Money accounts.
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-2">
        <label htmlFor={`${fieldId}-category`} className="grid gap-2 text-sm">
          Category
          <Input
            id={`${fieldId}-category`}
            value={expense.categoryName ?? ""}
            disabled={disabled}
            maxLength={160}
            placeholder="Operating expenses"
            onChange={(event) =>
              patch({
                categoryName: event.target.value || undefined,
                expenseCategoryId: undefined,
              })
            }
          />
        </label>
        <Pills
          rows={categories}
          disabled={disabled}
          onPick={(category) =>
            patch({
              categoryName: category.name,
              expenseCategoryId: category.id,
            })
          }
        />
      </div>
      <label htmlFor={`${fieldId}-payee`} className="grid gap-2 text-sm">
        {expense.paid === false ? "Owed to" : "Paid to"} (optional)
        <Input
          id={`${fieldId}-payee`}
          value={expense.payeeName ?? ""}
          disabled={disabled}
          maxLength={160}
          onChange={(event) =>
            patch({ payeeName: event.target.value || undefined })
          }
        />
      </label>
      <label htmlFor={`${fieldId}-date`} className="grid gap-2 text-sm">
        Date
        <Input
          id={`${fieldId}-date`}
          type="date"
          value={day}
          min={startDay}
          max={today}
          disabled={disabled}
          onChange={(event) => setDay(event.target.value)}
        />
      </label>
      {expense.attachmentIds.length ? (
        <div className="grid gap-2 text-sm">
          Receipt
          <ul className="flex flex-wrap gap-2">
            {expense.attachmentIds.map((attachmentId) => (
              <li key={attachmentId} className="relative">
                <GeneralChatPhotoThumb
                  attachmentId={attachmentId}
                  className="size-14"
                />
                <Button
                  size="icon-xs"
                  variant="secondary"
                  aria-label="Remove receipt"
                  disabled={disabled}
                  className="absolute -top-2 -right-2"
                  onClick={() =>
                    patch({
                      attachmentIds: expense.attachmentIds.filter(
                        (id) => id !== attachmentId,
                      ),
                    })
                  }
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button disabled={disabled} onClick={save}>
          Update
        </Button>
        <Button variant="ghost" disabled={disabled} onClick={onCancel}>
          Close
        </Button>
      </div>
    </div>
  )
}
