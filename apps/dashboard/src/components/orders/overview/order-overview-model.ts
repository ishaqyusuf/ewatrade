import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { catalogFreeLineDisplay } from "@ewatrade/utils/catalog-free-lines"
import { orderMoney } from "../order-draft"

export type OverviewOrder = RouterOutputs["orders"]["get"]
export type OverviewLine = OverviewOrder["lines"][number]
export type OrderTimeline = RouterOutputs["orders"]["timeline"]
export type OrderTimelineItem = OrderTimeline["items"][number]
export type OrderChangeOptions = RouterOutputs["orders"]["changeOptions"]
export type OrderNote = RouterOutputs["orders"]["activity"]["list"][number]

export type PillTone = "amber" | "green" | "blue" | "muted" | "red"

export const isClosedOrder = (status: string) =>
  status === "CANCELLED" || status === "REFUNDED"

export const orderAskDraft = (orderNumber: string) =>
  `For order ${orderNumber}:\n`

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "pos", label: "POS" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
] as const

export type OrderPaymentMethod = (typeof PAYMENT_METHODS)[number]["value"]

export const paymentMethodLabel = (method: string | null) =>
  PAYMENT_METHODS.find((row) => row.value === method?.toLowerCase())?.label ??
  (method ? method.toLowerCase().replaceAll("_", " ") : null)

export function lineTitle(line: OverviewLine) {
  if (line.customLine) return catalogFreeLineDisplay(line.customLine).title
  return line.snapshot?.catalogItemName ?? "Item"
}

export function lineDetail(line: OverviewLine) {
  if (line.customLine)
    return catalogFreeLineDisplay(line.customLine).detail ?? "Typed price"
  return [line.snapshot?.variantName, line.snapshot?.inventoryUnitName]
    .filter(Boolean)
    .join(" · ")
}

/** Quantity still held by the customer after returns. */
export function returnableQuantity(line: OverviewLine) {
  const fulfilled = line.productFulfillments.reduce(
    (sum, row) => sum + Number(row.quantity),
    0,
  )
  const returned = line.productReturns.reduce(
    (sum, row) => sum + Number(row.quantity),
    0,
  )
  return Math.max(0, fulfilled - returned)
}

export const canFulfilLine = (line: OverviewLine) =>
  line.kind === "product" &&
  line.productFulfillments.length === 0 &&
  line.reservation?.status === "ACTIVE"

/** Typed-price lines have no stock; only "Fulfil all" records them done. */
const canFinishTypedLine = (line: OverviewLine) =>
  Boolean(line.customLine) && !line.serviceFulfillment

export function readyLines(order: OverviewOrder) {
  if (isClosedOrder(order.status) || order.status === "COMPLETED") return []
  return order.lines.filter(
    (line) => canFulfilLine(line) || canFinishTypedLine(line),
  )
}

const isLineDone = (line: OverviewLine) =>
  line.productFulfillments.length > 0 || Boolean(line.serviceFulfillment)

export function fulfilmentCount(order: OverviewOrder) {
  return {
    done: order.lines.filter(isLineDone).length,
    total: order.lines.length,
  }
}

export function lineStatus(line: OverviewLine): {
  label: string
  tone: PillTone
} {
  if (line.productReturns.length)
    return returnableQuantity(line) > 0
      ? { label: "Part returned", tone: "amber" }
      : { label: "Returned", tone: "muted" }
  if (isLineDone(line)) return { label: "Fulfilled", tone: "green" }
  if (line.reservation?.status === "ACTIVE")
    return { label: "Reserved", tone: "blue" }
  if (line.reservation?.status === "RELEASED")
    return { label: "Released", tone: "muted" }
  return { label: "Not fulfilled", tone: "muted" }
}

