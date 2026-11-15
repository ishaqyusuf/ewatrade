"use client"

import { CustomerMessageEditor } from "@/components/business-banking/customer-message-editor"
import { ConfirmAlert } from "@/components/forms/confirm-alert"
import { FormFeedback } from "@/components/forms/form-feedback"
import { FilterPills } from "@/components/inventory/filter-pills"
import { ScrollableContent } from "@/components/scrollable-content"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useTRPC } from "@/trpc/client"
import { isRejectedRead } from "@/trpc/query-read-errors"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Separator,
  Sheet,
  Spinner,
  Textarea,
  buttonVariants,
  cn,
} from "@ewatrade/ui"
import { multiplyExactDecimals } from "@ewatrade/utils/exact-decimal"
import { InboxIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { inferRouterOutputs } from "@trpc/server"
import Link from "next/link"
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import {
  alertLabels,
  money,
  parseMoneyInput,
  stageLabels,
  storefrontDraftText,
  whatsAppDraftUrl,
} from "./storefront-requests-model"

/** Lists refresh on load, on focus and after every action here; never on a timer. */
const FRESH = {
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: "always" as const,
  retry: false,
}
/**
 * The one timed read: the two pending counts (two COUNT queries), once a
 * minute while the tab is visible, for ten minutes after load or the last
 * focus. A changed count refreshes the open list.
 */
const COUNT_CHECK_MS = 60_000
const COUNT_CHECK_WINDOW_MS = 10 * 60_000
const kinds = ["products", "services"] as const
const filters = ["open", "confirmed", "closed", "all"] as const

/** New requests stand out; every other stage is a quiet pill (both themes). */
function stageTone(stage: string) {
  return cn(
    "rounded-full border-transparent",
    stage === "received"
      ? "bg-info text-info-foreground"
      : "bg-[var(--neutral)] text-[var(--neutral-foreground)]",
  )
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "That didn't work. Try again."
}

/** A destination confirmOrder accepts: 8–300 characters after trimming. */
function hasDestination(value: unknown): value is string {
  if (typeof value !== "string") return false
  const length = value.trim().length
  return length >= 8 && length <= 300
}

/** Same exact decimal math the server confirms with; null when not whole. */
function exactLineTotalMinor(unitPriceMinor: number, quantity: string) {
  try {
    const whole = /^(\d+)(?:\.0+)?$/.exec(
      multiplyExactDecimals(String(unitPriceMinor), quantity),
    )
    const value = Number(whole?.[1])
    return whole && Number.isSafeInteger(value) ? value : null
  } catch {
    return null
  }
}

/** Calendar day saved as YYYY-MM-DD; formatted without shifting time zones. */
function preferredDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-NG", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
}

/**
 * A service request's preferred day plus any saved clock. With a clock, the day
 * comes from the saved timezone; date-only requests are stored at UTC noon, so
 * their UTC day is the one the customer chose. Legacy rows lack time/timezone.
 */
function servicePreference(
  requestedAt: Date | string,
  preferredTime: string | null,
  preferenceTimezone: string | null,
) {
  const date = new Date(requestedAt)
  if (Number.isNaN(date.getTime())) return null
  let timeZone = "UTC"
  let clock: string | null = null
  if (preferredTime && preferenceTimezone) {
    try {
      new Intl.DateTimeFormat("en-NG", { timeZone: preferenceTimezone })
      timeZone = preferenceTimezone
      clock = `${preferredTime} ${preferenceTimezone.split("/").at(-1)?.replaceAll("_", " ")} time`
    } catch {
      // Unknown saved timezone: keep the stored UTC day and claim no clock.
    }
  }
  const iso = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(date)
  return { iso, day: preferredDay(iso), clock }
}

/**
 * Requests customers sent from the business website. Product requests are pending
 * until confirmed here; confirming creates the canonical Order and reserves stock.
 */
