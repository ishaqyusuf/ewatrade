import type { FinanceSheetMode } from "@/hooks/use-finance-params"
export const financeSheetTitles: Record<FinanceSheetMode, string> = {
  period: "Close or reopen a period",
  setup: "Set up finance",
  expense: "Record expense",
  bill: "Expense details",
  "pay-bill": "Record bill payment",
  money: "Record money movement",
  "money-reversal": "Reverse money movement",
  account: "New money account",
  category: "New expense category",
  "cash-count": "Count physical cash",
  "cash-count-detail": "Cash count details",
  supplier: "New supplier",
  "supplier-statement": "Supplier statement",
  "supplier-opening": "Record supplier opening",
  "supplier-advance": "Pay supplier advance",
}