export function orderPills(order: OverviewOrder) {
  const money = (value: number) => orderMoney(value, order.currencyCode)
  const pills: Array<{ label: string; tone: PillTone }> = []
  if (order.status === "CANCELLED")
    pills.push({ label: "Cancelled", tone: "red" })
  else if (order.status === "REFUNDED")
    pills.push({ label: "Refunded", tone: "red" })
  else if (order.amountPaidMinor <= 0 && order.totalMinor > 0)
    pills.push({
      label: `Unpaid · ${money(order.balanceDueMinor)} due`,
      tone: "amber",
    })
  else if (order.balanceDueMinor > 0)
    pills.push({
      label: `Part paid · ${money(order.balanceDueMinor)} due`,
      tone: "amber",
    })
  else pills.push({ label: "Paid", tone: "green" })
  if (!isClosedOrder(order.status)) {
    const { done, total } = fulfilmentCount(order)
    pills.push(
      done === 0
        ? { label: "Not fulfilled", tone: "muted" }
        : done < total
          ? { label: `${done} of ${total} fulfilled`, tone: "blue" }
          : { label: "Fulfilled", tone: "green" },
    )
  }
  return pills
}

export const formatQuantity = (value: string) =>
  value.includes(".") ? value.replace(/\.?0+$/, "") : value

/** Order times read in the business time zone, the same on server and client. */
export function formatOrderTime(value: string | Date, timeZone?: string) {
  return new Date(value).toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  })
}

export function formatOrderDateTime(value: string | Date, timeZone?: string) {
  return new Date(value).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  })
}

export function dayLabel(
  value: string | Date,
  timeZone?: string,
  now = new Date(),
) {
  const date = new Date(value)
  const key = (day: Date) => day.toLocaleDateString("en-CA", { timeZone })
  if (key(date) === key(now)) return "Today"
  if (key(date) === key(new Date(now.getTime() - 86_400_000)))
    return "Yesterday"
  const sameYear =
    date.toLocaleDateString("en-NG", { year: "numeric", timeZone }) ===
    now.toLocaleDateString("en-NG", { year: "numeric", timeZone })
  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    timeZone,
  })
}

export type ActivityEntry =
  | { kind: "event"; id: string; at: string; item: OrderTimelineItem }
  | { kind: "note"; id: string; at: string; note: OrderNote }

