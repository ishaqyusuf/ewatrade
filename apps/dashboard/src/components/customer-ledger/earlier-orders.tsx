"use client"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Alert, AlertDescription, Badge, Button, Checkbox } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { UserMultipleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

type Suggestions = RouterOutputs["customerLedger"]["orderLinkSuggestions"]
type Match = Suggestions["items"][number]["matchedBy"]

const matchTags: Record<Match, string[]> = {
  PHONE: ["Same phone"],
  EMAIL: ["Same email"],
  PHONE_AND_EMAIL: ["Same phone", "Same email"],
}
const day = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" })
const orderPayment: Record<string, string> = {
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  COMPLETED: "Completed",
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name
}

/** Workshop customers-pages 04: shown only when exact matches exist. */
export function EarlierOrdersBanner({
  customerId,
  customerName,
  onReview,
}: {
  customerId: string
  customerName: string
  onReview: () => void
}) {
  const trpc = useTRPC()
  const query = useQuery(
    trpc.customerLedger.orderLinkSuggestions.queryOptions(
      { customerId, limit: 50 },
      { retry: false },
    ),
  )
  const count = query.data?.suggestedCount ?? 0
  if (!count) return null
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
      <HugeiconsIcon
        icon={UserMultipleIcon}
        className="size-4 text-primary"
        aria-hidden="true"
      />
      <span className="min-w-56 flex-1">
        {count} earlier {count === 1 ? "Order has" : "Orders have"}{" "}
        {firstName(customerName)}’s phone or email but{" "}
        {count === 1 ? "isn’t" : "aren’t"} linked to them.
      </span>
      <Button variant="outline" size="sm" onClick={onReview}>
        Review
      </Button>
    </div>
  )
}

/**
 * Review and link earlier unlinked Orders. The server re-checks every match
 * under lock; linking only shows the Orders under this customer and adds
 * nothing to what they owe.
 */
