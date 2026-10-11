import {
  commerceStatusLabel,
  formatCommerceDateTime,
  formatCommerceQuantity,
} from "@/components/mobile/commerce/commerce-model"
import type { CommercialOrderActivity } from "@/components/mobile/commerce/commercial-order-overview-model"
import { formatOrderDetailMoney as formatMinorMoney } from "@/lib/order-detail-dispatch-docket"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

export type OrderTimeline = RouterOutputs["orders"]["timeline"]
type TimelineItem = OrderTimeline["items"][number]

const RETURN_LABEL: Record<string, string> = {
  RESTOCK: "back on the shelf",
  QUARANTINE: "set aside",
  DAMAGED: "damaged",
  NO_RESTOCK: "not restocked",
}

const clip = (value: string | null, empty: string) =>
  value ? (value.length > 60 ? `${value.slice(0, 59)}…` : value) : empty
const who = (item: TimelineItem) => item.actor?.name ?? "A team member"
const said = (item: TimelineItem) => (item.reason ? ` · “${item.reason}”` : "")
const lines = (item: TimelineItem) =>
  item.lines
    .map((line) => `${formatCommerceQuantity(line.quantity)} × ${line.label}`)
    .join(", ")

function changedLabel(item: TimelineItem) {
  const fields = item.changes.map((change) => change.field)
  if (
    fields.length === 2 &&
    fields.includes("deliveryDueAt") &&
    fields.includes("notes")
  )
    return "Delivery and note changed"
  if (fields.length !== 1) return "Order details changed"
  if (fields[0] === "customer") return "Customer changed"
  if (fields[0] === "deliveryDueAt") return "Delivery moved"
  return "Note changed"
}

function changeRows(item: TimelineItem, currencyCode: string) {
  const money = (value: number | null) =>
    value === null
      ? "price set in order"
      : formatMinorMoney(value, currencyCode)
  return item.changes.map((change) => {
    switch (change.field) {
      case "customer":
        return {
          label: "Customer",
          before: change.before ?? "Walk-in",
          after: change.after ?? "Walk-in",
        }
      case "deliveryDueAt":
        return {
          label: "Delivery",
          before: change.before
            ? formatCommerceDateTime(change.before)
            : "Not set",
          after: change.after
            ? formatCommerceDateTime(change.after)
            : "Not set",
        }
      case "notes":
        return {
          label: "Note",
          before: clip(change.before, "No note"),
          after: clip(change.after, "No note"),
        }
      case "line":
        return {
          label: change.label,
          before: change.before
            ? `${formatCommerceQuantity(change.before.quantity)} × ${money(change.before.unitPriceMinor)}`
            : "Not on order",
          after: change.after
            ? `${formatCommerceQuantity(change.after.quantity)} × ${money(change.after.unitPriceMinor)}`
            : "Removed",
        }
      case "total":
        return {
          label: "Total",
          before: formatMinorMoney(change.before, currencyCode),
          after: formatMinorMoney(change.after, currencyCode),
        }
      default:
        return {
          label: change.label,
          before: `${formatCommerceQuantity(change.quantity)} reserved`,
          after: "back on the shelf",
        }
    }
  })
}

/** Server history as the order screen's Activity rows, oldest first. */
export function timelineActivity(
  timeline: OrderTimeline,
  paid: boolean,
): CommercialOrderActivity[] {
  const currency = timeline.currencyCode
  return timeline.items.map((item) => {
    const amount =
      item.amountMinor === null
        ? ""
        : formatMinorMoney(item.amountMinor, currency)
    const credit = item.method === "CUSTOMER_CREDIT"
    const base = {
      key: item.id,
      occurredAt: item.occurredAt,
      time: formatCommerceDateTime(item.occurredAt),
      changes: changeRows(item, currency),
    }
    switch (item.kind) {
      case "created":
        return {
          ...base,
          label: item.linkedOrder
            ? `Order created · replaces ${item.linkedOrder.orderNumber}`
            : "Order created",
          detail: `Taken by ${who(item)}${said(item)}`,
          tone: "ink",
        }
      case "payment":
        return {
          ...base,
          label: credit
            ? `Customer credit applied ${amount}`
            : `Payment received ${amount}`,
          detail: `${credit ? "From the customer's account" : commerceStatusLabel(item.method ?? "OTHER")}${item.reference ? ` · ${item.reference}` : ""} · ${who(item)}`,
          tone: "mint",
        }
      case "refund":
        return {
          ...base,
          label: credit
            ? `Customer credit released ${amount}`
            : `Refund ${amount}`,
          detail: `${commerceStatusLabel(item.method ?? "OTHER")}${item.reference ? ` · ${item.reference}` : ""} · ${who(item)}${said(item)}`,
          tone: "rose",
        }
      case "fulfilled":
        return {
          ...base,
          label: "Fulfilled",
          detail: `${lines(item)} · ${who(item)}`,
          tone: "sky",
        }
      case "returned":
        return {
          ...base,
          label: "Returned",
          detail: `${lines(item)} · ${RETURN_LABEL[item.disposition ?? ""] ?? "returned"} · ${who(item)}${said(item)}`,
          tone: "amber",
        }
      case "changed":
        return {
          ...base,
          label: changedLabel(item),
          detail: `${who(item)}${said(item)}`,
          tone: "lilac",
        }
      case "replaced":
        return {
          ...base,
          label: item.linkedOrder
            ? `Replaced by ${item.linkedOrder.orderNumber}`
            : "Items changed",
          detail: `${who(item)}${said(item)} · this order closed`,
          tone: "lilac",
        }
      case "credited":
        return {
          ...base,
          label:
            item.creditKind === "overcharge"
              ? `Price corrected −${amount}`
              : `Returned items credited −${amount}`,
          detail: `${who(item)}${said(item)}`,
          tone: "lilac",
        }
      case "cancelled":
        return {
          ...base,
          label: "Order cancelled",
          detail: item.actor ? `${who(item)}${said(item)}` : "Cancelled",
          tone: "rose",
        }
      default:
        return {
          ...base,
          label: "Order completed",
          detail: paid ? "Paid and handed over" : "Handed over",
          tone: "mint",
        }
    }
  })
}
