"use client"
import {
  type SimpleExpense,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"
import { Button } from "@ewatrade/ui"
import { GeneralChatPhotoThumb } from "./general-chat-photo"
import { moneyInDay } from "./general-money-in-review"

type Choice = { label: string; text: string }

/**
 * A quick expense at review: the amount, what it was for, where the money
 * came from (or that it is still owed), then one quiet line of when, who
 * and which category. Built from the draft itself, never ids.
 */
export function GeneralSimpleExpenseReview({
  expense,
  currencyCode,
  choices,
  disabled,
  onChoice,
}: {
  expense: SimpleExpense
  currencyCode: string
  /** Server choices for this revision; only offered while the draft is open. */
  choices?: Choice[]
  disabled: boolean
  onChoice?: (choice: Choice) => void
}) {
  const photo = expense.attachmentIds[0]
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-2xl leading-tight font-semibold tabular-nums">
            {expense.amountMinor === undefined
              ? "—"
              : generalMoney(expense.amountMinor, currencyCode)}
          </p>
          {expense.description ? (
            <p className="text-sm">
              <span className="text-muted-foreground">for </span>
              <span className="font-medium">{expense.description}</span>
              {expense.payeeName ? (
                <>
                  <span className="text-muted-foreground"> · to </span>
                  {expense.payeeName}
                </>
              ) : null}
            </p>
          ) : null}
          {expense.paid === false ? (
            <p className="pt-0.5">
              <span className="rounded-full border border-amber-300 px-2 py-0.5 text-xs text-amber-700 dark:border-amber-800 dark:text-amber-400">
                Not paid yet
              </span>
            </p>
          ) : expense.paid && expense.accountName ? (
            <p className="text-sm">
              <span className="text-muted-foreground">from </span>
              <span className="font-medium">{expense.accountName}</span>
            </p>
          ) : null}
        </div>
        {photo ? (
          <GeneralChatPhotoThumb attachmentId={photo} className="size-12" />
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {[
          moneyInDay(expense.effectiveAt),
          "by you",
          expense.categoryName ?? null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {choices?.length && onChoice ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {choices.map((choice) => (
            <Button
              key={choice.text}
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onChoice(choice)}
            >
              {choice.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
