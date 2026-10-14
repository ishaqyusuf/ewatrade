"use client"
import {
  type SimpleMoneyIn,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"
import { Button } from "@ewatrade/ui"
import { GeneralChatPhotoThumb } from "./general-chat-photo"

type Choice = { label: string; text: string }

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

/** "Today", "Yesterday" or a short date; no date yet means today. */
export function moneyInDay(effectiveAt: string | undefined, now = new Date()) {
  if (!effectiveAt) return "Today"
  const date = new Date(effectiveAt)
  if (dayKey(date) === dayKey(now)) return "Today"
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (dayKey(date) === dayKey(yesterday)) return "Yesterday"
  return date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  })
}

/**
 * Money in at review: the amount, where it goes, then one quiet line of
 * when, who and what kind. Built from the draft itself, never ids.
 */
export function GeneralMoneyInReview({
  money,
  currencyCode,
  choices,
  disabled,
  onChoice,
}: {
  money: SimpleMoneyIn
  currencyCode: string
  /** Server choices for this revision; only offered while the draft is open. */
  choices?: Choice[]
  disabled: boolean
  onChoice?: (choice: Choice) => void
}) {
  const photo = money.attachmentIds[0]
  const newAccount = money.createAccount && !money.moneyAccountId
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl leading-tight font-semibold tabular-nums">
            {money.amountMinor === undefined
              ? "—"
              : generalMoney(money.amountMinor, currencyCode)}
          </p>
          {money.accountName ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span>
                <span className="text-muted-foreground">into </span>
                <span className="font-medium">{money.accountName}</span>
              </span>
              {newAccount ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  New account
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        {photo ? (
          <GeneralChatPhotoThumb attachmentId={photo} className="size-12" />
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {moneyInDay(money.effectiveAt)} · by you ·{" "}
        <span title="Recorded as the owner's own money put into the business">
          Owner funds
        </span>
      </p>
      {money.description ? (
        <p className="text-sm text-muted-foreground">{money.description}</p>
      ) : null}
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
