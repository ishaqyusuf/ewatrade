"use client"
import type { GeneralReviewPresentation } from "@ewatrade/assistant/general/contracts"
import { cn } from "@ewatrade/ui"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"

/**
 * Any draft's structured review: who and how much, short facts, a table and
 * folded sections (workshop direction 01, "Invoice summary").
 */
export function GeneralReviewPresentationBody({
  presentation: p,
}: {
  presentation: GeneralReviewPresentation
}) {
  const [allRows, setAllRows] = useState(false)
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  const table = p.table
  const preview = table?.preview ?? table?.rows.length ?? 0
  const folded = !!table && !allRows && table.rows.length > preview + 1
  const rows = folded ? table.rows.slice(0, preview) : (table?.rows ?? [])
  const toggle = (index: number) =>
    setOpen((current) => {
      const next = new Set(current)
      if (!next.delete(index)) next.add(index)
      return next
    })
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="min-w-0">
        {/* With an amount, the amount leads; without one, the subject does. */}
        {p.summary.amount ? (
          <p className="text-xs text-muted-foreground">
            {p.summary.party}
            {p.summary.context ? ` · ${p.summary.context}` : null}
          </p>
        ) : (
          <>
            <p className="text-base leading-tight font-semibold">
              {p.summary.party}
              {p.summary.amountLabel ? (
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  {p.summary.amountLabel}
                </span>
              ) : null}
            </p>
            {p.summary.context ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {p.summary.context}
              </p>
            ) : null}
          </>
        )}
        {p.summary.amount ? (
          <p className="text-xl leading-tight font-semibold tabular-nums">
            {p.summary.amount}{" "}
            {p.summary.amountLabel ? (
              <span className="text-sm font-normal text-muted-foreground">
                {p.summary.amountLabel}
              </span>
            ) : null}
          </p>
        ) : null}
        {p.facts?.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {p.facts.map((fact, index) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: facts have no ids
                key={index}
                className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                {fact.label ? `${fact.label} ` : null}
                <span
                  className={cn(fact.label && "font-medium text-foreground")}
                >
                  {fact.value}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {table ? (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              {table.columns.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  className={cn(
                    "py-1 font-normal whitespace-nowrap",
                    column.align === "end" ? "pl-3 text-right" : "text-left",
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows have no ids
              <tr key={index} className="border-b border-border/60 align-top">
                {row.cells.map((cell, at) => (
                  <td
                    // biome-ignore lint/suspicious/noArrayIndexKey: cells have no ids
                    key={at}
                    className={cn(
                      "py-1.5",
                      table.columns[at]?.align === "end"
                        ? "pl-3 text-right whitespace-nowrap tabular-nums"
                        : "pr-2",
                    )}
                  >
                    {cell}
                    {at === 0 && row.detail ? (
                      <span className="block text-xs text-muted-foreground">
                        {row.detail}
                      </span>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
            {table.rows.length > preview + 1 ? (
              <tr>
                <td colSpan={table.columns.length} className="py-1">
                  <button
                    type="button"
                    className="rounded text-xs text-muted-foreground hover:text-foreground"
                    aria-expanded={allRows}
                    onClick={() => setAllRows((value) => !value)}
                  >
                    {allRows
                      ? "Show fewer"
                      : `+ ${table.rows.length - preview} more`}
                  </button>
                </td>
              </tr>
            ) : null}
            {table.total ? (
              <tr className="font-semibold">
                <td className="pt-2">{table.total.label}</td>
                <td
                  colSpan={table.columns.length - 1}
                  className="pt-2 text-right tabular-nums"
                >
                  {table.total.value}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
      {p.sections?.length ? (
        <div className="-mx-4 divide-y border-t">
          {p.sections.map((section, index) => {
            const shown = open.has(index)
            return (
              <div key={section.title}>
                <button
                  type="button"
                  aria-expanded={shown}
                  onClick={() => toggle(index)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-xs text-muted-foreground hover:bg-muted/50"
                >
                  <span>
                    {section.title}
                    {section.summary ? (
                      <span className="tabular-nums"> · {section.summary}</span>
                    ) : null}
                  </span>
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    className={cn(
                      "size-3.5 shrink-0 transition-transform",
                      shown && "rotate-180",
                    )}
                  />
                </button>
                {shown ? (
                  <div className="flex flex-col gap-2 px-4 pb-3 text-sm">
                    {section.rows?.length ? (
                      <ul className="flex flex-col gap-1.5">
                        {section.rows.map((row, at) => (
                          <li
                            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no ids
                            key={at}
                            className="flex justify-between gap-x-4"
                          >
                            <span className="min-w-0 flex-1">
                              {row.label}
                              {row.detail ? (
                                <span className="block text-xs text-muted-foreground">
                                  {row.detail}
                                </span>
                              ) : null}
                            </span>
                            <span className="max-w-[45%] shrink-0 text-right tabular-nums">
                              {row.value}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {section.chips?.length ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {section.chips.map((chip) => (
                          <li
                            key={chip.label}
                            className={cn(
                              "rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground",
                              chip.isNew && "border-dashed",
                            )}
                          >
                            {chip.label}
                            {chip.isNew ? " · new" : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {section.note ? (
                      <p className="text-xs text-muted-foreground">
                        {section.note}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
      {p.note ? (
        <p className="text-xs text-muted-foreground">{p.note}</p>
      ) : null}
    </div>
  )
}
