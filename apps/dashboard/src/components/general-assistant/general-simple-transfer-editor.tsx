"use client"
import { useTRPC } from "@/trpc/client"
import {
  type GeneralAction,
  type SimpleTransfer,
  normalizedSaleName,
  similarSaleNames,
  simpleTransferAction,
} from "@ewatrade/assistant/general/contracts"
import { Button, Input } from "@ewatrade/ui"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils/currency"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useId, useState } from "react"
import { GeneralChatPhotoThumb } from "./general-chat-photo"
import { localDay, moneyInEffectiveAt } from "./general-simple-money-in-editor"

type Account = { id: string; name: string }
type NewKind = "BANK" | "CASH"

/** A chosen account offers the others; a typed name offers close matches, else all. */
function suggestions(
  rows: Account[],
  name: string | undefined,
  chosenId: string | undefined,
) {
  if (name && !chosenId) {
    const close = similarSaleNames(name, rows)
    return close.length ? close : rows
  }
  return rows.filter((row) => row.id !== chosenId)
}

function Pills({
  rows,
  disabled,
  onPick,
}: {
  rows: Account[]
  disabled: boolean
  onPick: (row: Account) => void
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

const guessKind = (name: string): NewKind =>
  /\bcash\b/i.test(name) ? "CASH" : "BANK"

export function GeneralSimpleTransferEditor({
  initial,
  disabled,
  onSave,
  onCancel,
}: {
  initial: SimpleTransfer
  disabled: boolean
  onSave: (payload: GeneralAction) => void
  onCancel: () => void
}) {
  const fieldId = useId()
  const [transfer, setTransfer] = useState(initial)
  const [amount, setAmount] = useState(minorToMajorInput(initial.amountMinor))
  const [day, setDay] = useState(() =>
    localDay(initial.effectiveAt ? new Date(initial.effectiveAt) : new Date()),
  )
  const [error, setError] = useState("")
  const trpc = useTRPC()
  // Names only; a failed read just leaves typing.
  const options = useQuery({
    ...trpc.assistant.simpleTransferOptions.queryOptions({}),
    retry: false,
  })
  const accounts: Account[] = options.data?.accounts ?? []
  const startsAt = options.data?.book?.startsAt
  const startDay = startsAt ? localDay(new Date(startsAt)) : undefined
  const today = localDay(new Date())
  const patch = (changes: Partial<SimpleTransfer>) =>
    setTransfer((current) => ({ ...current, ...changes }))
  // The destination is new only while its typed name matches no account.
  const typedTo =
    transfer.toAccountName && !transfer.toMoneyAccountId
      ? transfer.toAccountName
      : undefined
  const exactTo = typedTo
    ? accounts.find(
        (row) => normalizedSaleName(row.name) === normalizedSaleName(typedTo),
      )
    : undefined
  function save() {
    const amountMinor = majorToMinor(amount)
    if (amount.trim() && (amountMinor === null || amountMinor <= 0)) {
      setError("Enter a valid amount.")
      return
    }
    const same =
      (transfer.fromMoneyAccountId &&
        transfer.fromMoneyAccountId === transfer.toMoneyAccountId) ||
      (transfer.fromAccountName &&
        transfer.toAccountName &&
        normalizedSaleName(transfer.fromAccountName) ===
          normalizedSaleName(transfer.toAccountName))
    if (same) {
      setError("Choose two different accounts.")
      return
    }
    const effectiveAt = moneyInEffectiveAt(day, initial.effectiveAt)
    if (effectiveAt === null || day > today) {
      setError("Choose today or an earlier date.")
      return
    }
    if (startsAt && startDay && day < startDay) {
      setError(
        `Bookkeeping starts on ${new Date(startsAt).toLocaleDateString([], {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}.`,
      )
      return
    }
    const parsed = simpleTransferAction.safeParse({
      ...transfer,
      // A typed name that is already an account reuses it.
      ...(exactTo
        ? {
            toAccountName: exactTo.name,
            toMoneyAccountId: exactTo.id,
            newToAccount: undefined,
          }
        : {}),
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
      <div className="grid gap-2">
        <label htmlFor={`${fieldId}-from`} className="grid gap-2 text-sm">
          From account
          <Input
            id={`${fieldId}-from`}
            value={transfer.fromAccountName ?? ""}
            disabled={disabled}
            maxLength={160}
            placeholder="e.g. Shop cash"
            onChange={(event) =>
              patch({
                fromAccountName: event.target.value || undefined,
                fromMoneyAccountId: undefined,
              })
            }
          />
        </label>
        <Pills
          rows={suggestions(
            accounts.filter((row) => row.id !== transfer.toMoneyAccountId),
            transfer.fromAccountName,
            transfer.fromMoneyAccountId,
          )}
          disabled={disabled}
          onPick={(row) =>
            patch({ fromAccountName: row.name, fromMoneyAccountId: row.id })
          }
        />
        {transfer.fromAccountName && !transfer.fromMoneyAccountId ? (
          <p className="text-xs text-muted-foreground">
            Choose one of your accounts.
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <label htmlFor={`${fieldId}-to`} className="grid gap-2 text-sm">
          To account
          <Input
            id={`${fieldId}-to`}
            value={transfer.toAccountName ?? ""}
            disabled={disabled}
            maxLength={160}
            placeholder="e.g. Ishaq PalmPay"
            onChange={(event) => {
              const name = event.target.value || undefined
              // A new name is matched again when saved.
              patch({
                toAccountName: name,
                toMoneyAccountId: undefined,
                newToAccount: name
                  ? {
                      name,
                      kind: transfer.newToAccount?.kind ?? guessKind(name),
                    }
                  : undefined,
              })
            }}
          />
        </label>
        <Pills
          rows={suggestions(
            // The source is never offered as the destination.
            accounts.filter((row) => row.id !== transfer.fromMoneyAccountId),
            transfer.toAccountName,
            transfer.toMoneyAccountId,
          )}
          disabled={disabled}
          onPick={(row) =>
            patch({
              toAccountName: row.name,
              toMoneyAccountId: row.id,
              newToAccount: undefined,
            })
          }
        />
        {typedTo && !exactTo && transfer.newToAccount ? (
          <div className="grid gap-1.5 text-xs text-muted-foreground">
            New account type
            <div className="flex gap-2">
              {(
                [
                  ["BANK", "Bank"],
                  ["CASH", "Cash"],
                ] as const
              ).map(([kind, label]) => (
                <Button
                  key={kind}
                  size="sm"
                  aria-pressed={transfer.newToAccount?.kind === kind}
                  variant={
                    transfer.newToAccount?.kind === kind ? "default" : "outline"
                  }
                  disabled={disabled}
                  onClick={() =>
                    patch({ newToAccount: { name: typedTo, kind } })
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
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
      <label htmlFor={`${fieldId}-note`} className="grid gap-2 text-sm">
        Note (optional)
        <Input
          id={`${fieldId}-note`}
          value={transfer.note ?? ""}
          disabled={disabled}
          maxLength={200}
          onChange={(event) => patch({ note: event.target.value })}
        />
      </label>
      {transfer.attachmentIds.length ? (
        <div className="grid gap-2 text-sm">
          Receipt
          <ul className="flex flex-wrap gap-2">
            {transfer.attachmentIds.map((attachmentId) => (
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
                      attachmentIds: transfer.attachmentIds.filter(
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
