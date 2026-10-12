"use client"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { generalMoney } from "@ewatrade/assistant/general/contracts"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { parseAsString, useQueryStates } from "nuqs"
import { SheetFrame } from "./sheet-frame"
type Record = RouterOutputs["finance"]["purchase"]
export function PurchaseBillDetails({
  record,
  onRecognition,
}: { record: Record; onRecognition: () => void }) {
  const money = (value: string) => generalMoney(value, record.currencyCode)
  return (
    <div className="grid gap-6 text-sm">
      <div>
        <h3 className="font-medium">{record.supplier.name}</h3>
        <p className="mt-1">{record.description}</p>
        <p className="mt-2 text-muted-foreground">
          Invoice {new Date(record.incurredAt).toISOString()} (UTC)
          {record.reference ? ` · ${record.reference}` : ""}
        </p>
        {record.voidedAt ? (
          <p className="mt-2">Voided · {record.voidReason}</p>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <dt>Invoice total</dt>
        <dd>{money(record.totalMinor)}</dd>
        <dt>Cash payments recorded</dt>
        <dd>{money(record.cashPaidMinor)}</dd>
        <dt>Advance applied (net)</dt>
        <dd>{money(record.activeAllocatedMinor)}</dd>
        <dt>Settled total</dt>
        <dd>{money(record.paidMinor)}</dd>
        <dt>Remaining payable</dt>
        <dd className="font-medium">{money(record.outstandingMinor)}</dd>
      </dl>
      <p className="text-muted-foreground">
        Payments and advance allocations settle this invoice. They do not
        recognize another purchase cost or stock receipt, and do not prove bank
        settlement.
      </p>
      {record.recognitionId ? (
        <section className="grid gap-3">
          <h3 className="font-medium">Separate purchase facts</h3>
          <p>
            Invoice, ownership and goods received are recorded in the original
            agreement history.
          </p>
          <Button variant="outline" onClick={onRecognition}>
            View agreement and receipt history
          </Button>
        </section>
      ) : null}
      <section className="grid gap-3">
        <h3 className="font-medium">Payments</h3>
        {record.payments.length ? (
          record.payments.map((p) => (
            <div key={p.id} className="border-b pb-3">
              <p>
                {money(p.amountMinor)} · {p.account.name} ·{" "}
                {p.reversedAt ? "Reversed" : "Recorded"}
              </p>
              <p>
                {new Date(p.effectiveAt).toISOString()} (UTC)
                {p.reference ? ` · ${p.reference}` : ""}
              </p>
              {p.reversedAt ? (
                <p className="mt-1 text-muted-foreground">
                  Reversal{p.reversalEffectiveAt ? ` ${new Date(p.reversalEffectiveAt).toISOString()} (UTC)` : ""}
                  {p.reversalReason ? ` · ${p.reversalReason}` : ""}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <p>No cash payments recorded.</p>
        )}
        {record.paymentsHasMore ? (
          <p>
            Showing the latest 50 payments. Totals cover all recorded payments.
          </p>
        ) : null}
      </section>
      <section className="grid gap-3">
        <h3 className="font-medium">Advance allocations</h3>
        {record.allocations.length ? (
          record.allocations.map((a) => (
            <div key={a.id} className="border-b pb-3">
              <p>
                {money(a.amountMinor)} applied ·{" "}
                {new Date(a.effectiveAt).toISOString()} (UTC)
              </p>
              {a.releases.map((r) => (
                <p key={r.id}>
                  {money(r.amountMinor)} released · {r.reason} ·{" "}
                  {new Date(r.effectiveAt).toISOString()} (UTC)
                </p>
              ))}
              {a.releasesHasMore ? (
                <p>Showing the latest 50 releases for this allocation.</p>
              ) : null}
            </div>
          ))
        ) : (
          <p>No advances applied.</p>
        )}
        {record.allocationsHasMore ? (
          <p>
            Showing the latest 50 allocations. Totals cover all allocations.
          </p>
        ) : null}
      </section>
    </div>
  )
}
export function PurchaseBillDetailsSheet() {
  const [{ purchaseBill, purchaseBillBook }, setParams] = useQueryStates(
    {
      purchaseBill: parseAsString,
      purchaseBillBook: parseAsString,
      purchaseRegistration: parseAsString,
      purchaseRegistrationBook: parseAsString,
    },
    { history: "push", shallow: true },
  )
  const trpc = useTRPC()
  const query = useQuery(
    trpc.finance.purchase.queryOptions(
      { bookId: purchaseBillBook ?? "", billId: purchaseBill ?? "" },
      {
        enabled: Boolean(purchaseBill && purchaseBillBook),
        retry: false,
        staleTime: 0,
      },
    ),
  )
  const close = () => setParams({ purchaseBill: null, purchaseBillBook: null })
  return (
    <Sheet
      open={Boolean(purchaseBill)}
      onOpenChange={(open) => {
        if (!open) void close()
      }}
    >
      {purchaseBill ? (
        <SheetFrame
          title="Purchase invoice"
          description="Recorded settlement and separate purchase facts."
        >
          {!purchaseBillBook ? (
            <p role="alert">The Finance Book is missing from this receipt.</p>
          ) : query.isPending ? (
            <output>Loading purchase invoice…</output>
          ) : query.isError ? (
            <div role="alert" className="grid gap-3">
              <p>{query.error.message}</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <PurchaseBillDetails
              record={query.data}
              onRecognition={() =>
                void setParams({
                  purchaseBill: null,
                  purchaseBillBook: null,
                  purchaseRegistration: query.data.recognitionId,
                  purchaseRegistrationBook: purchaseBillBook,
                })
              }
            />
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
