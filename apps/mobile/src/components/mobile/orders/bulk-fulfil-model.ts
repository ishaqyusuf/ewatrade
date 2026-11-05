/** Fulfil several selected Orders, one server call each, reporting per Order. */
import type { BulkOutcome } from "@/components/mobile/list-selection/bulk-report"

export type BulkFulfilOrder = {
  id: string
  orderNumber: string
  customerName?: string | null
}

export type BulkFulfilOutcome = BulkOutcome

export function bulkFulfilLabel(order: BulkFulfilOrder) {
  return `${order.orderNumber} · ${order.customerName || "Walk-in customer"}`
}

/** Splits the selection into Orders with ready lines and those skipped up front. */
export function planBulkFulfil<T extends BulkFulfilOrder>(
  orders: readonly T[],
  readyLineCount: (order: T) => number,
) {
  const ready: Array<{ order: T; lines: number }> = []
  const skipped: BulkFulfilOutcome[] = []
  for (const order of orders) {
    const lines = readyLineCount(order)
    if (lines > 0) ready.push({ lines, order })
    else
      skipped.push({
        detail: "Nothing ready to fulfil",
        label: bulkFulfilLabel(order),
        key: order.id,
        result: "skipped",
      })
  }
  return { ready, skipped }
}

export function bulkFulfilDone(order: BulkFulfilOrder, lines: number) {
  return {
    detail: lines === 1 ? "1 line fulfilled" : `${lines} lines fulfilled`,
    label: bulkFulfilLabel(order),
    key: order.id,
    result: "done",
  } satisfies BulkFulfilOutcome
}

export function bulkFulfilFailed(order: BulkFulfilOrder, error: unknown) {
  return {
    detail:
      error instanceof Error && error.message.trim()
        ? error.message
        : "Couldn’t fulfil this Order. Try it from the Order.",
    label: bulkFulfilLabel(order),
    key: order.id,
    result: "skipped",
  } satisfies BulkFulfilOutcome
}

export function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

/** "3 fulfilled · 1 skipped" */
export function bulkFulfilSummary(outcomes: readonly BulkFulfilOutcome[]) {
  const done = outcomes.filter((outcome) => outcome.result === "done").length
  const skipped = outcomes.length - done
  return skipped
    ? `${done} fulfilled · ${skipped} skipped`
    : `${done} fulfilled`
}
