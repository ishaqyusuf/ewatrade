"use client"

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from "@ewatrade/ui"
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { ReturnableBadge } from "./returnable-badge"
import { useReturnableItems } from "./use-returnables"

export type ReturnableDraft = {
  catalogItemId: string
  name: string
  quantity: string
}

const RETURNABLE_MAX_QUANTITY = 100_000

/** `orders.create` returnables, or a readable problem. */
export function orderReturnablesPayload(drafts: ReturnableDraft[]):
  | {
      returnables: Array<{ catalogItemId: string; quantity: number }>
      problem: null
    }
  | { returnables: null; problem: string } {
  const returnables: Array<{ catalogItemId: string; quantity: number }> = []
  for (const row of drafts) {
    const text = row.quantity.trim()
    const quantity = /^\d+$/.test(text) ? Number(text) : 0
    if (quantity < 1 || quantity > RETURNABLE_MAX_QUANTITY)
      return {
        problem: `Enter how many ${row.name.toLowerCase()} go out, as a whole number.`,
        returnables: null,
      }
    returnables.push({ catalogItemId: row.catalogItemId, quantity })
  }
  return { problem: null, returnables }
}

/**
 * Order create: crates, cylinders and other returnables going out with the
 * order. Hidden for businesses with no Returnable items.
 */
export function CheckoutReturnables({
  rows,
  onChange,
  savedCustomer,
  onChooseCustomer,
  disabled,
}: {
  rows: ReturnableDraft[]
  onChange: (rows: ReturnableDraft[]) => void
  savedCustomer: boolean
  /** Opens the customer picker when no saved customer is chosen. */
  onChooseCustomer?: () => void
  disabled?: boolean
}) {
  const items = useReturnableItems()
  const available = items.data ?? []
  if (!available.length && !rows.length) return null

  const blocked = savedCustomer
    ? null
    : "Choose a saved customer to track returnables"
  const remaining = available.filter(
    (item) => !rows.some((row) => row.catalogItemId === item.id),
  )
  const add = (item: { id: string; name: string }) =>
    onChange([
      ...rows,
      { catalogItemId: item.id, name: item.name, quantity: "1" },
    ])
  const addLabel = rows.length ? "Add another" : "Add returnable"

  return (
    <section aria-label="Returnables" className="grid gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Returnables
      </h3>
      {blocked && !rows.length ? (
        <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground">
          <ReturnableBadge />
          <span className="min-w-0 flex-1">{blocked}</span>
          {onChooseCustomer ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={onChooseCustomer}
            >
              Choose customer
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-2">
          {rows.map((row) => (
            <div
              key={row.catalogItemId}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2.5"
            >
              <ReturnableBadge />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <p
                  className={
                    blocked
                      ? "text-xs text-destructive"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {blocked ?? "To be returned"}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <label htmlFor={`returnable-out-${row.catalogItemId}`}>
                  Going out
                </label>
                <Input
                  id={`returnable-out-${row.catalogItemId}`}
                  inputMode="numeric"
                  className="w-20 tabular-nums"
                  disabled={disabled}
                  value={row.quantity}
                  onChange={(event) =>
                    onChange(
                      rows.map((current) =>
                        current.catalogItemId === row.catalogItemId
                          ? { ...current, quantity: event.target.value }
                          : current,
                      ),
                    )
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${row.name}`}
                disabled={disabled}
                onClick={() =>
                  onChange(
                    rows.filter(
                      (current) => current.catalogItemId !== row.catalogItemId,
                    ),
                  )
                }
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
              </Button>
            </div>
          ))}
          {remaining.length && !blocked ? (
            remaining.length === 1 ? (
              <Button
                type="button"
                variant="outline"
                className="w-fit border-dashed"
                disabled={disabled}
                onClick={() => {
                  const [item] = remaining
                  if (item) add(item)
                }}
              >
                <HugeiconsIcon icon={Add01Icon} className="size-4" />
                {addLabel}
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={disabled}
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      className="w-fit border-dashed"
                    />
                  }
                >
                  <HugeiconsIcon icon={Add01Icon} className="size-4" />
                  {addLabel}
                </DropdownMenuTrigger>
                <DropdownMenuContent appearance="dashboard" align="start">
                  {remaining.map((item) => (
                    <DropdownMenuItem key={item.id} onClick={() => add(item)}>
                      {item.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )
          ) : null}
        </div>
      )}
    </section>
  )
}
