"use client"

import { CustomerMessageEditor } from "@/components/business-banking/customer-message-editor"
import { FormFeedback } from "@/components/forms/form-feedback"
import { PageHeader } from "@/components/page-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { useTRPC } from "@/trpc/client"
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
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  buttonVariants,
  cn,
} from "@ewatrade/ui"
import { multiplyExactDecimals } from "@ewatrade/utils/exact-decimal"
import { ArrowLeft01Icon, InboxIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { inferRouterOutputs } from "@trpc/server"
import Link from "next/link"
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs"
import { useId, useMemo, useRef, useState } from "react"
import {
  alertLabels,
  money,
  parseMoneyInput,
  stageLabels,
  storefrontDraftText,
  whatsAppDraftUrl,
} from "./storefront-requests-model"

const FRESH = { staleTime: 0, refetchOnMount: "always" as const, retry: false }
const kinds = ["products", "services"] as const
const filters = ["open", "confirmed", "closed", "all"] as const

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
 * Requests customers sent from the business website. Product requests are pending
 * until confirmed here; confirming creates the canonical Order and reserves stock.
 */
export function StorefrontRequestsInbox({ timeZone }: { timeZone: string }) {
  const [kind, setKind] = useQueryState(
    "kind",
    parseAsStringLiteral(kinds).withDefault("products"),
  )
  const [filter, setFilter] = useQueryState(
    "show",
    parseAsStringLiteral(filters).withDefault("open"),
  )
  const [selected, setSelected] = useQueryState("request", parseAsString)
  const trpc = useTRPC()
  const counts = useQuery({
    ...trpc.storefrontRequests.counts.queryOptions(),
    ...FRESH,
    refetchInterval: 30_000,
  })
  return (
    <ScrollableContent>
      <div className="grid min-w-0 gap-6 pt-6 pb-24">
        <PageHeader
          eyebrow="Website"
          title="Website requests"
          description="Orders and service requests customers sent from your storefront. Nothing is charged until you confirm."
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            value={kind}
            onValueChange={(value) => {
              void setKind(value as (typeof kinds)[number])
              void setSelected(null)
              void setFilter("open")
            }}
          >
            <TabsList aria-label="Request type">
              <TabsTrigger value="products">
                Product orders
                {counts.data?.orders ? ` · ${counts.data.orders}` : ""}
              </TabsTrigger>
              <TabsTrigger value="services">
                Service requests
                {counts.data?.services ? ` · ${counts.data.services}` : ""}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs
            value={filter}
            onValueChange={(value) => {
              void setFilter(value as (typeof filters)[number])
              void setSelected(null)
            }}
          >
            <TabsList aria-label="Show">
              <TabsTrigger value="open">To review</TabsTrigger>
              <TabsTrigger value="confirmed">
                {kind === "products" ? "Confirmed" : "Quoted"}
              </TabsTrigger>
              <TabsTrigger value="closed">Closed</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
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

function ListShell({
  label,
  selected,
  loading,
  error,
  empty,
  children,
}: {
  label: string
  selected: boolean
  loading: boolean
  error: unknown
  empty: boolean
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        "grid min-w-0 content-start rounded-xl border border-border",
        selected && "max-lg:hidden",
      )}
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
          <span className="text-muted-foreground">
            New requests from your website appear here.
          </span>
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
    refetchInterval: 30_000,
  })
  const items = list.data?.items ?? []
  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
      <ListShell
        label="Product order requests"
        selected={Boolean(selected)}
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
                  "flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  item.id === selected && "bg-muted",
                )}
              >
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-sm font-medium">
                    {item.customerName}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
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
                  <Badge
                    variant={item.stage === "received" ? "default" : "outline"}
                  >
                    {stageLabels[item.stage] ?? item.stage}
                  </Badge>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </ListShell>
      {selected ? (
        <OrderRequestDetail
          key={selected}
          requestId={selected}
          onBack={() => onSelect(null)}
          timeZone={timeZone}
        />
      ) : null}
    </div>
  )
}

