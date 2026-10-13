"use client"

import { useCanCreateCatalogItems } from "@/components/catalog-item/catalog-create-access"
import { FormFeedback } from "@/components/forms/form-feedback"
import {
  requestQuickAssistant,
  useQuickAssistantLauncher,
} from "@/components/page-fab/fab-slot"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { useReceiptParams } from "@/hooks/use-receipt-params"
import { useTRPC } from "@/trpc/client"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@ewatrade/ui"
import { catalogFreeLineCatalogDraft } from "@ewatrade/utils/catalog-free-lines"
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowTurnBackwardIcon,
  ArrowUp01Icon,
  Calendar03Icon,
  Cancel02Icon,
  CreditCardIcon,
  Invoice01Icon,
  PackageIcon,
  PackageReceiveIcon,
  PencilEdit02Icon,
  SparklesIcon,
  SquareLock01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type ReactNode, useState } from "react"
import { orderMoney } from "../order-draft"
import { OrderActivityColumn } from "./order-activity-column"
import {
  CancelOrderDialog,
  CustomerChangeDialog,
  DetailsChangeDialog,
  ItemsChangeDialog,
} from "./order-amend-dialogs"
import {
  OrderApprovalBanners,
  hasOpenOrderApproval,
} from "./order-change-approvals"
import {
  FulfilDialog,
  PaymentDialog,
  RefundDialog,
  ReturnItemsDialog,
} from "./order-money-dialogs"
import {
  type OrderChangeOptions,
  type OverviewOrder,
  canFulfilLine,
  formatOrderDateTime,
  formatQuantity,
  fulfilmentCount,
  isClosedOrder,
  lineDetail,
  lineStatus,
  lineTitle,
  orderAskDraft,
  orderPills,
  readyLines,
} from "./order-overview-model"
import { LockedReason, OverviewCard, Pill } from "./order-overview-parts"
import { useOrderRefresh } from "./use-order-refresh"

type OpenDialog =
  | { kind: "customer" | "details" | "items" | "cancel" }
  | { kind: "payment" | "refund" }
  | { kind: "return"; lineId?: string }
  | { kind: "fulfil"; lineId?: string }

type ChangeKey =
  | "customer"
  | "details"
  | "items"
  | "refund"
  | "returnLine"
  | "cancel"

/** Order number, customer and created time under the title. */
export function orderSubline(order: OverviewOrder, timeZone?: string) {
  return `${order.customerName || "Walk-in customer"} · created ${formatOrderDateTime(order.createdAt, timeZone)}`
}

/** Payment, fulfilment and closed state; a replaced order says by what. */
export function OrderPills({ order }: { order: OverviewOrder }) {
  const trpc = useTRPC()
  const timeline = useQuery(
    trpc.orders.timeline.queryOptions({ orderId: order.id }, { retry: false }),
  )
  const replacedBy = timeline.data?.items.find(
    (item) => item.kind === "replaced",
  )?.linkedOrder
  const pills = orderPills(order).map((pill) =>
    replacedBy && pill.label === "Cancelled"
      ? { ...pill, label: `Replaced by ${replacedBy.orderNumber}` }
      : pill,
  )
  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((pill) => (
        <Pill key={pill.label} tone={pill.tone}>
          {pill.label}
        </Pill>
      ))}
    </div>
  )
}

/**
 * The order overview shared by the order modal and the full order page:
 * actions, totals, items, customer, delivery and the Activity column.
 * `onLeave` closes the modal before the receipt or assistant opens.
 */
