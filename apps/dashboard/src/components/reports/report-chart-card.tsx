"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@ewatrade/ui"
import { type ReactNode, useId, useState } from "react"

/** The table every chart offers, so no value is only in a tooltip. */
export type ReportChartTable = {
  columns: string[]
  /** Columns from this index are right-aligned numbers. */
  numericFrom: number
  rows: Array<{ key: string; cells: ReactNode[] }>
}

/** A chart card: title, dates, optional note, the chart and its table. */
export function ReportChartCard({
  action,
  children,
  className,
  note,
  subtitle,
  table,
  title,
}: {
  action?: ReactNode
  children: ReactNode
  className?: string
  note?: ReactNode
  subtitle: ReactNode
  table?: ReportChartTable
  title: string
}) {
  const [showTable, setShowTable] = useState(false)
  const tableId = useId()
  return (
    <section
      aria-label={title}
      className={cn(
        "grid min-w-0 content-start gap-3.5 border border-border bg-background p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {action}
      </div>
      {note ? (
        <p className="border-l-2 border-border pl-2.5 text-sm text-muted-foreground">
          {note}
        </p>
      ) : null}
      {children}
      {table ? (
        <>
          <button
            aria-controls={tableId}
            aria-expanded={showTable}
            className="justify-self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            onClick={() => setShowTable((value) => !value)}
            type="button"
          >
            {showTable ? "Hide table" : "Show as table"}
          </button>
          {showTable ? (
            <section
              aria-label={`${title} table`}
              className="max-h-80 overflow-auto border border-border"
              id={tableId}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the report table.
              tabIndex={0}
            >
              <Table className="w-full text-left text-sm">
                <TableHeader className="sticky top-0 bg-muted text-xs text-muted-foreground">
                  <TableRow>
                    {table.columns.map((column, index) => (
                      <TableHead
                        className={cn(
                          "px-4 py-2 font-normal",
                          index >= table.numericFrom && "text-right",
                        )}
                        key={column}
                        scope="col"
                      >
                        {column}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {table.rows.map((row) => (
                    <TableRow
                      className="border-b border-border/70 last:border-b-0"
                      key={row.key}
                    >
                      {row.cells.map((cell, index) => (
                        <TableCell
                          className={cn(
                            "px-4 py-2",
                            index >= table.numericFrom &&
                              "text-right tabular-nums",
                          )}
                          // biome-ignore lint/suspicious/noArrayIndexKey: cells are fixed columns.
                          key={index}
                        >
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

/** Shown in place of a chart when the dates have nothing to plot. */
export function ReportChartEmpty({
  action,
  description,
  title,
}: {
  action?: ReactNode
  description: string
  title: string
}) {
  return (
    <div className="grid min-h-52 place-items-center border border-dashed border-border p-4 text-center">
      <div className="grid justify-items-center gap-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  )
}

/** Legend for two or more series: swatch, name and period total. */
export function ReportChartLegend({
  items,
}: {
  items: Array<{ color: string; label: string; value?: string }>
}) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
      {items.map((item) => (
        <li className="inline-flex items-center gap-2" key={item.label}>
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[2px]"
            style={{ background: item.color }}
          />
          {item.label}
          {item.value ? (
            <span className="font-semibold tabular-nums">{item.value}</span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
