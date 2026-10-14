"use client"
import { useTRPC } from "@/trpc/client"
import {
  type GeneralAction,
  type SimpleMoneyIn,
  similarSaleNames,
  simpleMoneyInAction,
} from "@ewatrade/assistant/general/contracts"
import { Button, Input } from "@ewatrade/ui"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils/currency"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useId, useState } from "react"
import { GeneralChatPhotoThumb } from "./general-chat-photo"

const pad = (value: number) => String(value).padStart(2, "0")
/** A local calendar day for a date input. */
export function localDay(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * The reviewed date back as effectiveAt: unchanged keeps the exact reviewed
 * value, today means "now" at saving, another day is that day at local noon.
 */
export function moneyInEffectiveAt(
  day: string,
  initial: string | undefined,
  now = new Date(),
) {
  if (day === localDay(initial ? new Date(initial) : now)) return initial
  if (day === localDay(now)) return undefined
  const date = new Date(`${day}T12:00:00`)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

export function GeneralSimpleMoneyInEditor({
  initial,
  disabled,
  onSave,
  onCancel,
}: {
  initial: SimpleMoneyIn
  disabled: boolean
  onSave: (payload: GeneralAction) => void
  onCancel: () => void
}) {
  const fieldId = useId()
  const [money, setMoney] = useState(initial)
  const [amount, setAmount] = useState(minorToMajorInput(initial.amountMinor))
  const [day, setDay] = useState(() =>
    localDay(initial.effectiveAt ? new Date(initial.effectiveAt) : new Date()),
  )
  const [error, setError] = useState("")
  const trpc = useTRPC()
  // Account names only; a failed read just leaves typing.
  const options = useQuery({
    ...trpc.assistant.saleOptions.queryOptions({}),
    retry: false,
  })
  const patch = (changes: Partial<SimpleMoneyIn>) =>
    setMoney((current) => ({ ...current, ...changes }))
  // A chosen account offers the others; a typed name offers close matches.
  const all = options.data?.accounts ?? []
  const accounts =
    money.accountName && !money.moneyAccountId
      ? similarSaleNames(money.accountName, all)
      : all.filter((account) => account.id !== money.moneyAccountId)
  function save() {
    const amountMinor = majorToMinor(amount)
    if (amount.trim() && (amountMinor === null || amountMinor <= 0)) {
      setError("Enter a valid amount.")
      return
    }
    const effectiveAt = moneyInEffectiveAt(day, initial.effectiveAt)
    if (effectiveAt === null || (day && day > localDay(new Date()))) {
      setError("Choose today or an earlier date.")
      return
    }
    const parsed = simpleMoneyInAction.safeParse({
      ...money,
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
          placeholder="e.g. 20000"
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <div className="grid gap-2">
        <label htmlFor={`${fieldId}-account`} className="grid gap-2 text-sm">
          Into account
          <Input
            id={`${fieldId}-account`}
            value={money.accountName ?? ""}
            disabled={disabled}
            maxLength={200}
            placeholder="e.g. Shop cash"
            onChange={(event) =>
              // A new name is matched again when saved.
              patch({
                accountName: event.target.value || undefined,
                moneyAccountId: undefined,
                createAccount: false,
              })
            }
          />
        </label>
        {accounts.length ? (
          <div className="flex flex-wrap gap-2">
            {accounts.slice(0, 6).map((account) => (
              <Button
                key={account.id}
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  patch({
                    accountName: account.name,
                    moneyAccountId: account.id,
                    createAccount: false,
                  })
                }
              >
                {account.name}
              </Button>
            ))}
          </div>
        ) : null}
        {money.accountName && !money.moneyAccountId ? (
          <p className="text-xs text-muted-foreground">
            If no account has this name, it is added when you proceed.
          </p>
        ) : null}
      </div>
      <label htmlFor={`${fieldId}-date`} className="grid gap-2 text-sm">
        Date
        <Input
          id={`${fieldId}-date`}
          type="date"
          value={day}
          max={localDay(new Date())}
          disabled={disabled}
          onChange={(event) => setDay(event.target.value)}
        />
      </label>
      <label htmlFor={`${fieldId}-note`} className="grid gap-2 text-sm">
        Note (optional)
        <Input
          id={`${fieldId}-note`}
          value={money.description}
          disabled={disabled}
          maxLength={400}
          onChange={(event) => patch({ description: event.target.value })}
        />
      </label>
      {money.attachmentIds.length ? (
        <div className="grid gap-2 text-sm">
          Photo
          <ul className="flex flex-wrap gap-2">
            {money.attachmentIds.map((attachmentId) => (
              <li key={attachmentId} className="relative">
                <GeneralChatPhotoThumb
                  attachmentId={attachmentId}
                  className="size-14"
                />
                <Button
                  size="icon-xs"
                  variant="secondary"
                  aria-label="Remove photo"
                  disabled={disabled}
                  className="absolute -top-2 -right-2"
                  onClick={() =>
                    patch({
                      attachmentIds: money.attachmentIds.filter(
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
      <p className="text-xs text-muted-foreground">
        Recorded as owner funds put into the business.
      </p>
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
