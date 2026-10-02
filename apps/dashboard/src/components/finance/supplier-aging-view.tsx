"use client"

import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import {
  type SupplierAging,
  supplierAgingBucketLabels,
} from "./supplier-aging-state"

export function FinanceSupplierAgingView({
  aging,
  page,
  onPrevious,
  onNext,
}: {
  aging: SupplierAging
  page: number
  onPrevious: () => void
  onNext: () => void
}) {
  const money = (value: string) => formatFinanceMoney(value, aging.currencyCode)
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div>
        <h3 className="font-medium">{aging.supplier.name}</h3>
        <p className="text-sm text-muted-foreground">{aging.supplier.code}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        All Stores, including unassigned opening balances. As of{" "}
        {aging.asOfDate} UTC · Snapshot {aging.snapshotSequence}.
      </p>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted-foreground">Recorded payable</dt>
          <dd className="text-lg font-medium tabular-nums">
            {money(aging.payableMinor)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Unapplied advance</dt>
          <dd className="text-lg font-medium tabular-nums">
            {money(aging.advanceMinor)}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        Advances remain separate from payables. Recorded payments, allocations
        and corrections through this UTC day and snapshot reduce outstanding
        sources. Aging uses each source’s original due date; a missing due date
        stays undated.
      </p>
      <section
        className="border border-border"
        aria-label="Payable aging buckets"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Original due date bucket</TableHead>
              <TableHead scope="col" className="text-right">
                Recorded payable
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aging.buckets.map(({ bucket, amountMinor, sourceCount }) => (
              <TableRow key={bucket}>
                <TableCell>
                  <p>{supplierAgingBucketLabels[bucket]}</p>
                  <p className="text-xs text-muted-foreground">
                    {sourceCount} {sourceCount === 1 ? "source" : "sources"}
                  </p>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(amountMinor)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <div>
        <h4 className="font-medium">Outstanding recorded sources</h4>
        <p className="text-xs text-muted-foreground">
          Page {page} · {aging.outstandingSourceCount} outstanding sources ·{" "}
          {aging.sourcesRead} recorded entries checked. Full aging totals stay
          pinned when paging.
        </p>
      </div>
      <section
        className="overflow-x-auto border border-border"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Wide source table supports keyboard scrolling.
        tabIndex={0}
        aria-label="Outstanding supplier payable sources"
      >
        <Table className="min-w-[620px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Record</TableHead>
              <TableHead scope="col">Original due (UTC)</TableHead>
              <TableHead scope="col" className="text-right">
                Original
              </TableHead>
              <TableHead scope="col" className="text-right">
                Outstanding
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aging.data.length ? (
              aging.data.map((source) => (
                <TableRow key={source.sourceEntryId}>
                  <TableCell className="max-w-sm align-top">
                    <p className="break-words">{source.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {source.kind === "OPENING_PAYABLE"
                        ? "Opening payable"
                        : "Purchase bill"}{" "}
                      · #{source.sequence}
                      {source.reference ? ` · ${source.reference}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Recorded{" "}
                      {new Date(source.incurredAt).toISOString().slice(0, 10)}{" "}
                      UTC
                    </p>
                  </TableCell>
                  <TableCell className="align-top">
                    <p className="whitespace-nowrap">
                      {source.dueAt
                        ? new Date(source.dueAt).toISOString().slice(0, 10)
                        : "No due date recorded"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {supplierAgingBucketLabels[source.bucket]}
                    </p>
                  </TableCell>
                  <TableCell className="text-right align-top tabular-nums">
                    {money(source.originalMinor)}
                  </TableCell>
                  <TableCell className="text-right align-top tabular-nums">
                    {money(source.outstandingMinor)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4}>
                  No outstanding recorded payables at this day and snapshot.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
      <div className="flex flex-wrap gap-2">
        <Button
          appearance="form"
          variant="outline"
          disabled={page === 1}
          onClick={onPrevious}
        >
          Previous page
        </Button>
        <Button
          appearance="form"
          variant="outline"
          disabled={!aging.nextCursor}
          onClick={onNext}
        >
          Next page
        </Button>
      </div>
    </div>
  )
}
