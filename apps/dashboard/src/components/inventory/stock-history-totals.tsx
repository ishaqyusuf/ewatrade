"use client"
import { useStockCategoryNames } from "@/components/inventory/stock-history-filters"
import { useInventoryLedgerParams } from "@/hooks/use-inventory-ledger-params"
import { useMobileOverlay } from "@/hooks/use-mobile-overlay"
import { useStockHistoryCategoryParams } from "@/hooks/use-stock-history-filter-params"
import {
  stockHistoryTotalsInput,
  stockNetChangeText,
  stockTotalsFromText,
  stockTotalsScopeNote,
} from "@/lib/inventory-labels"
import { useTRPC } from "@/trpc/client"
import { cn } from "@/utils"
import { compareExactDecimals } from "@ewatrade/utils/exact-decimal"
import {
  ArrowDown01Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useId, useState } from "react"

/**
 * Net change for the Store and category filter, between the toolbar and the
 * Stock history list. Search and the change group narrow only the list.
 */
export function StockHistoryTotals({
  storeId,
  storeLabel,
}: {
  storeId?: string
  storeLabel: string
}) {
  const trpc = useTRPC()
  const id = useId()
  const mobile = useMobileOverlay()
  const [open, setOpen] = useState(true)
  const [all, setAll] = useState(false)
  const { params } = useInventoryLedgerParams()
  const { filter } = useStockHistoryCategoryParams()
  const nameOf = useStockCategoryNames(filter.categoryNameIds)
  const totals = useQuery(
    trpc.inventory.operationTotals.queryOptions(
      stockHistoryTotalsInput({ storeId, categories: filter }),
    ),
  )
  const scope = filter.uncategorized
    ? "Uncategorized"
    : filter.categoryNameIds.length
      ? filter.categoryNameIds.map(nameOf).join(" + ")
      : "All changes"
  const note = stockTotalsScopeNote({
    q: params.q,
    filter: params.filter,
    categories: filter.uncategorized
      ? "uncategorized"
      : filter.categoryNameIds.length
        ? "names"
        : "none",
    storeLabel,
  })
  const rows = totals.data?.rows ?? []
  const limit = mobile ? 2 : 3
  const shown = all ? rows : rows.slice(0, limit)
  return (
    <section aria-label="Net change" className="border border-border">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 items-center gap-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className={cn(
              "size-4 shrink-0 transition-transform",
              !open && "-rotate-90",
            )}
          />
          <span className="font-medium">Net change</span>
          <span className="truncate text-muted-foreground">
            {scope} · {storeLabel}
          </span>
        </button>
        <span className="ml-auto text-xs text-muted-foreground">
          {totals.data ? stockTotalsFromText(totals.data) : null}
        </span>
      </div>
      <div id={id} hidden={!open} className="border-t border-border">
        {note ? (
          <p className="flex items-start gap-2 bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
            <HugeiconsIcon
              icon={InformationCircleIcon}
              className="mt-0.5 size-3.5 shrink-0"
            />
            <span>{note}</span>
          </p>
        ) : null}
        {totals.isPending ? (
          <output className="block px-4 py-3 text-sm text-muted-foreground">
            Adding up changes…
          </output>
        ) : totals.isError ? (
          <div role="alert" className="px-4 py-3 text-sm">
            Could not add up these changes.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => void totals.refetch()}
            >
              Try again
            </button>
          </div>
        ) : !rows.length ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            {filter.uncategorized || filter.categoryNameIds.length
              ? "No changes with these categories."
              : "No stock changes yet."}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {shown.map((row) => {
                const net = compareExactDecimals(row.netCanonicalQuantity, "0")
                return (
                  <li
                    key={`${row.storeId}:${row.variantId}:${row.configurationVersionId}`}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {row.productName ?? "Product"}
                      {row.variantName && row.variantName !== row.productName
                        ? ` · ${row.variantName}`
                        : ""}
                      {storeId ? null : (
                        <span className="text-muted-foreground">
                          {" "}
                          · {row.storeName ?? "Store"}
                        </span>
                      )}
                    </span>
                    <b
                      className={cn(
                        "font-medium tabular-nums",
                        net > 0 && "text-primary",
                        net < 0 && "text-destructive",
                      )}
                    >
                      {stockNetChangeText(
                        row.netCanonicalQuantity,
                        row.canonicalUnitName,
                      )}
                    </b>
                    <span className="w-28 text-right text-xs text-muted-foreground">
                      From {row.operationCount} change
                      {row.operationCount === 1 ? "" : "s"}
                    </span>
                  </li>
                )
              })}
            </ul>
            {rows.length > limit ? (
              <button
                type="button"
                aria-expanded={all}
                onClick={() => setAll(!all)}
                className="w-full border-t border-border px-4 py-2 text-left text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {all ? "Show less" : `Show all ${rows.length}`}
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