export function EarlierOrdersLink({
  customerId,
  onDone,
}: {
  customerId: string
  onDone: () => void
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const query = useQuery(
    trpc.customerLedger.orderLinkSuggestions.queryOptions(
      { customerId, limit: 50 },
      { retry: false },
    ),
  )
  const link = useMutation(trpc.customerLedger.linkOrders.mutationOptions())
  // One identity per review, so a retried click links the same Orders once.
  const [commandId, setCommandId] = useState(() => crypto.randomUUID())
  const [unpicked, setUnpicked] = useState<Set<string>>(new Set())
  const [problem, setProblem] = useState<string | null>(null)
  const [linked, setLinked] = useState<number | null>(null)

  if (query.isPending)
    return (
      <output aria-busy="true" className="text-sm text-muted-foreground">
        Looking for earlier Orders…
      </output>
    )
  if (query.isError)
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertDescription>
          Couldn’t look for earlier Orders. Check your connection and try again.
        </AlertDescription>
        <Button onClick={() => void query.refetch()}>Try again</Button>
      </Alert>
    )
  const data = query.data
  const name = firstName(data.customer.name)
  const picked = data.items.filter((item) => !unpicked.has(item.orderId))
  const currency = data.items[0]?.currencyCode ?? "NGN"

  async function submit() {
    if (!picked.length || link.isPending) return
    setProblem(null)
    try {
      const result = await link.mutateAsync({
        customerId,
        orderIds: picked.map((item) => item.orderId),
        clientCommandId: commandId,
      })
      setLinked(result.linkedOrderIds.length)
      setCommandId(crypto.randomUUID())
      setUnpicked(new Set())
      await Promise.all([
        client.invalidateQueries({
          queryKey: trpc.customerLedger.orderLinkSuggestions.pathKey(),
        }),
        client.invalidateQueries({
          queryKey: trpc.customerLedger.aging.pathKey(),
        }),
      ])
    } catch (failure) {
      const code = (failure as { data?: { code?: string } } | null)?.data?.code
      setProblem(
        code === "CONFLICT"
          ? "Some of these Orders were linked or changed. The list is refreshed; check it and link again."
          : "Couldn’t link these Orders. Check your connection and try again.",
      )
      if (code === "CONFLICT") {
        setCommandId(crypto.randomUUID())
        void query.refetch()
      }
    }
  }

  return (
    <div className="grid gap-4 text-sm">
      {linked ? (
        <Alert appearance="dashboard" aria-live="polite">
          <AlertDescription>
            Linked {linked} {linked === 1 ? "Order" : "Orders"}. They now show
            under {name}. Nothing was added to what they owe.
          </AlertDescription>
        </Alert>
      ) : null}
      {problem ? (
        <Alert appearance="dashboard" variant="destructive" role="alert">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      ) : null}
      {!data.customer.hasContact ? (
        <p className="text-muted-foreground">
          Add {name}’s phone number or email to find their earlier Orders.
        </p>
      ) : !data.items.length ? (
        <p className="text-muted-foreground">
          No earlier Orders match {name}’s phone or email.
        </p>
      ) : (
        <>
          <p className="text-muted-foreground">
            These Orders were saved with {name}’s phone or email before they
            were a saved customer. Linking shows them under {name}. It doesn’t
            add anything to what they owe.
          </p>
          <ul className="grid divide-y divide-border border border-border">
            {data.items.map((item) => {
              const checked = !unpicked.has(item.orderId)
              return (
                <li key={item.orderId}>
                  {/* biome-ignore lint/a11y/noLabelWithoutControl: the checkbox is the label's child */}
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-3">
                    <Checkbox
                      checked={checked}
                      disabled={link.isPending}
                      onCheckedChange={(next) =>
                        setUnpicked((previous) => {
                          const copy = new Set(previous)
                          if (next) copy.delete(item.orderId)
                          else copy.add(item.orderId)
                          return copy
                        })
                      }
                      aria-label={`Link Order ${item.orderNumber}`}
                    />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex justify-between gap-2">
                        <span className="font-medium">
                          Order {item.orderNumber}
                        </span>
                        <span className="tabular-nums">
                          {formatFinanceMoney(
                            item.totalMinor,
                            item.currencyCode,
                          )}
                        </span>
                      </span>
                      <span className="text-muted-foreground">
                        {day.format(new Date(item.createdAt))} ·{" "}
                        {item.storeName}
                        {item.customerName
                          ? ` · Saved as “${item.customerName}”`
                          : ""}
                        {orderPayment[item.status]
                          ? ` · ${orderPayment[item.status]}`
                          : ""}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {matchTags[item.matchedBy].map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </span>
                      {item.beforeBooksStart ? (
                        <span className="text-amber-700 dark:text-amber-300">
                          From before your books started. Add any starting
                          balance first: it can’t be added after this is linked.
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          {data.suggestedCount > data.items.length || data.truncated ? (
            <p className="text-muted-foreground">
              More Orders match. Link these first, then review again.
            </p>
          ) : null}
        </>
      )}
      {data.conflictCount ? (
        <p className="text-muted-foreground">
          {data.conflictCount} more{" "}
          {data.conflictCount === 1 ? "Order shares" : "Orders share"} {name}’s
          phone or email but {data.conflictCount === 1 ? "has" : "have"} other
          details that don’t match, so{" "}
          {data.conflictCount === 1 ? "it isn’t" : "they aren’t"} shown.
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={link.isPending} onClick={onDone}>
          {data.items.length ? "Cancel" : "Done"}
        </Button>
        {data.items.length ? (
          <Button
            disabled={!picked.length || link.isPending}
            onClick={() => void submit()}
          >
            {link.isPending
              ? "Linking…"
              : `Link ${picked.length} ${picked.length === 1 ? "Order" : "Orders"}`}
          </Button>
        ) : null}
      </div>
      <span className="sr-only" aria-live="polite">
        {picked.length} of {data.items.length} chosen. Currency {currency}.
      </span>
    </div>
  )
}