export function OrderOverview({
  orderId,
  storeId,
  layout,
  timeZone,
  onOpenOrder,
  onLeave,
}: {
  orderId: string
  storeId: string
  layout: "sheet" | "page"
  /** Business time zone, so times match on server and client. */
  timeZone?: string
  onOpenOrder: (orderId: string) => void
  onLeave?: () => Promise<unknown>
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const refresh = useOrderRefresh(orderId)
  const { setParams: setReceipt } = useReceiptParams()
  const { setParams: setCatalogParams } = useCatalogItemParams()
  const canSaveToCatalog = useCanCreateCatalogItems()
  const [dialog, setDialog] = useState<OpenDialog | null>(null)
  const query = useQuery(
    trpc.orders.get.queryOptions({ orderId }, { retry: false }),
  )
  const changes = useQuery(
    trpc.orders.changeOptions.queryOptions(
      { orderId },
      {
        // Someone waits on a return/refund decision: check back often.
        refetchInterval: (query) =>
          hasOpenOrderApproval(query.state.data) ? 15_000 : false,
        retry: false,
      },
    ),
  )
  // Shown only where the shell offers the quick assistant (not to cashiers).
  const launcher = useQuickAssistantLauncher()
  const assistant = useQuery(
    trpc.assistant.availability.queryOptions(undefined, {
      retry: false,
      staleTime: 60_000,
    }),
  )
  if (query.isPending) return <output aria-live="polite">Loading order…</output>
  if (query.isError)
    return (
      <div role="alert" className="grid gap-3">
        <p>
          This order is unavailable. Check the selected Store and your access.
        </p>
        <Button
          variant="outline"
          className="w-fit"
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
      </div>
    )
  const order = query.data
  if (order.storeId !== storeId)
    return (
      <FormFeedback appearance="dashboard">
        Select this order’s Store to view its details.
      </FormFeedback>
    )

  const closed = isClosedOrder(order.status)
  const ready = readyLines(order)
  const fulfilled = fulfilmentCount(order)
  const options = changes.data
  const option = (key: ChangeKey) =>
    options
      ? { allowed: options[key].allowed, reason: options[key].reason }
      : {
          allowed: false,
          reason: changes.isError
            ? "Couldn’t check. Reopen the order."
            : "Checking…",
        }
  const returnable = options?.returnLine.lines ?? []
  // Whether a refund or return may also lower the total (an order credit).
  const creditOption = options
    ? { allowed: options.credit.allowed, reason: options.credit.reason }
    : { allowed: false, reason: changes.isError ? null : "Checking…" }
  const done = async () => {
    await refresh()
  }
  const close = () => setDialog(null)

  async function leaveThen(action: () => unknown) {
    if (onLeave) {
      await onLeave()
      // Let the modal give focus back before the next surface takes it.
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
    action()
  }

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {!closed && order.balanceDueMinor > 0 ? (
        <Button onClick={() => setDialog({ kind: "payment" })}>
          <HugeiconsIcon icon={CreditCardIcon} className="size-4" />
          Record payment
        </Button>
      ) : null}
      {ready.length ? (
        <Button variant="outline" onClick={() => setDialog({ kind: "fulfil" })}>
          <HugeiconsIcon icon={PackageIcon} className="size-4" />
          {fulfilled.done === 0 ? "Fulfil all" : `Fulfil ${ready.length}`}
        </Button>
      ) : null}
      <Button
        variant="outline"
        onClick={() =>
          void leaveThen(() => setReceipt({ receiptIds: [order.id] }))
        }
      >
        <HugeiconsIcon icon={Invoice01Icon} className="size-4" />
        Receipt
      </Button>
      {launcher && assistant.data?.enabled ? (
        <Button
          className="bg-amber-400 text-amber-950 hover:bg-amber-400/85 dark:bg-amber-400 dark:text-amber-950"
          onClick={() =>
            void leaveThen(() => {
              if (
                !requestQuickAssistant({
                  draft: orderAskDraft(order.orderNumber),
                })
              )
                router.push("/assistant")
            })
          }
        >
          <HugeiconsIcon icon={SparklesIcon} className="size-4" />
          Ask AI
        </Button>
      ) : null}
      <ChangeMenu
        order={order}
        options={options}
        option={option}
        timeZone={timeZone}
        onSelect={(key) =>
          setDialog(
            key === "returnLine"
              ? { kind: "return" }
              : key === "refund"
                ? { kind: "refund" }
                : { kind: key },
          )
        }
      />
    </div>
  )

  const itemsOption = option("items")
  const customerOption = option("customer")
  const detailsOption = option("details")
  const editLink = (
    allowed: { allowed: boolean; reason: string | null },
    label: string,
    onClick: () => void,
  ) =>
    allowed.allowed ? (
      <Button
        variant="link"
        size="sm"
        className="h-auto gap-1 px-0"
        onClick={onClick}
      >
        <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
        {label}
      </Button>
    ) : allowed.reason ? (
      <LockedReason reason={allowed.reason} />
    ) : null

  const details = (
    <div className="grid min-w-0 content-start gap-4">
      <SummaryStrip order={order} fulfilled={fulfilled} />
      <OverviewCard
        title="Items"
        action={editLink(itemsOption, "Edit items", () =>
          setDialog({ kind: "items" }),
        )}
      >
        <ol className="@container divide-y divide-border">
          <li
            aria-hidden="true"
            className="hidden px-4 py-2 text-xs text-muted-foreground @xl:grid @xl:grid-cols-[minmax(0,1fr)_3.5rem_6rem_6rem_7.5rem_5.5rem] @xl:gap-3"
          >
            <span>Item</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Price</span>
            <span className="text-right">Total</span>
            <span>Status</span>
            <span />
          </li>
          {order.lines.map((line) => {
            const status = lineStatus(line)
            const canReturn =
              options?.returnLine.allowed &&
              returnable.some((row) => row.orderLineId === line.id)
            const catalogDraft =
              canSaveToCatalog && line.customLine
                ? catalogFreeLineCatalogDraft(line.customLine, line.totalMinor)
                : null
            return (
              <li
                key={line.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 @xl:grid-cols-[minmax(0,1fr)_3.5rem_6rem_6rem_7.5rem_5.5rem]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{lineTitle(line)}</p>
                  <p className="text-xs text-muted-foreground">
                    {lineDetail(line)}
                    <span className="@xl:hidden">
                      {" "}
                      · {formatQuantity(line.quantity)} ×{" "}
                      {line.unitPriceMinor === null
                        ? "typed price"
                        : orderMoney(line.unitPriceMinor, order.currencyCode)}
                    </span>
                  </p>
                  {line.note ? (
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs">
                      {line.note}
                    </p>
                  ) : null}
                  {catalogDraft ? (
                    <Button
                      variant="link"
                      size="sm"
                      className="mt-1 h-auto px-0 text-xs"
                      onClick={() =>
                        void leaveThen(() =>
                          setCatalogParams({
                            catalogCreateKind: catalogDraft.kind,
                            catalogCreateName: catalogDraft.name,
                            catalogCreatePrice:
                              catalogDraft.priceMinor === null
                                ? null
                                : String(catalogDraft.priceMinor),
                            catalogItem: "create",
                          }),
                        )
                      }
                    >
                      Save to catalog
                    </Button>
                  ) : null}
                </div>
                <span className="hidden text-right text-sm tabular-nums @xl:block">
                  {formatQuantity(line.quantity)}
                </span>
                <span className="hidden text-right text-sm tabular-nums @xl:block">
                  {line.unitPriceMinor === null
                    ? "—"
                    : orderMoney(line.unitPriceMinor, order.currencyCode)}
                </span>
                <span className="text-right text-sm font-medium tabular-nums">
                  {orderMoney(line.totalMinor, order.currencyCode)}
                </span>
                <span className="col-start-1 @xl:col-start-auto">
                  <Pill tone={status.tone}>{status.label}</Pill>
                </span>
                <span className="text-right">
                  {!closed && canFulfilLine(line) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDialog({ kind: "fulfil", lineId: line.id })
                      }
                    >
                      Fulfil
                    </Button>
                  ) : canReturn ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setDialog({ kind: "return", lineId: line.id })
                      }
                    >
                      Return
                    </Button>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ol>
        <OrderTotals order={order} />
      </OverviewCard>
      <div className="grid gap-4 @container md:grid-cols-2">
        <OverviewCard
          title="Customer"
          action={editLink(customerOption, "Change", () =>
            setDialog({ kind: "customer" }),
          )}
        >
          <div className="grid gap-1 px-4 py-3 text-sm">
            <p className="font-medium">
              {order.customerName || "Walk-in customer"}
            </p>
            {order.customerPhone ? (
              <p className="text-muted-foreground">{order.customerPhone}</p>
            ) : null}
            {order.customerEmail ? (
              <p className="break-all text-muted-foreground">
                {order.customerEmail}
              </p>
            ) : null}
          </div>
        </OverviewCard>
        <OverviewCard
          title="Delivery and note"
          action={editLink(detailsOption, "Edit", () =>
            setDialog({ kind: "details" }),
          )}
        >
          <dl className="grid gap-2 px-4 py-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Delivery due</dt>
              <dd>
                {order.deliveryDueAt
                  ? formatOrderDateTime(order.deliveryDueAt, timeZone)
                  : "Not set"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Note</dt>
              <dd className="whitespace-pre-wrap break-words">
                {order.notes || "No note"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Taken by</dt>
              <dd>{order.createdBy?.name || "A sales rep"}</dd>
            </div>
          </dl>
        </OverviewCard>
      </div>
    </div>
  )

  return (
    <div className="grid gap-5">
      {layout === "page" ? (
        <header className="grid gap-3">
          <nav aria-label="Breadcrumb">
            <ol className="flex items-center gap-2 text-sm text-muted-foreground">
              <li>
                <Link href="/sales" className="hover:text-foreground">
                  Orders
                </Link>
              </li>
              <li aria-hidden="true">›</li>
              <li aria-current="page" className="text-foreground">
                {order.orderNumber}
              </li>
            </ol>
          </nav>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="grid gap-2">
              <h1 className="text-2xl font-semibold">{order.orderNumber}</h1>
              <p className="text-sm text-muted-foreground">
                {orderSubline(order, timeZone)}
              </p>
              <OrderPills order={order} />
            </div>
            {actions}
          </div>
        </header>
      ) : (
        actions
      )}
      <ReplacementBanner order={order} onOpenOrder={onOpenOrder} />
      <OrderApprovalBanners
        options={options}
        currencyCode={order.currencyCode}
        timeZone={timeZone}
        onDone={done}
        onAskAgain={(kind) =>
          setDialog(kind === "return" ? { kind: "return" } : { kind: "refund" })
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:items-start">
        {details}
        <OrderActivityColumn
          orderId={order.id}
          currencyCode={order.currencyCode}
          timeZone={timeZone}
          onOpenOrder={onOpenOrder}
          className={cn(
            "lg:sticky",
            layout === "page"
              ? "lg:top-4 lg:max-h-[calc(100dvh-7.5rem)]"
              : "lg:top-0 lg:max-h-[calc(100dvh-14rem)]",
          )}
        />
      </div>
      {dialog?.kind === "payment" ? (
        <PaymentDialog order={order} onClose={close} onDone={done} />
      ) : null}
      {dialog?.kind === "refund" ? (
        <RefundDialog
          order={order}
          credit={creditOption}
          canReturn={Boolean(options?.returnLine.allowed)}
          onOpenReturn={() => setDialog({ kind: "return" })}
          ask={Boolean(options?.refund.ask)}
          onClose={close}
          onDone={done}
        />
      ) : null}
      {dialog?.kind === "fulfil" ? (
        <FulfilDialog
          order={order}
          lineId={dialog.lineId}
          onClose={close}
          onDone={done}
        />
      ) : null}
      {dialog?.kind === "return" ? (
        <ReturnItemsDialog
          order={order}
          returnable={returnable}
          credit={creditOption}
          initialLineId={dialog.lineId}
          rules={
            options
              ? {
                  ask: options.returnLine.ask,
                  moneyAsk: options.returnLine.money?.ask,
                  cashBackAsk: options.returnLine.cashBack?.ask,
                  cashBackLockedReason:
                    options.returnLine.cashBack?.lockedReason,
                }
              : undefined
          }
          onClose={close}
          onDone={done}
        />
      ) : null}
      {dialog?.kind === "customer" ? (
        <CustomerChangeDialog
          order={order}
          timeZone={timeZone}
          storeId={storeId}
          onClose={close}
          onDone={done}
        />
      ) : null}
      {dialog?.kind === "details" ? (
        <DetailsChangeDialog
          order={order}
          timeZone={timeZone}
          onClose={close}
          onDone={done}
        />
      ) : null}
      {dialog?.kind === "items" ? (
        <ItemsChangeDialog
          order={order}
          onClose={close}
          onDone={done}
          onOpenOrder={onOpenOrder}
        />
      ) : null}
      {dialog?.kind === "cancel" ? (
        <CancelOrderDialog order={order} onClose={close} onDone={done} />
      ) : null}
    </div>
  )
}

const TINT = {
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  rose: "bg-red-500/15 text-red-700 dark:text-red-300",
  sky: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  violet: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
}

/**
 * Design 03 "Can do now" (as on mobile): what works now comes first with a
 * short hint, and locked changes fold under "Locked" with their reasons.
 * Once money or stock has moved, Return and Refund lead.
 */
function ChangeMenu({
  order,
  options,
  option,
  timeZone,
  onSelect,
}: {
  order: OverviewOrder
  options: OrderChangeOptions | undefined
  option: (key: ChangeKey) => { allowed: boolean; reason: string | null }
  timeZone?: string
  onSelect: (key: ChangeKey) => void
}) {
  const [showLocked, setShowLocked] = useState(false)
  const money = (value: number) => orderMoney(value, order.currencyCode)
  const moved =
    order.amountPaidMinor > 0 ||
    order.lines.some(
      (line) => line.productFulfillments.length > 0 || line.serviceFulfillment,
    )
  const rows: Array<{
    key: ChangeKey
    label: string
    meta: string
    icon: typeof PackageIcon
    tint: keyof typeof TINT
  }> = [
    {
      key: "returnLine",
      label: "Return items",
      meta: "Stock back, and money if you want",
      icon: PackageReceiveIcon,
      tint: "amber",
    },
    {
      key: "refund",
      label: "Refund",
      meta: `Up to ${money(options?.refund.refundableMinor ?? order.amountPaidMinor)}`,
      icon: ArrowTurnBackwardIcon,
      tint: "rose",
    },
    {
      key: "details",
      label: "Delivery and note",
      meta: order.deliveryDueAt
        ? formatOrderDateTime(order.deliveryDueAt, timeZone)
        : "No delivery time",
      icon: Calendar03Icon,
      tint: "sky",
    },
    {
      key: "customer",
      label: "Customer",
      meta: order.customerName || "Walk-in customer",
      icon: UserIcon,
      tint: "violet",
    },
    {
      key: "items",
      label: "Items and prices",
      meta: "Change quantity or price",
      icon: PencilEdit02Icon,
      tint: "amber",
    },
    {
      key: "cancel",
      label: "Cancel order",
      meta: "Releases reserved stock",
      icon: Cancel02Icon,
      tint: "rose",
    },
  ]
  // Before money or stock moves, editing the order comes first.
  const ordered = moved ? rows : [...rows.slice(2), ...rows.slice(0, 2)]
  const open = ordered.filter((row) => option(row.key).allowed)
  const locked = ordered.filter((row) => !option(row.key).allowed)
  return (
    <DropdownMenu onOpenChange={(next) => !next && setShowLocked(false)}>
      <DropdownMenuTrigger
        render={
          <Button variant="outline">
            <HugeiconsIcon icon={PencilEdit02Icon} className="size-4" />
            Change
            <HugeiconsIcon icon={ArrowDown01Icon} className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent
        appearance="dashboard"
        align="end"
        className="w-80 max-w-[calc(100vw-2rem)]"
      >
        {!options ? (
          <DropdownMenuItem disabled className="py-2">
            <LockedReason reason={option("details").reason ?? "Checking…"} />
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-[11px] font-semibold tracking-wide uppercase">
                Can do now
              </DropdownMenuLabel>
              {open.length ? (
                open.map((row) => (
                  <DropdownMenuItem
                    key={row.key}
                    variant={row.key === "cancel" ? "destructive" : "default"}
                    className="items-center gap-3 py-2"
                    onClick={() => onSelect(row.key)}
                  >
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-md",
                        TINT[row.tint],
                      )}
                    >
                      <HugeiconsIcon icon={row.icon} className="size-4" />
                    </span>
                    <span className="grid min-w-0 flex-1">
                      <span className="text-sm">{row.label}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {row.meta}
                      </span>
                    </span>
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      className="size-4 text-muted-foreground"
                    />
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled className="py-2 text-xs">
                  Nothing can change right now.
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            {locked.length ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  closeOnClick={false}
                  aria-expanded={showLocked}
                  className="justify-between py-2 text-xs text-muted-foreground"
                  onClick={() => setShowLocked((current) => !current)}
                >
                  Locked ({locked.length})
                  <HugeiconsIcon
                    icon={showLocked ? ArrowUp01Icon : ArrowDown01Icon}
                    className="size-4"
                  />
                </DropdownMenuItem>
                {showLocked
                  ? locked.map((row) => (
                      <DropdownMenuItem
                        key={row.key}
                        disabled
                        className="items-start gap-3 py-2 data-disabled:opacity-75"
                      >
                        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                          <HugeiconsIcon
                            icon={SquareLock01Icon}
                            className="size-4"
                          />
                        </span>
                        <span className="grid min-w-0 flex-1">
                          <span className="text-sm">{row.label}</span>
                          <span className="text-xs whitespace-normal text-muted-foreground">
                            {option(row.key).reason ?? "Not available"}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    ))
                  : null}
              </>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SummaryStrip({
  order,
  fulfilled,
}: {
  order: OverviewOrder
  fulfilled: ReturnType<typeof fulfilmentCount>
}) {
  const money = (value: number) => orderMoney(value, order.currencyCode)
  // Everything came back: lead with the credit, not a ₦0 total (as on mobile).
  const credited =
    order.totalMinor === 0 &&
    order.creditMinor > 0 &&
    order.balanceDueMinor === 0
  const paidShare =
    order.totalMinor > 0
      ? Math.min(100, (order.amountPaidMinor / order.totalMinor) * 100)
      : 0
  const tile = "grid gap-1 rounded-xl border border-border bg-card px-4 py-3"
  const label =
    "text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {credited ? (
        <div
          className={cn(
            tile,
            "border-violet-500/40 bg-violet-500/10 text-violet-800 dark:text-violet-200",
          )}
        >
          <dt className={cn(label, "text-violet-700 dark:text-violet-300")}>
            Credited in full
          </dt>
          <dd className="text-xl font-semibold tabular-nums">
            {money(order.creditMinor)}
          </dd>
          <dd className="text-xs">Total now {money(0)}</dd>
        </div>
      ) : (
        <div className={tile}>
          <dt className={label}>Total</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {money(order.totalMinor)}
          </dd>
          {order.creditMinor > 0 ? (
            <dd className="text-xs text-muted-foreground">
              Credit after sale −{money(order.creditMinor)}
            </dd>
          ) : null}
        </div>
      )}
      <div className={tile}>
        <dt className={label}>Paid</dt>
        <dd className="grid gap-2">
          <span className="text-xl font-semibold tabular-nums">
            {money(order.amountPaidMinor)}
          </span>
          {credited ? null : (
            <span
              aria-hidden="true"
              className="block h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${paidShare}%` }}
              />
            </span>
          )}
        </dd>
      </div>
      <div className={tile}>
        <dt className={label}>Balance</dt>
        <dd
          className={cn(
            "text-xl font-semibold tabular-nums",
            order.balanceDueMinor > 0 &&
              !isClosedOrder(order.status) &&
              "text-amber-600 dark:text-amber-400",
          )}
        >
          {money(order.balanceDueMinor)}
        </dd>
      </div>
      <div className={tile}>
        <dt className={label}>Fulfilled</dt>
        <dd className="text-xl font-semibold tabular-nums">
          {fulfilled.done} of {fulfilled.total}
        </dd>
        {fulfilled.returned + fulfilled.partReturned > 0 ? (
          <dd className="text-xs text-muted-foreground">
            {[
              fulfilled.returned ? `${fulfilled.returned} returned` : null,
              fulfilled.partReturned
                ? `${fulfilled.partReturned} part returned`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </dd>
        ) : null}
      </div>
    </dl>
  )
}

/** Same rows and words as the receipt and mobile, credit after sale included. */
function OrderTotals({ order }: { order: OverviewOrder }) {
  const money = (value: number) => orderMoney(value, order.currencyCode)
  const rows: Array<{ label: string; value: string; className?: string }> = [
    { label: "Subtotal", value: money(order.subtotalMinor) },
    ...(order.serviceChargeMinor > 0
      ? [{ label: "Service charge", value: money(order.serviceChargeMinor) }]
      : []),
    ...(order.discountMinor > 0
      ? [{ label: "Discount", value: `−${money(order.discountMinor)}` }]
      : []),
    ...(order.taxMinor > 0
      ? [{ label: "Tax", value: money(order.taxMinor) }]
      : []),
    ...(order.creditMinor > 0
      ? [
          {
            label: "Credit after sale",
            value: `−${money(order.creditMinor)}`,
            className: "font-medium text-violet-700 dark:text-violet-300",
          },
        ]
      : []),
  ]
  const due = order.balanceDueMinor > 0 && !isClosedOrder(order.status)
  return (
    <dl className="grid gap-1.5 border-t border-border px-4 py-3 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className={cn("tabular-nums", row.className)}>{row.value}</dd>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-3 border-t border-border pt-2 font-semibold">
        <dt>Total</dt>
        <dd className="tabular-nums">{money(order.totalMinor)}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Paid</dt>
        <dd className="tabular-nums">{money(order.amountPaidMinor)}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Balance due</dt>
        <dd
          className={cn(
            "tabular-nums",
            due && "font-semibold text-amber-600 dark:text-amber-400",
          )}
        >
          {money(order.balanceDueMinor)}
        </dd>
      </div>
    </dl>
  )
}

/** Links a replaced order to its replacement and back. */
function ReplacementBanner({
  order,
  onOpenOrder,
}: {
  order: OverviewOrder
  onOpenOrder: (orderId: string) => void
}) {
  const trpc = useTRPC()
  const timeline = useQuery(
    trpc.orders.timeline.queryOptions({ orderId: order.id }, { retry: false }),
  )
  const items = timeline.data?.items ?? []
  const replacedBy = items.find((item) => item.kind === "replaced")?.linkedOrder
  const replaces = items.find(
    (item) => item.kind === "created" && item.linkedOrder,
  )?.linkedOrder
  const link = replacedBy ?? replaces
  if (!link) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
      <span>
        {replacedBy
          ? `${order.orderNumber} was replaced by ${link.orderNumber} when its items changed. Use the new order from here on.`
          : `This order replaces ${link.orderNumber}, whose items changed.`}
      </span>
      <Button variant="outline" size="sm" onClick={() => onOpenOrder(link.id)}>
        Open {link.orderNumber}
      </Button>
    </div>
  )
}
