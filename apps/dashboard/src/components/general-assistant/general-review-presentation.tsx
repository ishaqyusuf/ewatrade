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
  expanded = false,
}: {
  presentation: GeneralReviewPresentation
  expanded?: boolean
}) {
  const [allRows, setAllRows] = useState(expanded)
  const [open, setOpen] = useState<ReadonlySet<number>>(
    () => new Set(expanded ? p.sections?.map((_, index) => index) : []),
  )
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
                className={cn(
                  "text-xs text-muted-foreground",
                  // Long facts (a category path) wrap as plain text; a pill
                  // stretched over several lines reads as a blob.
                  `${fact.label ?? ""} ${fact.value}`.length > 32
                    ? "basis-full"
                    : "rounded-full border px-2.5 py-0.5",
                )}
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
        // A stacked list, not a table: assistant output never uses
        // multi-column tables because owners read it on a phone.
        <div className="flex flex-col text-sm">
          <ul className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {rows.map((row, index) => {
              const [name, lead, ...rest] = row.cells
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows have no ids
                <li key={index} className="flex flex-col gap-0.5 py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 font-medium">{name}</span>
                    {lead !== undefined ? (
                      <span className="shrink-0 text-right tabular-nums">
                        {lead}
                      </span>
                    ) : null}
                  </div>
                  {row.detail || rest.length ? (
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted-foreground">
                      <span>{row.detail}</span>
                      {rest.length ? (
                        <span className="tabular-nums">
                          {rest.map((cell, at) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: cells have no ids
                            <span key={at}>
                              {at ? " · " : null}
                              {table.columns[at + 2]?.label}{" "}
                              <span className="text-foreground">{cell}</span>
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {table.rows.length > preview + 1 ? (
            <button
              type="button"
              className="self-start rounded py-1 text-xs text-muted-foreground hover:text-foreground"
              aria-expanded={allRows}
              onClick={() => setAllRows((value) => !value)}
            >
              {allRows ? "Show fewer" : `+ ${table.rows.length - preview} more`}
            </button>
          ) : null}
          {table.total ? (
            <div className="flex justify-between gap-3 pt-2 font-semibold">
              <span>{table.total.label}</span>
              <span className="tabular-nums">{table.total.value}</span>
            </div>
          ) : null}
        </div>
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
