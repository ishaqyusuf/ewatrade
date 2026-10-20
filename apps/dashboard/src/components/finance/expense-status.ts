import type { PillTone } from "@/components/orders/overview/order-overview-model"
import type { FinanceBillRow } from "./types"

type ExpenseStatus = FinanceBillRow["status"]

export const expenseStatusLabels = {
  PAID: "Paid",
  PARTIAL: "Partly paid",
  UNPAID: "Unpaid",
  VOID: "Cancelled",
} as const satisfies Record<ExpenseStatus, string>

/** Paid is green, partly paid amber, unpaid red, cancelled muted. */
const expenseStatusTones: Record<ExpenseStatus, PillTone> = {
  PAID: "green",
  PARTIAL: "amber",
  UNPAID: "red",
  VOID: "muted",
}

export function expensePill(status: ExpenseStatus) {
  return {
    label: expenseStatusLabels[status],
    tone: expenseStatusTones[status],
  }
}
