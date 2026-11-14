"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import {
  DialogField,
  OrderDialog,
} from "@/components/orders/overview/order-dialog-frame"
import {
  Button,
  Input,
  Skeleton,
  ToggleGroup,
  ToggleGroupItem,
  cn,
} from "@ewatrade/ui"
import {
  Alert02Icon,
  ArrowTurnBackwardIcon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRef, useState } from "react"
import {
  returnableCount,
  useRecordReturnable,
  useReturnableBalances,
} from "./use-returnables"

type Kind = "RETURNED" | "WRITTEN_OFF"

export type RecordReturnTarget = {
  customerId?: string
  catalogItemId?: string
  orderId?: string
}

/**
 * Record return: who, which item, Returned or Lost, and how many (everything
 * out unless changed). Mounted only while open, so each opening starts fresh.
 */
export function RecordReturnDialog({
  target,
  onClose,
}: {
  target: RecordReturnTarget
  onClose: () => void
}) {
  const [customerId, setCustomerId] = useState(target.customerId)
  const [itemId, setItemId] = useState(target.catalogItemId)
  const [kind, setKind] = useState<Kind>("RETURNED")
  // null = every item out (the usual case); otherwise what was typed.
  const [quantity, setQuantity] = useState<string | null>(null)
  const [saved, setSaved] = useState<{
    kind: Kind
    quantity: number
    itemName: string
    customerName: string
    before: number
  } | null>(null)
  const clientMovementId = useRef(`return-${crypto.randomUUID()}`)
  const balances = useReturnableBalances({})
  const record = useRecordReturnable()

  const all = balances.data ?? []
  const customers = [
    ...new Map(all.map((row) => [row.customerId, row])).values(),
  ]
  const forCustomer = all.filter((row) => row.customerId === customerId)
  const balance =
    forCustomer.find((row) => row.catalogItemId === itemId) ??
    (forCustomer.length === 1 ? forCustomer[0] : undefined)
  const count =
    quantity === null
      ? (balance?.out ?? 0)
      : /^\d+$/.test(quantity.trim())
        ? Number(quantity.trim())
        : 0
  const valid = Boolean(balance) && count >= 1 && count <= (balance?.out ?? 0)

  function reset() {
    clientMovementId.current = `return-${crypto.randomUUID()}`
    setSaved(null)
    setQuantity(null)
    setKind("RETURNED")
    record.reset()
  }

  async function save() {
    if (!balance || !valid || record.isPending) return
    try {
      await record.mutateAsync({
        catalogItemId: balance.catalogItemId,
        clientMovementId: clientMovementId.current,
        customerId: balance.customerId,
        kind,
        orderId: target.orderId,
        quantity: count,
      })
      setSaved({
        before: balance.out,
        customerName: balance.customerName,
        itemName: balance.itemName,
        kind,
        quantity: count,
      })
    } catch {
      // Shown from record.error; the same identity is kept so a retry can't double-record.
    }
  }

  if (saved)
    return (
      <OrderDialog
        open
        onOpenChange={onClose}
        title="Return recorded"
        footer={
          <>
            <Button variant="outline" onClick={reset}>
              Record another
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        }
      >
        <div className="grid justify-items-center gap-2 py-2 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary/15 text-primary">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-6" />
          </span>
          <p className="text-lg font-semibold">
            {`${returnableCount(saved.quantity, saved.itemName)} ${saved.kind === "RETURNED" ? "returned" : "written off"}`}
          </p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {`${saved.customerName} · ${saved.before} → ${saved.before - saved.quantity} out`}
          </p>
        </div>
      </OrderDialog>
    )

  const choosingCustomer =
    !customerId || (!forCustomer.length && !balances.isPending)

  return (
    <OrderDialog
      open
      onOpenChange={onClose}
      busy={record.isPending}
      title="Record return"
      footer={
        balance && !choosingCustomer ? (
          <>
            <Button
              variant="outline"
              onClick={onClose}
              disabled={record.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={!valid || record.isPending}
              onClick={() => void save()}
            >
              <HugeiconsIcon
                icon={kind === "RETURNED" ? ArrowTurnBackwardIcon : Alert02Icon}
                className="size-4"
              />
              {record.isPending
                ? "Saving…"
                : kind === "RETURNED"
                  ? `Save return · ${count}`
                  : `Write off ${count}`}
            </Button>
          </>
        ) : undefined
      }
    >
      {balances.isError ? (
        <div className="grid gap-2">
          <FormFeedback appearance="dashboard">
            Couldn’t load what customers hold.
          </FormFeedback>
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => void balances.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : balances.isPending ? (
        <div className="grid gap-2" aria-label="Loading returnables">
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-12 rounded-lg" />
        </div>
      ) : choosingCustomer ? (
        customers.length ? (
          <div className="grid gap-2">
            <p className="text-sm font-medium">Who is returning?</p>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {customers.map((row) => (
                <li key={row.customerId}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center px-3 py-2 text-left text-sm font-medium hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    onClick={() => {
                      setCustomerId(row.customerId)
                      setItemId(undefined)
                      setQuantity(null)
                    }}
                  >
                    {row.customerName}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="rounded-lg border border-border px-3 py-6 text-center text-sm text-muted-foreground">
            {customerId
              ? "Nothing is out with this customer."
              : "No customer has returnables out."}
          </p>
        )
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Customer</p>
              <p className="truncate text-sm font-medium">
                {forCustomer[0]?.customerName ?? "Customer"}
              </p>
            </div>
            {target.customerId ? null : (
              <Button
                variant="link"
                size="sm"
                className="h-auto px-0"
                disabled={record.isPending}
                onClick={() => setCustomerId(undefined)}
              >
                Change
              </Button>
            )}
          </div>
          {forCustomer.length > 1 ? (
            <div className="grid gap-1.5">
              <p className="text-sm font-medium">Item</p>
              <div className="flex flex-wrap gap-2">
                {forCustomer.map((row) => {
                  const on = row.catalogItemId === balance?.catalogItemId
                  return (
                    <button
                      key={row.catalogItemId}
                      type="button"
                      aria-pressed={on}
                      className={cn(
                        "rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:bg-muted",
                        on &&
                          "border-primary bg-primary/10 text-foreground hover:bg-primary/15",
                      )}
                      onClick={() => {
                        setItemId(row.catalogItemId)
                        setQuantity(null)
                      }}
                    >
                      {`${row.itemName} · ${row.out} out`}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Item</p>
              <p className="text-sm font-medium">
                {balance ? `${balance.itemName} · ${balance.out} out` : "—"}
              </p>
            </div>
          )}
          {balance ? (
            <>
              <div className="grid gap-1.5">
                <p className="text-sm font-medium">What happened</p>
                <ToggleGroup
                  value={[kind]}
                  onValueChange={(values) => {
                    const next = values[0]
                    if (next === "RETURNED" || next === "WRITTEN_OFF")
                      setKind(next)
                  }}
                  variant="outline"
                  aria-label="What happened"
                >
                  <ToggleGroupItem value="RETURNED">Returned</ToggleGroupItem>
                  <ToggleGroupItem value="WRITTEN_OFF">Lost</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <DialogField
                label="How many"
                htmlFor="returnable-count"
                hint={`${balance.out} out`}
              >
                <div className="flex items-center gap-2">
                  <Input
                    id="returnable-count"
                    inputMode="numeric"
                    className="w-28 tabular-nums"
                    value={quantity ?? String(balance.out)}
                    onChange={(event) => setQuantity(event.target.value)}
                    aria-invalid={count > balance.out || count < 1}
                  />
                  {count !== balance.out ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQuantity(null)}
                    >
                      {`All ${balance.out}`}
                    </Button>
                  ) : null}
                </div>
              </DialogField>
              {count > balance.out ? (
                <p className="text-xs text-destructive">
                  {`Only ${balance.out} out with this customer.`}
                </p>
              ) : null}
              {kind === "WRITTEN_OFF" ? (
                <p className="text-xs text-muted-foreground">
                  To charge for lost items, record a sale.
                </p>
              ) : null}
              {record.error ? (
                <FormFeedback appearance="dashboard">
                  {record.error.message}
                </FormFeedback>
              ) : null}
              <p className="text-sm text-muted-foreground tabular-nums">
                {`${balance.customerName} · ${balance.out} → ${Math.max(0, balance.out - count)} out`}
              </p>
            </>
          ) : null}
        </>
      )}
    </OrderDialog>
  )
}
