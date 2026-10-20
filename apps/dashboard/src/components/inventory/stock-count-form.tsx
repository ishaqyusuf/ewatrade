"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { useInventoryParams } from "@/hooks/use-inventory-params"
import { stockDate } from "@/lib/inventory-labels"
import {
  normalizeQuantityInput,
  plainQuantityError,
} from "@/lib/inventory-quantity"
import {
  formatInventoryQuantity,
  formatStockQuantity,
  pluralizeUnitName,
} from "@/lib/inventory-view"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  Button,
  Checkbox,
  ControlField,
  Input,
  Textarea,
  cn,
  toast,
} from "@ewatrade/ui"
import {
  compareExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { useMemo, useState } from "react"

type StoreSummary = { currencyCode: string; id: string; name: string }
type Balance = RouterOutputs["inventory"]["balanceReport"]["rows"][number]
type Review = RouterOutputs["inventory"]["stockCountReview"]

function productLabel(row: {
  productName: string
  variantName: string
  kind?: string
  inventoryUnitName?: string
}) {
  return [
    row.productName,
    row.variantName && row.variantName !== row.productName
      ? row.variantName
      : null,
    row.kind === "PACKAGED_STOCK" && row.inventoryUnitName
      ? `Packed: ${row.inventoryUnitName}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

/** "+3 eggs" or "−24 eggs". */
function signedQuantity(value: string, unit: string) {
  const sign = compareExactDecimals(value, "0") < 0 ? "−" : "+"
  return `${sign}${formatStockQuantity(value.replace(/^-/, ""), unit)}`
}

/**
 * Count several products in one go. A count is saved as a draft; Finish
 * shows the differences from the saved draft before stock changes. Saved
 * drafts can be finished or discarded later.
 */
export function StockCountForm({ store }: { store: StoreSummary }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { balanceId, setParams } = useInventoryParams()
  const { data: report } = useSuspenseQuery(
    trpc.inventory.balanceReport.queryOptions(
      { storeId: store.id },
      { retry: false },
    ),
  )
  const rows = useMemo(
    () => report.rows.filter((row) => row.custodyType === "STORE"),
    [report.rows],
  )
  const drafts = useQuery(
    trpc.inventory.stockCounts.queryOptions({ storeId: store.id }),
  )
  const [picked, setPicked] = useState<Record<string, boolean>>(() =>
    balanceId ? { [balanceId]: true } : {},
  )
  const [counted, setCounted] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  // The count being reviewed: just saved by Finish, or a saved draft opened.
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [reviewFromSaved, setReviewFromSaved] = useState(false)
  // The draft this form saved with Finish; changing the count replaces it.
  const [ownDraftId, setOwnDraftId] = useState<string | null>(null)

  const review = useQuery(
    trpc.inventory.stockCountReview.queryOptions(
      { stockCountId: reviewId ?? "", storeId: store.id },
      { enabled: Boolean(reviewId), retry: false, staleTime: 0 },
    ),
  )

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.inventory.stockCounts.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.inventory.balanceReport.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.inventory.operationHistory.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.inventory.stockCountReview.pathKey(),
      }),
    ])
  }
  const create = useMutation(trpc.inventory.createStockCount.mutationOptions())
  const finalize = useMutation(
    trpc.inventory.finalizeStockCount.mutationOptions(),
  )
  const discard = useMutation(
    trpc.inventory.discardStockCount.mutationOptions(),
  )
  const pending = create.isPending || finalize.isPending || discard.isPending

  const savedDrafts = (drafts.data ?? []).filter(
    (draft) => draft.id !== ownDraftId,
  )
  const shown = rows.filter((row) =>
    `${row.productName} ${row.variantName} ${row.inventoryUnitName}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  )
  const chosen = rows.filter((row) => picked[row.balanceSourceId])
  const filled = chosen.filter(
    (row) => normalizeQuantityInput(counted[row.balanceSourceId] ?? "") !== "",
  )

  function parseCount(row: Balance) {
    const typed = normalizeQuantityInput(counted[row.balanceSourceId] ?? "")
    if (!typed) return null
    try {
      return parseExactDecimal(typed, {
        allowZero: true,
        maxScale: row.inventoryUnitTransactionScale,
      })
    } catch (failure) {
      return {
        error: plainQuantityError(
          failure instanceof Error ? failure.message : "",
          pluralizeUnitName(row.inventoryUnitName),
        ),
      }
    }
  }

  /** Save the ticked, filled products as a draft; returns its id. */
  async function saveDraft() {
    setError(null)
    const errors: Record<string, string> = {}
    const lines = []
    for (const row of filled) {
      const value = parseCount(row)
      if (value && typeof value === "object") {
        errors[row.balanceSourceId] = value.error
        continue
      }
      if (value === null) continue
      lines.push({
        balanceSourceId: row.balanceSourceId,
        entries: [
          {
            enteredInventoryUnitId: row.inventoryUnitId,
            enteredQuantity: value,
          },
        ],
        expectedRevision: row.revision,
      })
    }
    setRowErrors(errors)
    if (Object.keys(errors).length) {
      setError("Fix the counts marked below.")
      return null
    }
    if (!lines.length) {
      setError("Count at least one product. You can type 0 for an empty shelf.")
      return null
    }
    try {
      // Changing a count after Finish replaces the draft it had saved.
      if (ownDraftId) {
        await discard.mutateAsync({
          stockCountId: ownDraftId,
          storeId: store.id,
        })
        setOwnDraftId(null)
      }
      const saved = await create.mutateAsync({
        actorNote: note.trim() || undefined,
        clientOperationId: crypto.randomUUID(),
        lines,
        schemaVersion: 1,
        storeId: store.id,
      })
      return saved.id
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The count couldn’t be saved. Try again.",
      )
      return null
    }
  }

  async function saveForLater() {
    const id = await saveDraft()
    if (!id) return
    await refresh()
    toast("Count saved. Open Count stock to finish it later.")
    void setParams(null)
  }

  async function finishStart() {
    const id = await saveDraft()
    if (!id) return
    setReviewFromSaved(false)
    setOwnDraftId(id)
    setReviewId(id)
    void queryClient.invalidateQueries({
      queryKey: trpc.inventory.stockCounts.queryKey(),
    })
  }

  async function finishNow(data: Review) {
    setError(null)
    try {
      await finalize.mutateAsync({
        clientOperationId: crypto.randomUUID(),
        reason: note.trim() || data.reason || "Stock count",
        schemaVersion: 1,
        stockCountId: data.id,
      })
      await refresh()
      const changed = data.lines.filter(
        (line) => compareExactDecimals(line.varianceQuantity, "0") !== 0,
      ).length
      toast(
        changed
          ? `Count finished. ${changed} product${changed === 1 ? "" : "s"} changed.`
          : "Count finished. Everything matched.",
      )
      void setParams(null)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The count couldn’t be finished. Try again.",
      )
    }
  }

  async function discardReviewed(data: Review) {
    setError(null)
    try {
      await discard.mutateAsync({ stockCountId: data.id, storeId: store.id })
      setReviewId(null)
      toast("Saved count discarded. Stock did not change.")
      void refresh()
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The count couldn’t be discarded. Try again.",
      )
    }
  }

  /** Start a fresh count from a saved one's numbers, then drop the old draft. */
  async function countAgain(data: Review) {
    const nextPicked: Record<string, boolean> = {}
    const nextCounted: Record<string, string> = {}
    for (const line of data.lines) {
      nextPicked[line.balanceSourceId] = true
      nextCounted[line.balanceSourceId] = line.stockCurrent
        ? line.observedQuantity
        : ""
    }
    setPicked(nextPicked)
    setCounted(nextCounted)
    if (data.reason) setNote(data.reason)
    try {
      await discard.mutateAsync({ stockCountId: data.id, storeId: store.id })
      void refresh()
    } catch {
      // The old draft stays listed; the new count is unaffected.
    }
    setReviewId(null)
  }

  if (reviewId) {
    const data = review.data
    return (
      <div className="grid gap-4 text-sm">
        {error ? (
          <FormFeedback appearance="dashboard">{error}</FormFeedback>
        ) : null}
        {review.isPending ? (
          <output>Loading the count…</output>
        ) : review.isError || !data ? (
          <div role="alert" className="grid gap-3">
            <p>This count couldn’t load. Try again.</p>
            <Button variant="outline" onClick={() => void review.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <CountReview
            data={data}
            fromSaved={reviewFromSaved}
            pending={pending}
            onBack={() => setReviewId(null)}
            onFinish={() => void finishNow(data)}
            onDiscard={() => void discardReviewed(data)}
            onCountAgain={() => void countAgain(data)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-4 text-sm">
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
      {savedDrafts.length ? (
        <section className="grid gap-2 border border-border p-3">
          <h3 className="font-medium">Saved counts</h3>
          <ul className="grid gap-1">
            {savedDrafts.map((draft) => (
              <li
                key={draft.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span>
                  {draft.reason || "Count"} · {draft.lineCount} product
                  {draft.lineCount === 1 ? "" : "s"} · saved{" "}
                  {stockDate(draft.createdAt)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setError(null)
                    setReviewFromSaved(true)
                    setReviewId(draft.id)
                  }}
                >
                  Open
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="text-muted-foreground">
        Tick what you are counting and type what is on the shelf. You can type
        0. Nothing changes until you finish.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Search products"
          placeholder="Search products"
          className="h-9 max-w-60"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setPicked((current) => {
              const next = { ...current }
              for (const row of shown) next[row.balanceSourceId] = true
              return next
            })
          }
        >
          Tick all shown
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPicked({})}>
          Untick all
        </Button>
      </div>
      <div className="max-h-[420px] overflow-auto border border-border">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="w-10 px-3 py-2 font-normal">
                <span className="sr-only">Count this</span>
              </th>
              <th className="px-3 py-2 font-normal">Product</th>
              <th className="px-3 py-2 text-right font-normal">Expected</th>
              <th className="px-3 py-2 font-normal">Counted</th>
              <th className="px-3 py-2 text-right font-normal">Difference</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const on = Boolean(picked[row.balanceSourceId])
              const value = on ? parseCount(row) : null
              const difference =
                typeof value === "string"
                  ? subtractExactDecimals(value, row.onHandQuantity)
                  : null
              const belowHeld =
                typeof value === "string" &&
                compareExactDecimals(row.reservedQuantity, "0") > 0 &&
                compareExactDecimals(value, row.reservedQuantity) < 0
              const label = productLabel(row)
              return (
                <tr
                  key={row.balanceSourceId}
                  className={cn(
                    "border-b border-border align-top",
                    !on && "text-muted-foreground",
                  )}
                >
                  <td className="px-3 py-2">
                    <Checkbox
                      aria-label={`Count ${label}`}
                      checked={on}
                      onCheckedChange={(checked) =>
                        setPicked((current) => ({
                          ...current,
                          [row.balanceSourceId]: Boolean(checked),
                        }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">{label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatStockQuantity(
                      row.onHandQuantity,
                      row.inventoryUnitName,
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={`Counted ${label}`}
                        inputMode="decimal"
                        className="h-9 w-24"
                        value={counted[row.balanceSourceId] ?? ""}
                        aria-invalid={Boolean(rowErrors[row.balanceSourceId])}
                        onChange={(event) => {
                          const next = event.target.value
                          setCounted((current) => ({
                            ...current,
                            [row.balanceSourceId]: next,
                          }))
                          if (next.trim())
                            setPicked((current) => ({
                              ...current,
                              [row.balanceSourceId]: true,
                            }))
                        }}
                      />
                      <span className="text-muted-foreground">
                        {pluralizeUnitName(row.inventoryUnitName).toLowerCase()}
                      </span>
                    </div>
                    {rowErrors[row.balanceSourceId] ||
                    (value && typeof value === "object") ? (
                      <p className="mt-1 text-xs text-destructive">
                        {rowErrors[row.balanceSourceId] ??
                          (value as { error: string }).error}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {difference === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : compareExactDecimals(difference, "0") === 0 ? (
                      <span className="text-primary">Matches</span>
                    ) : (
                      <span
                        className={cn(
                          "font-medium",
                          compareExactDecimals(difference, "0") < 0
                            ? "text-destructive"
                            : "text-primary",
                        )}
                      >
                        {signedQuantity(difference, row.inventoryUnitName)}
                      </span>
                    )}
                    {belowHeld ? (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                        Below the{" "}
                        {formatStockQuantity(
                          row.reservedQuantity,
                          row.inventoryUnitName,
                        )}{" "}
                        held for orders
                      </p>
                    ) : null}
                  </td>
                </tr>
              )
            })}
            {!shown.length ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No products match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <ControlField label="Name or note (optional)">
        <Textarea
          value={note}
          maxLength={500}
          placeholder="e.g. Weekly count"
          onChange={(event) => setNote(event.target.value)}
        />
      </ControlField>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-muted-foreground" aria-live="polite">
          {filled.length} of {chosen.length} ticked counted
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => void saveForLater()}
          >
            Save for later
          </Button>
          <Button disabled={pending} onClick={() => void finishStart()}>
            {pending ? "Saving…" : "Finish count"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function CountReview({
  data,
  fromSaved,
  pending,
  onBack,
  onFinish,
  onDiscard,
  onCountAgain,
}: {
  data: Review
  fromSaved: boolean
  pending: boolean
  onBack: () => void
  onFinish: () => void
  onDiscard: () => void
  onCountAgain: () => void
}) {
  const changed = data.lines.filter(
    (line) => compareExactDecimals(line.varianceQuantity, "0") !== 0,
  )
  const stale = data.lines.filter(
    (line) => !line.stockCurrent || !line.configurationCurrent,
  )
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h3 className="text-base font-medium">
          {data.status !== "DRAFT"
            ? "This count is closed"
            : fromSaved
              ? `${data.reason || "Saved count"}`
              : "Finish this count?"}
        </h3>
        <p className="text-muted-foreground">
          Saved {stockDate(data.createdAt)} · {data.lines.length} product
          {data.lines.length === 1 ? "" : "s"} counted
          {changed.length
            ? ` · stock changes for ${changed.length}`
            : " · everything matches"}
        </p>
      </div>
      {stale.length && data.status === "DRAFT" ? (
        <FormFeedback appearance="dashboard">
          {`Stock changed for ${stale.length} product${stale.length === 1 ? "" : "s"} since this count was saved, so it can’t be finished. Count again to start a fresh count with the same products.`}
        </FormFeedback>
      ) : null}
      <div className="overflow-auto border border-border">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-3 py-2 font-normal">Product</th>
              <th className="px-3 py-2 text-right font-normal">Expected</th>
              <th className="px-3 py-2 text-right font-normal">Counted</th>
              <th className="px-3 py-2 text-right font-normal">Difference</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line) => {
              const zero =
                compareExactDecimals(line.varianceQuantity, "0") === 0
              return (
                <tr key={line.id} className="border-b border-border align-top">
                  <td className="px-3 py-2">
                    {productLabel(line)}
                    {!line.stockCurrent ? (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Changed since the count (now{" "}
                        {formatInventoryQuantity(line.currentQuantity)})
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatStockQuantity(line.expectedQuantity, line.unitName)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatStockQuantity(line.observedQuantity, line.unitName)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {zero ? (
                      <span className="text-primary">Matches</span>
                    ) : (
                      <span
                        className={cn(
                          "font-medium",
                          compareExactDecimals(line.varianceQuantity, "0") < 0
                            ? "text-destructive"
                            : "text-primary",
                        )}
                      >
                        {signedQuantity(line.varianceQuantity, line.unitName)}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {data.status === "DRAFT" ? (
        <p className="text-muted-foreground">
          Finishing sets each product to what you counted. Products you didn’t
          count are not changed. The count stays in Stock history.
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        {fromSaved ? (
          <Button variant="ghost" disabled={pending} onClick={onBack}>
            Back
          </Button>
        ) : (
          <Button variant="outline" disabled={pending} onClick={onBack}>
            Back to count
          </Button>
        )}
        {data.status === "DRAFT" ? (
          <>
            {fromSaved ? (
              <Button variant="outline" disabled={pending} onClick={onDiscard}>
                Discard
              </Button>
            ) : null}
            {stale.length || fromSaved ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={onCountAgain}
              >
                Count again
              </Button>
            ) : null}
            <Button disabled={pending || !data.canFinalize} onClick={onFinish}>
              {pending ? "Saving…" : "Finish and update stock"}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}