/** Timeline events with notes merged in by time, oldest first. */
export function mergeActivity(
  items: OrderTimelineItem[],
  notes: OrderNote[],
): ActivityEntry[] {
  return [
    ...items.map((item) => ({
      kind: "event" as const,
      id: item.id,
      at: item.occurredAt,
      item,
    })),
    ...notes.map((note) => ({
      kind: "note" as const,
      id: `note:${note.id}`,
      at: new Date(note.createdAt).toISOString(),
      note,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at))
}

type Change = OrderTimelineItem["changes"][number]

function changeLine(change: Change, currency: string, timeZone?: string) {
  const money = (value: number | null) =>
    value === null ? "typed price" : orderMoney(value, currency)
  switch (change.field) {
    case "customer":
      return `Customer: ${change.before ?? "Walk-in"} → ${change.after ?? "Walk-in"}`
    case "deliveryDueAt":
      return `Delivery: ${change.before ? formatOrderDateTime(change.before, timeZone) : "None"} → ${change.after ? formatOrderDateTime(change.after, timeZone) : "None"}`
    case "notes":
      return `Note: ${change.before ? `“${change.before}”` : "None"} → ${change.after ? `“${change.after}”` : "None"}`
    case "line":
      return `${change.label}: ${
        change.before
          ? `${formatQuantity(change.before.quantity)} × ${money(change.before.unitPriceMinor)}`
          : "—"
      } → ${
        change.after
          ? `${formatQuantity(change.after.quantity)} × ${money(change.after.unitPriceMinor)}`
          : "removed"
      }`
    case "total":
      return `Total: ${orderMoney(change.before, currency)} → ${orderMoney(change.after, currency)}`
    case "stockReleased":
      return `Stock released: ${formatQuantity(change.quantity)} × ${change.label}`
  }
}

const RETURN_OUTCOME: Record<string, string> = {
  restock: "Back to stock",
  damaged: "Damaged",
  quarantine: "Set aside to check",
  no_restock: "Not restocked",
}

export type EventTone = "default" | "money" | "stock" | "change" | "danger"

/** Plain-English title, amount and detail lines for one timeline event. */
export function describeEvent(
  item: OrderTimelineItem,
  currency: string,
  timeZone?: string,
) {
  const actor = item.actor?.name ?? null
  const amount =
    item.amountMinor !== null ? orderMoney(item.amountMinor, currency) : null
  const lines = item.lines.map(
    (line) => `${formatQuantity(line.quantity)} × ${line.label}`,
  )
  const changes = item.changes.map((change) =>
    changeLine(change, currency, timeZone),
  )
  const meta = (...parts: Array<string | null | undefined>) =>
    parts.filter(Boolean).join(" · ")
  switch (item.kind) {
    case "created":
      return {
        title: item.linkedOrder
          ? "Order created as a replacement"
          : "Order created",
        amount: null,
        tone: "default" as EventTone,
        detail: meta(actor, amount ? `Total ${amount}` : null),
        // A replacement carries what changed from the order it replaced.
        lines: [...changes, ...(item.reason ? [`Reason: ${item.reason}`] : [])],
        linkLabel: item.linkedOrder
          ? `Replaces ${item.linkedOrder.orderNumber}`
          : null,
      }
    case "payment":
      return {
        title: "Payment received",
        amount,
        tone: "money" as EventTone,
        detail: meta(paymentMethodLabel(item.method), item.reference, actor),
        lines: [],
        linkLabel: null,
      }
    case "refund":
      return {
        title: "Refund paid",
        amount,
        tone: "danger" as EventTone,
        detail: meta(paymentMethodLabel(item.method), item.reference, actor),
        lines: item.reason ? [`Reason: ${item.reason}`] : [],
        linkLabel: null,
      }
    case "fulfilled":
      return {
        title: "Fulfilled",
        amount: null,
        tone: "stock" as EventTone,
        detail: meta(lines.join(", "), actor),
        lines: [],
        linkLabel: null,
      }
    case "returned":
      return {
        title: "Returned",
        amount: null,
        tone: "stock" as EventTone,
        detail: meta(
          lines.join(", "),
          RETURN_OUTCOME[item.disposition?.toLowerCase() ?? ""],
          actor,
        ),
        lines: item.reason ? [`Reason: ${item.reason}`] : [],
        linkLabel: null,
      }
    case "changed":
      return {
        title: "Order changed",
        amount: null,
        tone: "change" as EventTone,
        detail: meta(actor),
        lines: [...changes, ...(item.reason ? [`Reason: ${item.reason}`] : [])],
        linkLabel: null,
      }
    case "replaced":
      return {
        title: "Items changed · order replaced",
        amount: null,
        tone: "change" as EventTone,
        detail: meta(actor),
        lines: [...changes, ...(item.reason ? [`Reason: ${item.reason}`] : [])],
        linkLabel: item.linkedOrder
          ? `Replaced by ${item.linkedOrder.orderNumber}`
          : null,
      }
    case "cancelled":
      return {
        title: "Order cancelled",
        amount: null,
        tone: "danger" as EventTone,
        detail: meta(actor),
        lines: [...changes, ...(item.reason ? [`Reason: ${item.reason}`] : [])],
        linkLabel: null,
      }
    case "credited":
      return {
        title:
          item.creditKind === "overcharge"
            ? "Total lowered · overcharged"
            : "Total lowered · items returned",
        amount: amount ? `−${amount}` : null,
        tone: "change" as EventTone,
        detail: meta(actor),
        lines: [...changes, ...(item.reason ? [`Reason: ${item.reason}`] : [])],
        linkLabel: null,
      }
    case "completed":
      return {
        title: "Order completed",
        amount: null,
        tone: "default" as EventTone,
        detail: meta(actor),
        lines: [],
        linkLabel: null,
      }
  }
}
