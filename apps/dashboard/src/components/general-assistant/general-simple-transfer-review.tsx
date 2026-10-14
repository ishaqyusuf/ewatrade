"use client"
import {
  type SimpleTransfer,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"
import { Button } from "@ewatrade/ui"
import { GeneralChatPhotoThumb } from "./general-chat-photo"
import { moneyInDay } from "./general-money-in-review"

type Choice = { label: string; text: string }

/** "New bank account" for a destination the save will add. */
export const newAccountLabel = {
  CASH: "New cash account",
  BANK: "New bank account",
  CLEARING: "New settlement account",
} as const

/**
 * A quick transfer at review: the amount, then one route line from one
 * account to the other, then when and who. Built from the draft itself,
 * never ids or balances.
 */
export function GeneralSimpleTransferReview({
  transfer,
  currencyCode,
  choices,
  disabled,
  onChoice,
}: {
  transfer: SimpleTransfer
  currencyCode: string
  /** Server choices for this revision; only offered while the draft is open. */
  choices?: Choice[]
  disabled: boolean
  onChoice?: (choice: Choice) => void
}) {
  const photo = transfer.attachmentIds[0]
  const fresh = transfer.newToAccount && !transfer.toMoneyAccountId
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-2xl leading-tight font-semibold tabular-nums">
            {transfer.amountMinor === undefined
              ? "—"
              : generalMoney(transfer.amountMinor, currencyCode)}
          </p>
          {transfer.fromAccountName || transfer.toAccountName ? (
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
              {transfer.fromAccountName ? (
                <span>
                  <span className="text-muted-foreground">from </span>
                  <span className="font-medium">
                    {transfer.fromAccountName}
                  </span>
                </span>
              ) : null}
              {transfer.toAccountName ? (
                <>
                  <span aria-hidden className="text-muted-foreground">
                    →
                  </span>
                  <span className="sr-only">to</span>
                  <span className="font-medium">{transfer.toAccountName}</span>
                </>
              ) : null}
              {fresh && transfer.newToAccount ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {newAccountLabel[transfer.newToAccount.kind]}
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
        {moneyInDay(transfer.effectiveAt)} · by you
      </p>
      {transfer.note ? (
        <p className="text-sm text-muted-foreground">{transfer.note}</p>
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