function OrderRequestDetail({
  requestId,
  onBack,
  timeZone,
}: { requestId: string; onBack: () => void; timeZone: string }) {
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
      <output className="block rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
        Loading request…
      </output>
    )
  if (!data)
    return (
      <div role="alert" className="rounded-xl border border-border p-4">
        <FormFeedback appearance="dashboard">
          {errorMessage(detail.error)}
        </FormFeedback>
      </div>
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
    <article
      className="grid min-w-0 gap-4 rounded-xl border border-border p-4 sm:p-5"
      aria-labelledby="sr-title"
    >
      <Button variant="ghost" className="w-fit lg:hidden" onClick={onBack}>
        <HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden /> All requests
      </Button>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="sr-title" className="text-lg font-semibold">
            {data.customerName} · {data.reference}
          </h2>
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
        </div>
        <Badge variant={data.stage === "received" ? "default" : "outline"}>
          {stageLabels[data.stage] ?? data.stage}
        </Badge>
      </header>
      {data.notes ? (
        <p className="rounded-lg bg-muted/50 p-3 text-sm">
          <b className="font-medium">Customer note: </b>
          {data.notes}
        </p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Customer saw</TableHead>
            <TableHead className="text-right">Now</TableHead>
            <TableHead>Stock</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.lines.map((line) => {
            const current = data.current.find(
              (entry) => entry.offeringId === line.offeringId,
            )
            return (
              <TableRow key={line.offeringId}>
                <TableCell className="max-w-56 whitespace-normal">
                  {line.itemName}
                  {line.optionName && line.optionName !== line.itemName ? (
                    <span className="block text-xs text-muted-foreground">
                      {line.optionName}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.quantity.replace(/\.?0+$/, "")}
                  {line.unitLabel ? ` ${line.unitLabel}` : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(line.observedUnitPriceMinor, data.currencyCode)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    current?.priceChanged && "font-semibold text-amber-700",
                  )}
                >
                  {!current?.available
                    ? "Not for sale"
                    : current.priceMinor === null
                      ? "No fixed price"
                      : money(current.priceMinor, data.currencyCode)}
                </TableCell>
                <TableCell>
                  {data.order ? (
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
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Not confirmed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {data.order ? (
        <div className="grid gap-3 rounded-lg border border-border p-4">
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
            · Balance {money(data.order.balanceMinor, data.order.currencyCode)}
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
                  "rounded-lg p-3 text-sm",
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
        <p className="text-xs text-muted-foreground">
          Review and edit. Opening WhatsApp doesn't send it: you press Send
          there.
        </p>
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
    <div className="grid gap-3 rounded-lg border border-border p-4">
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
      <p className="text-sm">
        Confirming creates an order for {data.customerName} and reserves the
        stock.
      </p>
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
        <p className="text-sm text-amber-800">
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
            if (blocked) return
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
  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {decline ? "Decline this request" : "Ask for details"}
          </DialogTitle>
          <DialogDescription>
            {decline
              ? `${customerName} sees your reason on their receipt. No order is created.`
              : `${customerName} sees your question on their receipt and can reply there.`}
          </DialogDescription>
        </DialogHeader>
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
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={decline ? "destructive" : "default"}
            disabled={respond.isPending || message.trim().length < 3}
            onClick={async () =>
              respond.mutate(await onSubmit(message.trim(), clientMessageId))
            }
          >
            {respond.isPending ? <Spinner /> : null}
            {decline ? "Decline request" : "Send question"}
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
    refetchInterval: 30_000,
  })
  const items = list.data?.items ?? []
  const current = items.find((item) => item.id === selected)
  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
      <ListShell
        label="Service requests"
        selected={Boolean(selected)}
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
                  "flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  item.id === selected && "bg-muted",
                )}
              >
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-sm font-medium">
                    {item.serviceRequest.customerName}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
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
                <Badge
                  variant={item.stage === "received" ? "default" : "outline"}
                >
                  {stageLabels[item.stage] ?? item.stage}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      </ListShell>
      {current ? (
        <ServiceRequestDetail item={current} onBack={() => onSelect(null)} />
      ) : selected && list.isSuccess ? (
        <output className="grid justify-items-start gap-2 rounded-xl border border-border p-4 text-sm">
          <b className="font-medium">This request moved</b>
          <span className="text-muted-foreground">
            It changed stage, so it no longer matches this filter.
          </span>
          {filter !== "all" ? (
            <Button variant="outline" size="sm" onClick={onShowAll}>
              Show it under All
            </Button>
          ) : null}
        </output>
      ) : null}
    </div>
  )
}

type ServiceItem =
  inferRouterOutputs<AppRouter>["storefrontRequests"]["services"]["items"][number]
type ServiceLine = ServiceItem["serviceRequest"]["lines"][number]

function ServiceRequestDetail({
  item,
  onBack,
}: { item: ServiceItem; onBack: () => void }) {
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
    }),
  )
  const accept = useMutation(
    trpc.storefrontRequests.recordServiceQuoteAcceptance.mutationOptions({
      onSuccess: () => void refresh(),
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
    preferredDate: request.requestedAt
      ? new Date(request.requestedAt).toISOString().slice(0, 10)
      : null,
  }).replace("this is .", "here.")
  return (
    <article className="grid min-w-0 gap-4 rounded-xl border border-border p-4 sm:p-5">
      <Button variant="ghost" className="w-fit lg:hidden" onClick={onBack}>
        <HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden /> All requests
      </Button>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold">
            {request.customerName} · {item.reference}
          </h2>
          <p className="text-sm">
            WhatsApp {item.customerPhoneE164 ?? request.customerPhone}
          </p>
          {request.requestedAt ? (
            <p className="text-sm text-muted-foreground">
              Preferred date{" "}
              {new Date(request.requestedAt).toLocaleDateString("en-NG", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}{" "}
              (not booked)
            </p>
          ) : null}
          {item.collectionAddress ? (
            <p className="text-sm text-muted-foreground">
              Collect from: {item.collectionAddress}
            </p>
          ) : null}
        </div>
        <Badge variant={item.stage === "received" ? "default" : "outline"}>
          {stageLabels[item.stage] ?? item.stage}
        </Badge>
      </header>
      {request.details ? (
        <p className="rounded-lg bg-muted/50 p-3 text-sm">{request.details}</p>
      ) : null}
      {issue.isError || accept.isError || respond.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {errorMessage(issue.error ?? accept.error ?? respond.error)}
          </AlertDescription>
        </Alert>
      ) : null}
      {quote && quote.status === "ISSUED" ? (
        <div className="grid gap-2 rounded-lg border border-border p-4">
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
            onClick={() =>
              accept.mutate({
                requestId: request.id,
                clientAcceptanceId: clientIds.accept,
              })
            }
          >
            {accept.isPending ? <Spinner /> : null}
            Record acceptance from WhatsApp
          </Button>
        </div>
      ) : quote?.acceptedOrderId ? (
        <div className="grid gap-2 rounded-lg border border-border p-4">
          <b className="font-medium">Quote accepted · order created</b>
          <Link
            className={buttonVariants({ className: "w-fit" })}
            href={`/sales/orders/${quote.acceptedOrderId}`}
          >
            Open order to request payment or schedule
          </Link>
        </div>
      ) : open ? (
        <div className="grid gap-3 rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium">
            Price each item and send a quote
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {request.lines.map((line: ServiceLine) => (
                <TableRow key={line.offeringId}>
                  <TableCell className="whitespace-normal">
                    {line.offering.catalogItem.name}
                    <span className="block text-xs text-muted-foreground">
                      {line.variantName || line.offeringName}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {String(line.requestedQuantity).replace(/\.?0+$/, "")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      aria-label={`Unit price for ${line.offering.catalogItem.name}`}
                      inputMode="decimal"
                      className="ml-auto max-w-32 text-right"
                      value={prices[line.offeringId] ?? ""}
                      placeholder={
                        line.offering.pricingPolicy === "FIXED" ? "" : "Price"
                      }
                      onChange={(event) =>
                        setPrices((current) => ({
                          ...current,
                          [line.offeringId]: event.target.value,
                        }))
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
              onClick={() =>
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
                "rounded-lg p-3 text-sm",
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
        <p className="text-xs text-muted-foreground">
          Review and edit. Opening WhatsApp doesn't send it: you press Send
          there.
        </p>
        <CustomerMessageEditor
          key={`${item.stage}:${request.revision}`}
          initialText={draft}
          whatsappUrl={whatsAppDraftUrl(item.customerPhoneE164, draft)}
          recipient={request.customerName}
          noPhoneNote="This request has no WhatsApp number."
        />
      </div>
      {dialog ? (
        <Dialog open onOpenChange={(value) => !value && setDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {dialog === "decline"
                  ? "Decline this request"
                  : "Ask for details"}
              </DialogTitle>
              <DialogDescription>
                {request.customerName} sees this on their receipt.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor={`${item.id}-message`}>
                {dialog === "decline" ? "Reason" : "Your question"}
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
                variant={dialog === "decline" ? "destructive" : "default"}
                disabled={
                  respond.isPending || message.trim().length < 3 || !storeId
                }
                onClick={() =>
                  respond.mutate({
                    requestId: request.id,
                    storeId: storeId as string,
                    expectedRevision: request.revision,
                    action: dialog,
                    message: message.trim(),
                    clientMessageId: clientIds.message,
                  })
                }
              >
                {respond.isPending ? <Spinner /> : null}
                {dialog === "decline" ? "Decline request" : "Send question"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </article>
  )
}
