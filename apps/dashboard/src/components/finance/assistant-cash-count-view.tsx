"use client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
type Count = RouterOutputs["finance"]["cashCount"]
export function AssistantCashCountView({ count }: { count: Count }) {
  return (
    <div className="grid gap-5 text-sm">
      <div>
        <h3 className="text-lg font-medium">{count.accountName}</h3>
        <p className="text-muted-foreground">Current account name</p>
        <p className="text-muted-foreground">
          {new Date(count.asOf).toISOString()} UTC
        </p>
      </div>
      <p>{count.reference}</p>
      <dl className="grid gap-4">
        {[
          [
            "Cash physically counted",
            formatFinanceMoney(count.observedBalanceMinor, count.currencyCode),
          ],
          [
            "Original posted balance",
            formatFinanceMoney(count.expectedBalanceMinor, count.currencyCode),
          ],
          [
            "Original difference",
            formatFinanceMoney(count.differenceMinor, count.currencyCode),
          ],
          ["Original ledger snapshot", count.snapshotSequence],
          ["Current ledger snapshot", count.currentSnapshotSequence],
          ["Recorded at (UTC)", new Date(count.recordedAt).toISOString()],
          ["Current review", count.status.toLowerCase().replaceAll("_", " ")],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-words text-base font-medium tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="border border-border p-4">
        {count.reviewRequired
          ? "Review required: later postings changed the account history at or before this count time. The original observation and difference are preserved."
          : count.status === "MATCHED"
            ? "This original count matched the posted balance. Complete operational reconciliation remains a separate review."
            : "The original difference remains visible. Investigate missing or incorrect transactions before any separately reviewed correction."}
      </p>
      {count.adjustment ? (
        <div className="grid gap-2 border border-border p-4">
          <h4 className="font-medium">Separate adjustment history</h4>
          <p>{count.adjustment.description}</p>
          <p>
            Recorded {new Date(count.adjustment.recordedAt).toISOString()} UTC.
          </p>
          {count.adjustment.reversal ? (
            <p>
              Reversed by {count.adjustment.reversal.id} at{" "}
              {new Date(count.adjustment.reversal.recordedAt).toISOString()}{" "}
              UTC.
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="text-muted-foreground">
        This record preserves the physical observation. Opening it performs no
        adjustment, stock closeout, date lock or fiscal close.
      </p>
    </div>
  )
}
