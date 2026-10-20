"use client"

import {
  InlineRowCheckbox,
  InlineSelectAllCheckbox,
  InlineSelectionStatus,
  useInlineSelection,
} from "@/components/tables/core"
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
import { useMemo } from "react"
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
  // Source entries only; aging buckets are aggregates and stay unselectable.
  const sourceIds = useMemo(
    () => aging.data.map((source) => source.sourceEntryId),
    [aging.data],
  )
  const selection = useInlineSelection({
    ids: sourceIds,
    scope: `${aging.snapshotSequence}:${aging.asOfDate}:${page}`,
  })
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div>
        <h3 className="font-medium">{aging.supplier.name}</h3>
        <p className="text-sm text-muted-foreground">{aging.supplier.code}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        All stores, including starting balances not tied to a store. On{" "}
        {aging.asOfDate}.
      </p>
      <dl
        data-summary-grid
        data-summary-money
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <div>
          <dt className="text-sm text-muted-foreground">You owe</dt>
          <dd className="text-lg font-medium tabular-nums">
            {money(aging.payableMinor)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Paid ahead</dt>
          <dd className="text-lg font-medium tabular-nums">
            {money(aging.advanceMinor)}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        Money paid ahead is kept apart from what you owe. Payments up to this
        day reduce what is still to pay. Each bill is placed by its original due
        date; a bill with no due date goes under No due date.
      </p>
      <section className="border border-border" aria-label="When it's due">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">When it was due</TableHead>
              <TableHead scope="col" className="text-right">
                You owe
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aging.buckets.map(({ bucket, amountMinor, sourceCount }) => (
              <TableRow key={bucket}>
                <TableCell>
                  <p>{supplierAgingBucketLabels[bucket]}</p>
                  <p className="text-xs text-muted-foreground">
                    {sourceCount} {sourceCount === 1 ? "bill" : "bills"}
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
        <h4 className="font-medium">Still to pay</h4>
        <p className="text-xs text-muted-foreground">
          Page {page} · {aging.outstandingSourceCount} still to pay ·{" "}
          {aging.sourcesRead} entries checked. Totals stay the same as you
          change pages.
        </p>
      </div>
      <InlineSelectionStatus selection={selection} />
      <section
        className="overflow-x-auto border border-border"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Wide source table supports keyboard scrolling.
        tabIndex={0}
        aria-label="Bills still to pay"
      >
        <Table className="min-w-[660px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="w-10">
                <InlineSelectAllCheckbox
                  selection={selection}
                  label="Select all loaded bills"
                />
              </TableHead>
              <TableHead scope="col">What</TableHead>
              <TableHead scope="col">Due date</TableHead>
              <TableHead scope="col" className="text-right">
                Billed
              </TableHead>
              <TableHead scope="col" className="text-right">
                Still to pay
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aging.data.length ? (
              aging.data.map((source) => (
                <TableRow
                  key={source.sourceEntryId}
                  data-state={
                    selection.isSelected(source.sourceEntryId)
                      ? "selected"
                      : undefined
                  }
                >
                  <TableCell className="align-top">
                    <InlineRowCheckbox
                      selection={selection}
                      id={source.sourceEntryId}
                      label={`Select bill ${source.sequence}`}
                    />
                  </TableCell>
                  <TableCell className="max-w-sm align-top">
                    <p className="break-words">{source.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {source.kind === "OPENING_PAYABLE"
                        ? "Owed before you started"
                        : "Bill"}{" "}
                      · #{source.sequence}
                      {source.reference ? ` · ${source.reference}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Billed{" "}
                      {new Date(source.incurredAt).toISOString().slice(0, 10)}
                    </p>
                  </TableCell>
                  <TableCell className="align-top">
                    <p className="whitespace-nowrap">
                      {source.dueAt
                        ? new Date(source.dueAt).toISOString().slice(0, 10)
                        : "No due date"}
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
                <TableCell colSpan={5}>Nothing to pay on this day.</TableCell>
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
