"use client"
import type { FinanceSheetMode } from "@/hooks/use-finance-params"
import { FinanceAccountForm } from "./account-form"
import { FinanceBillDetail } from "./bill-detail"
import { FinanceBillPaymentForm } from "./bill-payment-form"
import { FinanceCashCountDetail } from "./cash-count-detail"
import { FinanceCashCountForm } from "./cash-count-form"
import { FinanceExpenseForm } from "./expense-form"
import { FinanceMoneyForm } from "./money-form"
import { FinanceMoneyReversalForm } from "./money-reversal-form"
import { FinancePeriodForm } from "./period-form"
import { FinanceSetupForm } from "./setup-form"
import { FinanceSupplierEntryForm } from "./supplier-entry-form"
import { FinanceSupplierForm } from "./supplier-form"
import { FinanceSupplierStatement } from "./supplier-statement"
import type { FinanceBook } from "./types"
export function FinanceContent({
  mode,
  book,
  billId,
  countId,
  moneyEntryId,
  supplierId,
  storeId,
}: {
  mode: FinanceSheetMode
  book: FinanceBook | null
  billId: string | null
  countId: string | null
  moneyEntryId: string | null
  supplierId: string | null
  storeId: string
}) {
  if (!book)
    return mode === "setup" ? (
      <FinanceSetupForm />
    ) : (
      <p>Set up finance before recording activity.</p>
    )
  if (mode === "period") return <FinancePeriodForm book={book} />
  if (mode === "supplier") return <FinanceSupplierForm book={book} />
  if (mode === "supplier-statement" && supplierId)
    return <FinanceSupplierStatement book={book} supplierId={supplierId} />
  if (
    (mode === "supplier-opening" || mode === "supplier-advance") &&
    supplierId
  )
    return (
      <FinanceSupplierEntryForm
        book={book}
        supplierId={supplierId}
        mode={mode === "supplier-opening" ? "opening" : "advance"}
      />
    )
  if (
    ["supplier-statement", "supplier-opening", "supplier-advance"].includes(
      mode,
    )
  )
    return <p>Choose a supplier from the supplier directory.</p>
  if (mode === "expense")
    return <FinanceExpenseForm book={book} storeId={storeId} />
  if (mode === "money") return <FinanceMoneyForm book={book} />
  if (mode === "money-reversal" && moneyEntryId)
    return (
      <FinanceMoneyReversalForm
        book={book}
        entryId={moneyEntryId}
        key={moneyEntryId}
      />
    )
  if (mode === "cash-count") return <FinanceCashCountForm book={book} />
  if (mode === "cash-count-detail" && countId)
    return <FinanceCashCountDetail book={book} countId={countId} />
  if (mode === "account" || mode === "category")
    return (
      <FinanceAccountForm bookId={book.id} category={mode === "category"} />
    )
  if (mode === "bill" && billId)
    return <FinanceBillDetail book={book} billId={billId} />
  if (mode === "pay-bill" && billId)
    return <FinanceBillPaymentForm book={book} billId={billId} />
  return <p>Finance is ready. Choose an action from the workspace.</p>
}