export function StorefrontRequestsInbox({
  canManage,
  timeZone,
}: {
  canManage: boolean
  timeZone: string
}) {
  const [kindParam, setKind] = useQueryState(
    "kind",
    parseAsStringLiteral(kinds).withDefault("products"),
  )
  // Service requests are a manager's: quotes set prices.
  const kind = canManage ? kindParam : "products"
  const [filter, setFilter] = useQueryState(
    "show",
    parseAsStringLiteral(filters).withDefault("open"),
  )
  const [selected, setSelected] = useQueryState("request", parseAsString)
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const activeSince = useRef(Date.now())
  useEffect(() => {
    const restart = () => {
      if (document.visibilityState === "visible")
        activeSince.current = Date.now()
    }
    document.addEventListener("visibilitychange", restart)
    window.addEventListener("focus", restart)
    return () => {
      document.removeEventListener("visibilitychange", restart)
      window.removeEventListener("focus", restart)
    }
  }, [])
  const counts = useQuery({
    ...trpc.storefrontRequests.counts.queryOptions(),
    ...FRESH,
    refetchInterval: (query) =>
      !isRejectedRead(query.state.error) &&
      Date.now() - activeSince.current < COUNT_CHECK_WINDOW_MS
        ? COUNT_CHECK_MS
        : false,
  })
  const total = counts.data?.total
  const seenTotal = useRef(total)
  useEffect(() => {
    if (total === undefined) return
    if (seenTotal.current !== undefined && seenTotal.current !== total) {
      void queryClient.invalidateQueries({
        queryKey: trpc.storefrontRequests.orders.queryKey(),
      })
      void queryClient.invalidateQueries({
        queryKey: trpc.storefrontRequests.services.queryKey(),
      })
    }
    seenTotal.current = total
  }, [total, queryClient, trpc])
  const kindTabs = [
    {
      id: "products" as const,
      label: `Product orders${counts.data?.orders ? ` · ${counts.data.orders}` : ""}`,
    },
    ...(canManage
      ? [
          {
            id: "services" as const,
            label: `Service requests${counts.data?.services ? ` · ${counts.data.services}` : ""}`,
          },
        ]
      : []),
  ]
  return (
    <ScrollableContent>
      <div className="grid min-w-0 gap-4 pt-4 pb-24 sm:pb-8">
        {kindTabs.length > 1 ? (
          <nav
            aria-label="Request type"
            className="min-w-0 border-b border-border"
          >
            <ul className="flex gap-6 overflow-x-auto scrollbar-hide">
              {kindTabs.map((tab) => {
                const active = kind === tab.id
                return (
                  <li key={tab.id} className="shrink-0">
                    <button
                      type="button"
                      aria-current={active ? "page" : undefined}
                      onClick={() => {
                        void setKind(tab.id === "products" ? null : tab.id)
                        void setSelected(null)
                        void setFilter(null)
                      }}
                      className={cn(
                        "relative inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground",
                        active &&
                          "font-medium text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-foreground",
                      )}
                    >
                      {tab.label}
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>
        ) : null}
        <FilterPills
          label="Show"
          value={filter}
          onChange={(value) => {
            void setFilter(value === "open" ? null : value)
            void setSelected(null)
          }}
          options={[
            { id: "open", label: "To review" },
            {
              id: "confirmed",
              label: kind === "products" ? "Confirmed" : "Quoted",
            },
            { id: "closed", label: "Closed" },
            { id: "all", label: "All" },
          ]}
        />
        {kind === "products" ? (
          <OrderRequests
            filter={filter}
            selected={selected}
            onSelect={(id) => void setSelected(id)}
            timeZone={timeZone}
          />
        ) : (
          <ServiceRequests
            filter={filter}
            selected={selected}
            onSelect={(id) => void setSelected(id)}
            onShowAll={() => void setFilter("all")}
            timeZone={timeZone}
          />
        )}
      </div>
    </ScrollableContent>
  )
}

/** The record opens in a right sheet addressed by `?request=`. */
function RequestSheet({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      {open ? children : null}
    </Sheet>
  )
}

function ListShell({
  label,
  loading,
  error,
  empty,
  children,
}: {
  label: string
  loading: boolean
  error: unknown
  empty: boolean
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={label}
      className="grid min-w-0 content-start overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"
    >
      {loading ? (
        <output
          aria-live="polite"
          className="block px-4 py-8 text-center text-sm text-muted-foreground"
        >
          Loading requests…
        </output>
      ) : error ? (
        <div role="alert" className="p-4">
          <FormFeedback appearance="dashboard">
            {errorMessage(error)}
          </FormFeedback>
        </div>
      ) : empty ? (
        <div className="grid justify-items-center gap-1 px-4 py-10 text-center text-sm">
          <HugeiconsIcon
            icon={InboxIcon}
            className="size-6 text-muted-foreground"
            aria-hidden
          />
          <b className="font-medium">Nothing here</b>
        </div>
      ) : (
        children
      )}
    </section>
  )
}

function OrderRequests({
  filter,
  selected,
  onSelect,
  timeZone,
}: {
  filter: (typeof filters)[number]
  selected: string | null
  onSelect: (id: string | null) => void
  timeZone: string
}) {
  const trpc = useTRPC()
  const list = useQuery({
    ...trpc.storefrontRequests.orders.queryOptions({ filter }),
    ...FRESH,
  })
  const items = list.data?.items ?? []
  return (
    <>
      <ListShell
        label="Product order requests"
        loading={list.isPending}
        error={list.error}
        empty={!items.length}
      >
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-current={item.id === selected ? "true" : undefined}
                onClick={() => onSelect(item.id)}
                className={cn(
                  "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-[var(--hover)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  item.id === selected && "bg-[var(--hover)]",
                )}
              >
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-base font-medium">
                    {item.customerName}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">
                    {item.reference} · {item.lineCount}{" "}
                    {item.lineCount === 1 ? "item" : "items"} ·{" "}
                    {item.fulfilment !== "DELIVERY"
                      ? "Pickup"
                      : // Flagged only once the list carries the saved destination.
                        "deliveryAddress" in item &&
                          !hasDestination(item.deliveryAddress)
                        ? "Delivery · details needed"
                        : "Delivery"}{" "}
                    ·{" "}
                    {new Date(item.createdAt).toLocaleString("en-NG", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone,
                    })}
                  </span>
                </span>
                <span className="grid justify-items-end gap-1">
                  <b className="text-sm font-semibold tabular-nums">
                    {money(
                      item.confirmedOrder?.totalMinor ??
                        item.observedSubtotalMinor,
                      item.currencyCode,
                    )}
                  </b>
                  <Badge className={stageTone(item.stage)}>
                    {stageLabels[item.stage] ?? item.stage}
                  </Badge>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </ListShell>
      <RequestSheet open={Boolean(selected)} onClose={() => onSelect(null)}>
        {selected ? (
          <OrderRequestDetail
            key={selected}
            requestId={selected}
            timeZone={timeZone}
          />
        ) : null}
      </RequestSheet>
    </>
  )
}

function OrderRequestDetail({
  requestId,
  timeZone,
}: { requestId: string; timeZone: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const detail = useQuery({
    ...trpc.storefrontRequests.order.queryOptions({ requestId }),
    ...FRESH,
  })
  const [dialog, setDialog] = useState<{
    action: RespondAction
    initialMessage?: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Blocks a second confirm before the pending state renders; released on failure.
  const confirmLock = useRef(false)
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.storefrontRequests.order.queryKey({ requestId }),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.storefrontRequests.orders.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.storefrontRequests.counts.queryKey(),
      }),
    ])
  const confirm = useMutation(
    trpc.storefrontRequests.confirmOrder.mutationOptions({
      onSuccess: () => {
        setError(null)
        void refresh()
      },
      onError: (failure) => {
        confirmLock.current = false
        setError(errorMessage(failure))
        void refresh()
      },
    }),
  )
  const retry = useMutation(
    trpc.storefrontRequests.retryAlert.mutationOptions({
      onSuccess: () => void refresh(),
    }),
  )
  const data = detail.data
  const draft = useMemo(() => {
    if (!data) return ""
    return storefrontDraftText({
      businessName: data.businessName,
      customerName: data.customerName,
      reference: data.reference,
      kind: "order",
      stage: data.stage,
      fulfilment: data.fulfilment,
      staffResponse: data.staffResponse,
      lines: data.lines.map((line) => ({
        name: line.itemName,
        quantity: line.quantity.replace(/\.?0+$/, ""),
        unitLabel: line.unitLabel,
      })),
      order: data.order
        ? {
            orderNumber: data.order.orderNumber,
            totalMinor: data.order.totalMinor,
            deliveryFeeMinor: data.order.deliveryFeeMinor,
            balanceMinor: data.order.balanceMinor,
            currencyCode: data.order.currencyCode,
            paymentStatus: data.order.paymentStatus,
          }
        : null,
      preferredDate: data.preferredDate,
    })
  }, [data])
  if (detail.isPending)
    return (
      <SheetFrame title="Website order">
        <output className="block text-sm text-muted-foreground">
          Loading request…
        </output>
      </SheetFrame>
    )
  if (!data)
    return (
      <SheetFrame title="Website order">
        <div role="alert">
          <FormFeedback appearance="dashboard">
            {errorMessage(detail.error)}
          </FormFeedback>
        </div>
      </SheetFrame>
    )
  const open =
    data.status === "SUBMITTED" || data.status === "NEEDS_INFORMATION"
  const delivery = data.fulfilment === "delivery"
  const requestedAhead = data.lines.some((line) => line.preorder)
  const busy = confirm.isPending || confirm.isSuccess
  const submitConfirm = (choice: ConfirmChoice) => {
    if (confirmLock.current || busy) return
    confirmLock.current = true
    confirm.mutate({
      requestId,
      expectedRevision: data.revision,
      ...choice,
    })
  }
  const alert = data.alerts.at(-1)
  return (
    <SheetFrame
      title={data.customerName}
      description={data.reference}
      header={
        <Badge className="w-fit" className={stageTone(data.stage)}>
          {stageLabels[data.stage] ?? data.stage}
        </Badge>
      }
    >
      <article className="grid min-w-0 gap-4" aria-label="Website order">
        <header className="grid gap-1">
          <p className="text-sm text-muted-foreground">
            {new Date(data.createdAt).toLocaleString("en-NG", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone,
            })}{" "}
            ·{" "}
            {!delivery
              ? "Pickup"
              : hasDestination(data.deliveryAddress)
                ? `Delivery to ${data.deliveryAddress.trim()}`
                : "Delivery · details needed"}
          </p>
          <p className="text-sm">
            WhatsApp {data.customerPhone}
            {data.customerEmail ? ` · ${data.customerEmail}` : ""}
          </p>
          {requestedAhead || data.preferredDate ? (
            <p className="text-sm text-muted-foreground">
              {[
                requestedAhead ? "Requested ahead" : null,
                data.preferredDate
                  ? `Preferred date ${preferredDay(data.preferredDate)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              {data.order ? "" : " (not reserved until you confirm)"}
            </p>
          ) : null}
        </header>
        {data.notes ? (
          <p className="rounded-[var(--ui-radius-item)] bg-muted/50 p-3 text-sm">
            <b className="font-medium">Customer note: </b>
            {data.notes}
          </p>
        ) : null}
        <ul
          aria-label="Items"
          className="divide-y divide-border rounded-[var(--ui-radius-surface)] border border-border"
        >
          {data.lines.map((line) => {
            const current = data.current.find(
              (entry) => entry.offeringId === line.offeringId,
            )
            const stock = data.order ? (
              <Badge variant="secondary">Reserved</Badge>
            ) : !current?.available ? (
              <Badge variant="destructive">Unavailable</Badge>
            ) : !current.enoughStock ? (
              <Badge variant="destructive">Not enough</Badge>
            ) : line.preorder ? (
              <Badge variant="outline">Requested ahead</Badge>
            ) : current.stock === "unknown" ? (
              <Badge variant="outline">Not tracked</Badge>
            ) : current.stock === "low_stock" ? (
              <Badge variant="outline">Low</Badge>
            ) : (
              <Badge variant="secondary">In stock</Badge>
            )
            return (
              <li
                key={line.offeringId}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 p-3"
              >
                <div className="grid min-w-0">
                  <span className="font-medium">{line.itemName}</span>
                  <span className="text-sm text-muted-foreground">
                    {[
                      line.optionName && line.optionName !== line.itemName
                        ? line.optionName
                        : null,
                      `${line.quantity.replace(/\.?0+$/, "")}${line.unitLabel ? ` ${line.unitLabel}` : ""}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <div className="grid justify-items-end gap-1">
                  <span className="tabular-nums">
                    {money(line.observedUnitPriceMinor, data.currencyCode)}
                  </span>
                  {stock}
                </div>
                {!current?.available ? (
                  <span className="col-span-2 text-sm text-warning-foreground">
                    Not for sale now
                  </span>
                ) : current.priceMinor === null ? (
                  <span className="col-span-2 text-sm text-warning-foreground">
                    No fixed price now
                  </span>
                ) : current.priceChanged ? (
                  <span className="col-span-2 text-sm font-medium text-warning-foreground">
                    Now {money(current.priceMinor, data.currencyCode)}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Not confirmed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {data.order ? (
          <div className="grid gap-3 rounded-[var(--ui-radius-surface)] border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="font-medium">Order {data.order.orderNumber}</b>
              <Badge variant="secondary">
                {data.order.paymentStatus === "PAID"
                  ? "Paid"
                  : data.order.paidMinor > 0
                    ? "Part paid"
                    : data.order.paymentReport?.status === "SUBMITTED"
                      ? "Payment to check"
                      : "Not paid"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Total {money(data.order.totalMinor, data.order.currencyCode)}
              {!delivery
                ? ""
                : data.order.deliveryFeeMinor === 0
                  ? " (free delivery)"
                  : ` (includes ${money(data.order.deliveryFeeMinor, data.order.currencyCode)} delivery)`}{" "}
              · Balance{" "}
              {money(data.order.balanceMinor, data.order.currencyCode)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                className={buttonVariants({ variant: "default" })}
                href={`/sales/orders/${data.orderId}`}
              >
                Open order to request payment or fulfil
              </Link>
              {data.order.paymentReport?.status === "SUBMITTED" ? (
                <Link
                  className={buttonVariants({ variant: "outline" })}
                  href="/finance/payments"
                >
                  Check reported payment
                </Link>
              ) : null}
            </div>
          </div>
        ) : open ? (
          <ConfirmOrderPanel
            data={data}
            busy={busy}
            pending={confirm.isPending}
            onConfirm={submitConfirm}
            onRespond={(action, initialMessage) =>
              setDialog({ action, initialMessage })
            }
          />
        ) : data.staffResponse ? (
          <p className="text-sm text-muted-foreground">
            Your reply: {data.staffResponse}
          </p>
        ) : null}
        {data.messages.length ? (
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">Messages</h3>
            <ul className="grid gap-2">
              {data.messages.map((message) => (
                <li
                  key={message.id}
                  className={cn(
                    "rounded-[var(--ui-radius-item)] p-3 text-sm",
                    message.author === "business"
                      ? "bg-muted/60"
                      : "border border-border",
                  )}
                >
                  <span className="text-xs text-muted-foreground">
                    {message.author === "business" ? "You" : data.customerName}
                  </span>
                  <p className="whitespace-pre-wrap">{message.body}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <Separator />
        <div className="grid gap-2">
          <h3 className="text-sm font-medium">
            WhatsApp message to {data.customerName}
          </h3>
          <CustomerMessageEditor
            key={`${data.status}:${data.revision}`}
            initialText={draft}
            whatsappUrl={whatsAppDraftUrl(data.customerPhone, draft)}
            recipient={data.customerName}
            noPhoneNote="This request has no WhatsApp number."
          />
        </div>
        {alert ? (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {alertLabels[alert.status] ?? alert.status}
            {alert.lastError ? `: ${alert.lastError}` : ""}
            {alert.status === "FAILED" ? (
              <Button
                size="xs"
                variant="outline"
                disabled={retry.isPending}
                onClick={() => retry.mutate({ alertId: alert.id })}
              >
                Retry alert
              </Button>
            ) : null}
          </p>
        ) : null}
        {dialog ? (
          <RespondDialog
            action={dialog.action}
            initialMessage={dialog.initialMessage}
            customerName={data.customerName}
            onClose={() => setDialog(null)}
            onSubmit={async (message, clientMessageId) => ({
              requestId,
              expectedRevision: data.revision,
              action: dialog.action,
              message,
              clientMessageId,
            })}
            onDone={() => {
              setDialog(null)
              void refresh()
            }}
          />
        ) : null}
      </article>
    </SheetFrame>
  )
}

type OrderDetail = inferRouterOutputs<AppRouter>["storefrontRequests"]["order"]
type RespondAction = "decline" | "request_information"
type ConfirmChoice = {
  deliveryFeeMinor?: number
  deliveryAddress?: string
  acceptCurrentPrices?: boolean
}

/** Items subtotal at today's prices, or null when any line can't be priced exactly. */
function currentSubtotalMinor(data: OrderDetail) {
  let subtotal = 0
  for (const line of data.lines) {
    const price = data.current.find(
      (entry) => entry.offeringId === line.offeringId,
    )?.priceMinor
    const total =
      price === null || price === undefined
        ? null
        : exactLineTotalMinor(price, line.quantity)
    if (total === null) return null
    subtotal += total
  }
  return Number.isSafeInteger(subtotal) ? subtotal : null
}

/**
 * Review for a pending request. Drafts live here, keyed with the selected request,
 * so they never carry over and refetches never overwrite what staff typed.
 */
function ConfirmOrderPanel({
  data,
  busy,
  pending,
  onConfirm,
  onRespond,
}: {
  data: OrderDetail
  busy: boolean
  pending: boolean
  onConfirm: (choice: ConfirmChoice) => void
  onRespond: (action: RespondAction, initialMessage?: string) => void
}) {
  const id = useId()
  const [destinationDraft, setDestinationDraft] = useState<string | null>(null)
  const [fee, setFee] = useState("")
  const [acceptPrices, setAcceptPrices] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const delivery = data.fulfilment === "delivery"
  // Untouched, the field follows the saved request; once typed, the draft wins.
  const destination = destinationDraft ?? data.deliveryAddress ?? ""
  const destinationReady = hasDestination(destination)
  const destinationLength = destination.trim().length
  const feeMinor = !delivery
    ? 0
    : destinationReady
      ? parseMoneyInput(fee)
      : null
  const priceChanged = data.current.some((line) => line.priceChanged)
  const unavailable = data.current.some(
    (line) => !line.available || line.priceMinor === null,
  )
  const short = data.current.some((line) => !line.enoughStock)
  const subtotal = currentSubtotalMinor(data)
  const total =
    subtotal !== null &&
    feeMinor !== null &&
    Number.isSafeInteger(subtotal + feeMinor)
      ? subtotal + feeMinor
      : null
  const blocked =
    busy ||
    unavailable ||
    short ||
    total === null ||
    (delivery && !destinationReady) ||
    (priceChanged && !acceptPrices)
  const askForDestination = `Please share the delivery address or a landmark for your order ${data.reference}.`
  return (
    <div className="grid gap-3 rounded-[var(--ui-radius-surface)] border border-border p-4">
      {delivery && !hasDestination(data.deliveryAddress) ? (
        <Alert>
          <AlertTitle>Delivery details needed</AlertTitle>
          <AlertDescription className="grid justify-items-start gap-2">
            Ask the customer for an address or location before setting the
            delivery fee.
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                onRespond("request_information", askForDestination)
              }
            >
              Ask for details
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {delivery ? (
        <>
          <Field
            data-invalid={
              destinationDraft !== null &&
              destinationLength > 0 &&
              !destinationReady
                ? true
                : undefined
            }
          >
            <FieldLabel htmlFor={`${id}-destination`}>
              Delivery destination
            </FieldLabel>
            <Textarea
              id={`${id}-destination`}
              rows={2}
              value={destination}
              disabled={busy}
              placeholder="Street address or a landmark"
              onChange={(event) => setDestinationDraft(event.target.value)}
            />
            {destinationDraft !== null &&
            destinationLength > 0 &&
            !destinationReady ? (
              <FieldError>
                {destinationLength > 300
                  ? "Keep the destination under 300 characters."
                  : "Add a little more detail, like a street or landmark."}
              </FieldError>
            ) : null}
          </Field>
          <Field
            data-invalid={
              destinationReady && fee && feeMinor === null ? true : undefined
            }
          >
            <FieldLabel htmlFor={`${id}-fee`}>Delivery fee</FieldLabel>
            <Input
              id={`${id}-fee`}
              inputMode="decimal"
              value={fee}
              disabled={busy || !destinationReady}
              onChange={(event) => setFee(event.target.value)}
              className="max-w-40"
            />
            <FieldDescription>
              {destinationReady
                ? "Use 0 for free delivery. Added to the order total."
                : "Add a destination first."}
            </FieldDescription>
            {destinationReady && fee && feeMinor === null ? (
              <FieldError>Enter an amount like 1500.</FieldError>
            ) : null}
          </Field>
        </>
      ) : null}
      {priceChanged ? (
        <Field orientation="horizontal">
          <Checkbox
            id={`${id}-prices`}
            checked={acceptPrices}
            disabled={busy}
            onCheckedChange={(value) => setAcceptPrices(value === true)}
          />
          <FieldLabel htmlFor={`${id}-prices`}>
            Prices changed since the customer sent this. Confirm at today's
            prices (tell the customer).
          </FieldLabel>
        </Field>
      ) : null}
      {unavailable || short || subtotal === null ? (
        <p className="text-sm text-warning-foreground">
          {unavailable ? "Some items can't be sold now. " : ""}
          {short
            ? "Recorded stock isn't enough for some items. Update stock or ask the customer. "
            : ""}
          {!unavailable && subtotal === null
            ? "A quantity doesn't come to a whole price. Ask the customer."
            : ""}
        </p>
      ) : null}
      <dl className="grid max-w-80 gap-1 text-sm">
        <QuoteRow
          label="Items subtotal"
          value={subtotal === null ? "—" : money(subtotal, data.currencyCode)}
        />
        {delivery ? (
          <QuoteRow
            label="Delivery fee"
            value={
              feeMinor === null
                ? "—"
                : feeMinor === 0
                  ? "Free"
                  : money(feeMinor, data.currencyCode)
            }
          />
        ) : null}
        <QuoteRow
          strong
          label="Total"
          value={total === null ? "—" : money(total, data.currencyCode)}
        />
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={blocked}
          onClick={() => {
            if (!blocked) setConfirming(true)
          }}
        >
          {pending ? <Spinner /> : null}
          {total === null
            ? "Confirm order"
            : `Confirm order · ${money(total, data.currencyCode)}`}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => onRespond("request_information")}
        >
          Ask for details
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => onRespond("decline")}
        >
          Decline
        </Button>
      </div>
      <ConfirmAlert
        open={confirming && !blocked}
        title={`Confirm ${total === null ? "this" : money(total, data.currencyCode)} order for ${data.customerName}?`}
        description={`This creates the order and holds the stock${delivery ? " for delivery" : " for pickup"}. Nothing is charged yet.`}
        action={
          total === null
            ? "Confirm order"
            : `Confirm ${money(total, data.currencyCode)}`
        }
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          onConfirm({
            ...(delivery && feeMinor !== null
              ? {
                  deliveryFeeMinor: feeMinor,
                  deliveryAddress: destination.trim(),
                }
              : {}),
            ...(priceChanged ? { acceptCurrentPrices: acceptPrices } : {}),
          })
        }}
      />
    </div>
  )
}

function QuoteRow({
  label,
  value,
  strong,
}: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className={strong ? "font-medium" : "text-muted-foreground"}>
        {label}
      </dt>
      <dd className={cn("tabular-nums", strong && "font-semibold")}>{value}</dd>
    </div>
  )
}

function RespondDialog({
  action,
  initialMessage,
  customerName,
  onClose,
  onSubmit,
  onDone,
}: {
  action: RespondAction
  /** Optional starting text; staff can edit it before sending. */
  initialMessage?: string
  customerName: string
  onClose: () => void
  onSubmit: (
    message: string,
    clientMessageId: string,
  ) => Promise<{
    requestId: string
    expectedRevision: number
    action: RespondAction
    message: string
    clientMessageId: string
  }>
  onDone: () => void
}) {
  const trpc = useTRPC()
  const id = useId()
  const [message, setMessage] = useState(initialMessage ?? "")
  const [clientMessageId] = useState(() => crypto.randomUUID())
  const respond = useMutation(
    trpc.storefrontRequests.respondOrder.mutationOptions({ onSuccess: onDone }),
  )
  const decline = action === "decline"
  const field = (
    <Field data-invalid={respond.isError ? true : undefined}>
      <FieldLabel htmlFor={id}>
        {decline ? "Reason" : "Your question"}
      </FieldLabel>
      <Textarea
        id={id}
        rows={4}
        maxLength={800}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />
      {respond.isError ? (
        <FieldError>{errorMessage(respond.error)}</FieldError>
      ) : null}
    </Field>
  )
  const send = async () =>
    respond.mutate(await onSubmit(message.trim(), clientMessageId))
  if (decline)
    return (
      <ConfirmAlert
        open
        title={`Decline ${customerName}’s request?`}
        description={`${customerName} sees your reason on their receipt. No order is created.`}
        action="Decline request"
        cancelLabel="Keep request"
        danger
        pending={respond.isPending}
        disabled={message.trim().length < 3}
        onCancel={onClose}
        onConfirm={() => void send()}
      >
        {field}
      </ConfirmAlert>
    )
  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ask {customerName} for details</DialogTitle>
          <DialogDescription>
            They see your question on their receipt and can reply there.
          </DialogDescription>
        </DialogHeader>
        {field}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={respond.isPending || message.trim().length < 3}
            onClick={() => void send()}
          >
            {respond.isPending ? <Spinner /> : null}
            Send question
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- Services

function ServiceRequests({
  filter,
  selected,
  onSelect,
  onShowAll,
  timeZone,
}: {
  filter: (typeof filters)[number]
  selected: string | null
  onSelect: (id: string | null) => void
  onShowAll: () => void
  timeZone: string
}) {
  const trpc = useTRPC()
  const list = useQuery({
    ...trpc.storefrontRequests.services.queryOptions({
      filter: filter === "confirmed" ? "quoted" : filter,
    }),
    ...FRESH,
  })
  const items = list.data?.items ?? []
  const current = items.find((item) => item.id === selected)
  return (
    <>
      <ListShell
        label="Service requests"
        loading={list.isPending}
        error={list.error}
        empty={!items.length}
      >
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-current={item.id === selected ? "true" : undefined}
                onClick={() => onSelect(item.id)}
                className={cn(
                  "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-[var(--hover)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  item.id === selected && "bg-[var(--hover)]",
                )}
              >
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-base font-medium">
                    {item.serviceRequest.customerName}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">
                    {item.reference} ·{" "}
                    {[
                      ...new Set(
                        item.serviceRequest.lines.map(
                          (line) => line.offering.catalogItem.name,
                        ),
                      ),
                    ].join(", ")}{" "}
                    ·{" "}
                    {new Date(item.createdAt).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      timeZone,
                    })}
                  </span>
                </span>
                <Badge className={stageTone(item.stage)}>
                  {stageLabels[item.stage] ?? item.stage}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      </ListShell>
      <RequestSheet open={Boolean(selected)} onClose={() => onSelect(null)}>
        {current ? (
          <ServiceRequestDetail key={current.id} item={current} />
        ) : selected && list.isSuccess ? (
          <SheetFrame title="Service request">
            <output className="grid justify-items-start gap-2 text-sm">
              <b className="font-medium">This request moved</b>
              <span className="text-muted-foreground">
                It changed stage, so it isn’t under this filter now.
              </span>
              {filter !== "all" ? (
                <Button variant="outline" onClick={onShowAll}>
                  Show it under All
                </Button>
              ) : null}
            </output>
          </SheetFrame>
        ) : (
          <SheetFrame title="Service request">
            <output className="text-sm text-muted-foreground">Loading…</output>
          </SheetFrame>
        )}
      </RequestSheet>
    </>
  )
}

type ServiceItem =
  inferRouterOutputs<AppRouter>["storefrontRequests"]["services"]["items"][number]
type ServiceLine = ServiceItem["serviceRequest"]["lines"][number]

function ServiceRequestDetail({ item }: { item: ServiceItem }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const request = item.serviceRequest
  const storeId = item.serviceRequest.storeId
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      request.lines.map((line: ServiceLine) => [
        line.offeringId,
        line.offering.fixedPriceMinor !== null &&
        line.offering.pricingPolicy === "FIXED"
          ? String(line.offering.fixedPriceMinor / 100)
          : "",
      ]),
    ),
  )
  const [fee, setFee] = useState("0")
  const [note, setNote] = useState("")
  const [dialog, setDialog] = useState<
    "decline" | "request_information" | null
  >(null)
  const [confirm, setConfirm] = useState<"quote" | "accept" | null>(null)
  const [message, setMessage] = useState("")
  const [clientIds] = useState(() => ({
    quote: `sfq-${crypto.randomUUID()}`,
    accept: `sfa-${crypto.randomUUID()}`,
    message: crypto.randomUUID(),
  }))
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.storefrontRequests.services.queryKey(),
    })
  const issue = useMutation(
    trpc.storefrontRequests.issueServiceQuote.mutationOptions({
      onSuccess: () => void refresh(),
      onSettled: () => setConfirm(null),
    }),
  )
  const accept = useMutation(
    trpc.storefrontRequests.recordServiceQuoteAcceptance.mutationOptions({
      onSuccess: () => void refresh(),
      onSettled: () => setConfirm(null),
    }),
  )
  const respond = useMutation(
    trpc.storefrontRequests.respondService.mutationOptions({
      onSuccess: () => {
        setDialog(null)
        void refresh()
      },
    }),
  )
  const currency = request.lines[0]?.offering.currencyCode ?? "NGN"
  const lines = request.lines.map((line: ServiceLine) => ({
    offeringId: line.offeringId as string,
    quantity: String(line.requestedQuantity),
    unitPriceMinor: parseMoneyInput(prices[line.offeringId] ?? ""),
  }))
  const feeMinor = parseMoneyInput(fee)
  const total =
    lines.reduce(
      (
        sum: number,
        line: { unitPriceMinor: number | null; quantity: string },
      ) => sum + (line.unitPriceMinor ?? 0) * Number(line.quantity),
      0,
    ) + (feeMinor ?? 0)
  const quote = item.quote
  const open =
    request.status === "SUBMITTED" || request.status === "NEEDS_INFORMATION"
  const preference = request.requestedAt
    ? servicePreference(
        request.requestedAt,
        item.preferredTime ?? null,
        item.preferenceTimezone ?? null,
      )
    : null
  const draft = storefrontDraftText({
    businessName: "",
    customerName: request.customerName,
    reference: item.reference,
    kind: "service",
    stage: item.stage,
    staffResponse: request.staffResponse,
    lines: request.lines.map((line: ServiceLine) => ({
      name: line.offering.catalogItem.name,
      quantity: String(line.requestedQuantity).replace(/\.?0+$/, ""),
    })),
    quote: quote
      ? {
          totalMinor: quote.totalMinor,
          currencyCode: quote.currencyCode,
          expiresAt: quote.expiresAt
            ? new Date(quote.expiresAt).toISOString()
            : null,
        }
      : null,
    preferredDate: preference
      ? [preference.iso, preference.clock].filter(Boolean).join(" ")
      : null,
  }).replace("this is .", "here.")
  return (
    <SheetFrame
      title={request.customerName}
      description={item.reference}
      header={
        <Badge className="w-fit" className={stageTone(item.stage)}>
          {stageLabels[item.stage] ?? item.stage}
        </Badge>
      }
    >
      <article className="grid min-w-0 gap-4" aria-label="Service request">
        <header className="grid gap-1">
          <p className="text-sm">
            WhatsApp {item.customerPhoneE164 ?? request.customerPhone}
          </p>
          {preference ? (
            <p className="text-sm text-muted-foreground">
              Preferred date {preference.day}
              {preference.clock ? `, ${preference.clock}` : ""} (not booked)
            </p>
          ) : null}
          {item.collectionAddress ? (
            <p className="text-sm text-muted-foreground">
              Collect from: {item.collectionAddress}
            </p>
          ) : null}
        </header>
        {request.details ? (
          <p className="rounded-[var(--ui-radius-item)] bg-muted/50 p-3 text-sm">
            {request.details}
          </p>
        ) : null}
        {issue.isError || accept.isError || respond.isError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {errorMessage(issue.error ?? accept.error ?? respond.error)}
            </AlertDescription>
          </Alert>
        ) : null}
        {quote && quote.status === "ISSUED" ? (
          <div className="grid gap-2 rounded-[var(--ui-radius-surface)] border border-border p-4">
            <b className="font-medium">
              Quote sent · {money(quote.totalMinor, quote.currencyCode)}
            </b>
            <p className="text-sm text-muted-foreground">
              The customer can accept on their receipt. If they accepted on
              WhatsApp, record it here: this creates the order.
            </p>
            <Button
              className="w-fit"
              disabled={accept.isPending}
              onClick={() => setConfirm("accept")}
            >
              {accept.isPending ? <Spinner /> : null}
              Record acceptance from WhatsApp
            </Button>
          </div>
        ) : quote?.acceptedOrderId ? (
          <div className="grid gap-2 rounded-[var(--ui-radius-surface)] border border-border p-4">
            <b className="font-medium">Quote accepted · order created</b>
            <Link
              className={buttonVariants({ className: "w-fit" })}
              href={`/sales/orders/${quote.acceptedOrderId}`}
            >
              Open order to request payment or schedule
            </Link>
          </div>
        ) : open ? (
          <div className="grid gap-3 rounded-[var(--ui-radius-surface)] border border-border p-4">
            <h3 className="font-medium">Price and send a quote</h3>
            <ul className="grid gap-3">
              {request.lines.map((line: ServiceLine) => (
                <li
                  key={line.offeringId}
                  className="grid grid-cols-[minmax(0,1fr)_8.5rem] items-end gap-3"
                >
                  <div className="grid min-w-0 pb-2.5">
                    <span className="font-medium">
                      {line.offering.catalogItem.name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {[
                        (line.variantName || line.offeringName) !==
                        line.offering.catalogItem.name
                          ? line.variantName || line.offeringName
                          : null,
                        `× ${String(line.requestedQuantity).replace(/\.?0+$/, "")}`,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </span>
                  </div>
                  <Field>
                    <FieldLabel htmlFor={`${item.id}-${line.offeringId}-price`}>
                      Price each
                    </FieldLabel>
                    <Input
                      id={`${item.id}-${line.offeringId}-price`}
                      inputMode="decimal"
                      className="text-right tabular-nums"
                      value={prices[line.offeringId] ?? ""}
                      onChange={(event) =>
                        setPrices((current) => ({
                          ...current,
                          [line.offeringId]: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-4">
              <Field className="max-w-48">
                <FieldLabel htmlFor={`${item.id}-fee`}>
                  Collection or delivery fee
                </FieldLabel>
                <Input
                  id={`${item.id}-fee`}
                  inputMode="decimal"
                  value={fee}
                  onChange={(event) => setFee(event.target.value)}
                />
              </Field>
              <Field className="min-w-60 flex-1">
                <FieldLabel htmlFor={`${item.id}-note`}>
                  Note for the customer (optional)
                </FieldLabel>
                <Input
                  id={`${item.id}-note`}
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </Field>
            </div>
            <p className="text-sm">
              Quote total <b>{money(Math.round(total), currency)}</b>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  issue.isPending ||
                  !storeId ||
                  lines.some(
                    (line: { unitPriceMinor: number | null }) =>
                      line.unitPriceMinor === null,
                  ) ||
                  feeMinor === null
                }
                onClick={() => setConfirm("quote")}
              >
                {issue.isPending ? <Spinner /> : null}
                Send quote
              </Button>
              <Button
                variant="outline"
                onClick={() => setDialog("request_information")}
              >
                Ask for details
              </Button>
              <Button variant="outline" onClick={() => setDialog("decline")}>
                Decline
              </Button>
            </div>
          </div>
        ) : request.staffResponse ? (
          <p className="text-sm text-muted-foreground">
            Your reply: {request.staffResponse}
          </p>
        ) : null}
        {item.messages.length ? (
          <ul className="grid gap-2">
            {item.messages.map((entry: ServiceItem["messages"][number]) => (
              <li
                key={entry.id}
                className={cn(
                  "rounded-[var(--ui-radius-item)] p-3 text-sm",
                  entry.author === "STAFF"
                    ? "bg-muted/60"
                    : "border border-border",
                )}
              >
                <span className="text-xs text-muted-foreground">
                  {entry.author === "STAFF" ? "You" : request.customerName}
                </span>
                <p className="whitespace-pre-wrap">{entry.body}</p>
              </li>
            ))}
          </ul>
        ) : null}
        <Separator />
        <div className="grid gap-2">
          <h3 className="text-sm font-medium">
            WhatsApp message to {request.customerName}
          </h3>
          <CustomerMessageEditor
            key={`${item.stage}:${request.revision}`}
            initialText={draft}
            whatsappUrl={whatsAppDraftUrl(item.customerPhoneE164, draft)}
            recipient={request.customerName}
            noPhoneNote="This request has no WhatsApp number."
          />
        </div>
        <ConfirmAlert
          open={confirm === "quote"}
          title={`Send a ${money(Math.round(total), currency)} quote to ${request.customerName}?`}
          description={`${request.customerName} sees it on their receipt and can accept it for 7 days. Nothing is charged now.`}
          action={`Send ${money(Math.round(total), currency)} quote`}
          pending={issue.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            issue.mutate({
              requestId: request.id,
              storeId: storeId as string,
              clientQuoteId: clientIds.quote,
              lines: lines.map(
                (line: {
                  offeringId: string
                  quantity: string
                  unitPriceMinor: number | null
                }) => ({
                  offeringId: line.offeringId,
                  quantity: line.quantity,
                  unitPriceMinor: line.unitPriceMinor ?? 0,
                }),
              ),
              feeMinor: feeMinor ?? 0,
              ...(note.trim() ? { note: note.trim() } : {}),
              expiresInDays: 7,
            })
          }
        />
        {quote ? (
          <ConfirmAlert
            open={confirm === "accept"}
            title={`Record that ${request.customerName} accepted ${money(quote.totalMinor, quote.currencyCode)}?`}
            description="This creates the order. Only do this if they accepted on WhatsApp."
            action="Record acceptance"
            pending={accept.isPending}
            onCancel={() => setConfirm(null)}
            onConfirm={() =>
              accept.mutate({
                requestId: request.id,
                clientAcceptanceId: clientIds.accept,
              })
            }
          />
        ) : null}
        <ConfirmAlert
          open={dialog === "decline"}
          title={`Decline ${request.customerName}’s request?`}
          description={`${request.customerName} sees your reason on their receipt.`}
          action="Decline request"
          cancelLabel="Keep request"
          danger
          pending={respond.isPending}
          disabled={message.trim().length < 3 || !storeId}
          onCancel={() => setDialog(null)}
          onConfirm={() =>
            respond.mutate({
              requestId: request.id,
              storeId: storeId as string,
              expectedRevision: request.revision,
              action: "decline",
              message: message.trim(),
              clientMessageId: clientIds.message,
            })
          }
        >
          <Field>
            <FieldLabel htmlFor={`${item.id}-reason`}>Reason</FieldLabel>
            <Textarea
              id={`${item.id}-reason`}
              rows={4}
              maxLength={800}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </Field>
        </ConfirmAlert>
        {dialog === "request_information" ? (
          <Dialog open onOpenChange={(value) => !value && setDialog(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  Ask {request.customerName} for details
                </DialogTitle>
                <DialogDescription>
                  They see this on their receipt and can reply there.
                </DialogDescription>
              </DialogHeader>
              <Field>
                <FieldLabel htmlFor={`${item.id}-message`}>
                  Your question
                </FieldLabel>
                <Textarea
                  id={`${item.id}-message`}
                  rows={4}
                  maxLength={800}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
              </Field>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={
                    respond.isPending || message.trim().length < 3 || !storeId
                  }
                  onClick={() =>
                    respond.mutate({
                      requestId: request.id,
                      storeId: storeId as string,
                      expectedRevision: request.revision,
                      action: "request_information",
                      message: message.trim(),
                      clientMessageId: clientIds.message,
                    })
                  }
                >
                  {respond.isPending ? <Spinner /> : null}
                  Send question
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </article>
    </SheetFrame>
  )
}
