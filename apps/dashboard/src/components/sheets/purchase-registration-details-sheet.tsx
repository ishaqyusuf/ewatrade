"use client"
import { useTRPC } from "@/trpc/client"
import { generalMoney } from "@ewatrade/assistant/general/contracts"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { parseAsString, useQueryStates } from "nuqs"
import { SheetFrame } from "./sheet-frame"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

export function PurchaseRegistrationDetails({
  record,
}: { record: RouterOutputs["finance"]["purchaseRecognition"] }) {
  return (
    <div className="grid gap-6 text-sm">
      <div>
        <h3 className="font-medium">{record.supplierName}</h3>
        <p className="mt-1">{record.description}</p>
        <p className="mt-2 text-muted-foreground">
          Agreed {new Date(record.agreedAt).toISOString()} (UTC)
        </p>
        <p className="mt-2 text-lg font-medium">
          {generalMoney(record.amountMinor, record.currencyCode)} agreed
        </p>
      </div>
      <p className="text-muted-foreground">
        Registration records agreed goods and costs. It does not create a
        payable, payment or stock receipt.
      </p>
      <section className="grid gap-3">
        <h3 className="font-medium">Agreed goods</h3>
        {record.lines.map((line) => (
          <div key={line.id} className="border-b pb-3">
            <p>{line.description}</p>
            <p>
              {line.enteredQuantity} {line.enteredUnitName} ·{" "}
              {generalMoney(line.amountMinor, record.currencyCode)} total
            </p>
            {line.receipt ? (
              <p className="text-muted-foreground">
                Receipt source recorded · valuation{" "}
                {line.receipt.valuation?.status.toLowerCase() ?? "unavailable"}
              </p>
            ) : null}
          </div>
        ))}
      </section>
      <section className="grid gap-3">
        <h3 className="font-medium">Recognition history</h3>
        {record.events.length === 0 ? (
          <p>No invoice, ownership or receipt events recorded.</p>
        ) : (
          record.events.map((event) => (
            <div key={event.id} className="border-b pb-3">
              <p className="font-medium">
                {event.stage.toLowerCase().replaceAll("_", " ")} ·{" "}
                {event.reversalOfId
                  ? "Correction"
                  : event.reversalId
                    ? "Reversed"
                    : "Recorded"}
              </p>
              <p>{new Date(event.effectiveAt).toISOString()} (UTC)</p>
              <p>{event.reference}</p>
              {event.reason ? <p>{event.reason}</p> : null}
            </div>
          ))
        )}
      </section>
      <p className="text-muted-foreground">
        Invoice, ownership and physical receipt are separate events. History
        does not show current cash paid or outstanding balances.
      </p>
    </div>
  )
}
export function PurchaseRegistrationDetailsSheet() {
  const [{ purchaseRegistration, purchaseRegistrationBook }, setParams] =
    useQueryStates(
      {
        purchaseRegistration: parseAsString,
        purchaseRegistrationBook: parseAsString,
      },
      { history: "push" },
    )
  const trpc = useTRPC()
  const query = useQuery(
    trpc.finance.purchaseRecognition.queryOptions(
      {
        bookId: purchaseRegistrationBook ?? "",
        recognitionId: purchaseRegistration ?? "",
      },
      {
        enabled: Boolean(purchaseRegistration && purchaseRegistrationBook),
        retry: false,
        staleTime: 0,
      },
    ),
  )
  return (
    <Sheet
      open={Boolean(purchaseRegistration)}
      onOpenChange={(open) => {
        if (!open)
          void setParams({
            purchaseRegistration: null,
            purchaseRegistrationBook: null,
          })
      }}
    >
      {purchaseRegistration ? (
        <SheetFrame
          title="Purchase agreement"
          description="Recorded agreement and separate recognition events."
        >
          {!purchaseRegistrationBook ? (
            <p role="alert">The Finance Book is missing from this receipt.</p>
          ) : query.isPending ? (
            <output>Loading purchase agreement…</output>
          ) : query.isError ? (
            <div role="alert" className="grid gap-3">
              <p>{query.error.message}</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <PurchaseRegistrationDetails record={query.data} />
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
