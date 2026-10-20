"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import {
  type BillCorrectionTarget,
  FinanceBillCorrectionForm,
} from "./bill-correction-form"
import { ExpenseReceipts } from "./expense-receipts"
import type { FinanceBook } from "./types"
export function FinanceBillDetail({
  book,
  billId,
}: { book: FinanceBook; billId: string }) {
  const [correction, setCorrection] = useState<BillCorrectionTarget | null>(
    null,
  )
  const trpc = useTRPC()
  const { setParams } = useFinanceParams()
  const query = useQuery(
    trpc.finance.bill.queryOptions({ bookId: book.id, billId }),
  )
  if (query.isPending) return <output>Loading expense…</output>
  if (query.isError)
    return (
      <FormFeedback appearance="dashboard">{query.error.message}</FormFeedback>
    )
  const bill = query.data
  if (correction)
    return (
      <FinanceBillCorrectionForm
        book={book}
        target={correction}
        onBack={() => setCorrection(null)}
      />
    )
  return (
    <div className="grid gap-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {bill.payeeName}
        </p>
        <h3 className="mt-2 text-xl font-semibold">{bill.description}</h3>
        <p className="mt-2 text-2xl tabular-nums">
          {formatFinanceMoney(bill.totalMinor, book.currencyCode)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date(bill.incurredAt).toLocaleDateString("en-NG", {
            timeZone: book.timezone,
          })}
          {bill.reference ? ` · ${bill.reference}` : ""}
        </p>
      </div>
      {bill.voidedAt ? (
        <p className="border border-border p-4 text-sm">
          Cancelled: {bill.voidReason}. Original amount and payment history are
          retained.
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-3 border-y border-border py-4">
        <div>
          <dt className="text-sm text-muted-foreground">Paid</dt>
          <dd className="font-medium">
            {formatFinanceMoney(bill.paidMinor, book.currencyCode)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Outstanding</dt>
          <dd className="font-medium">
            {formatFinanceMoney(bill.outstandingMinor, book.currencyCode)}
          </dd>
        </div>
      </dl>
      {BigInt(bill.outstandingMinor) > BigInt(0) ? (
        <Button
          appearance="form"
          onClick={() => setParams({ financeSheet: "pay-bill", billId })}
        >
          Record payment
        </Button>
      ) : null}
      {!bill.voidedAt ? (
        <div className="grid gap-2">
          <Button
            appearance="form"
            variant="outline"
            disabled={bill.payments.some((payment) => !payment.reversedAt)}
            onClick={() =>
              setCorrection({
                billId,
                description: bill.description,
                amountMinor: bill.totalMinor,
              })
            }
          >
            Cancel expense
          </Button>
          {bill.payments.some((payment) => !payment.reversedAt) ? (
            <p className="text-sm text-muted-foreground">
              Reverse the recorded payments before cancelling this expense.
            </p>
          ) : null}
        </div>
      ) : null}
      <ExpenseReceipts
        bookId={book.id}
        billId={bill.id}
        cancelled={Boolean(bill.voidedAt)}
      />
      <section>
        <h4 className="font-medium">Expense lines</h4>
        {bill.lines.map((line) => (
          <div
            className="flex justify-between gap-4 border-b border-border py-3 text-sm"
            key={line.id}
          >
            <div>
              {line.description}
              <p className="text-muted-foreground">{line.account.name}</p>
            </div>
            <span>
              {formatFinanceMoney(line.amountMinor, book.currencyCode)}
            </span>
          </div>
        ))}
      </section>
      <section>
        <h4 className="font-medium">Payment history</h4>
        {bill.payments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No payments recorded.
          </p>
        ) : (
          bill.payments.map((payment) => (
            <div
              key={payment.id}
              className="flex justify-between gap-4 border-b border-border py-3 text-sm"
            >
              <div>
                {payment.account.name}
                {payment.reversedAt ? (
                  <p className="font-medium">
                    Reversed: {payment.reversalReason}
                  </p>
                ) : null}
                <p className="text-muted-foreground">
                  {new Date(payment.effectiveAt).toLocaleDateString("en-NG", {
                    timeZone: book.timezone,
                  })}
                  {payment.reference ? ` · ${payment.reference}` : ""}
                </p>
              </div>
              <div className="grid justify-items-end gap-2">
                <span>
                  {formatFinanceMoney(payment.amountMinor, book.currencyCode)}
                </span>
                {!payment.reversedAt && !bill.voidedAt ? (
                  <Button
                    appearance="form"
                    variant="outline"
                    onClick={() =>
                      setCorrection({
                        billId,
                        paymentId: payment.id,
                        description: `Payment from ${payment.account.name}`,
                        amountMinor: payment.amountMinor,
                      })
                    }
                  >
                    Reverse payment
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
