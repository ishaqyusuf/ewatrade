"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { useShipmentParams } from "@/hooks/use-shipment-params"
import { useTRPC } from "@/trpc/client"
import {
  Button,
  ControlField,
  Input,
  Select,
  Sheet,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"
import { formatDate } from "@ewatrade/utils/dayjs"
import {
  addExactDecimals,
  compareExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import {
  SHIPMENT_RECEIPT_CATEGORY,
  shipmentAdjustmentMinor,
  shipmentArrivalQuantity,
  shipmentMajorToMinor,
  shipmentPriceChanges,
  shipmentRoundedMinor,
  shipmentUnreceivedUnitMinor,
} from "@ewatrade/utils/shipments"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import {
  OPEN_SHIPMENT,
  type ShipmentDetail,
  type ShipmentLine,
  errorText,
  lineName,
  money,
  useRefreshShipments,
  useStoreStockChoices,
} from "./shipment-data"
import { ShipmentCostTable, ShipmentDraftForm } from "./shipment-draft-form"
import { ShipmentStatusBadge } from "./shipment-status"

type Book = { id: string; currencyCode: string }
type StoreSummary = { id: string; name: string }
const WIDE = "sm:w-[min(880px,95vw)] sm:max-w-[880px]"

const isOpen = (detail: ShipmentDetail) =>
  (OPEN_SHIPMENT as readonly string[]).includes(detail.status)
const sumQuantity = (
  lines: ShipmentLine[],
  key: "expectedQuantity" | "receivedQuantity" | "outstandingQuantity",
) => lines.reduce((total, line) => addExactDecimals(total, line[key]), "0")

/** Inventory → Shipments record sheet; every step opens inside it with Back. */
export function ShipmentSheet({
  book,
  store,
}: { book: Book; store: StoreSummary }) {
  const trpc = useTRPC()
  const { shipmentId, step, lineId, setParams } = useShipmentParams()
  const { closeError, requestClose } = useSheetDismissal(() =>
    setParams({ shipment: null, shipmentStep: null, shipmentLine: null }),
  )
  const existing = shipmentId && shipmentId !== "new" ? shipmentId : null
  const detail = useQuery(
    trpc.finance.shipments.detail.queryOptions(
      { bookId: book.id, shipmentId: existing ?? "" },
      { enabled: Boolean(existing) },
    ),
  )
  const goTo = (next: typeof step, line?: string) =>
    void setParams({ shipmentStep: next, shipmentLine: line ?? null })

  let content: React.ReactNode = null
  if (shipmentId === "new")
    content = (
      <ShipmentDraftForm
        key="new"
        bookId={book.id}
        bookCurrencyCode={book.currencyCode}
        storeId={store.id}
        detail={null}
        step={step === "rates" ? "rates" : "edit"}
        onStep={(next) => (next ? goTo(next) : void requestClose())}
        onDone={(id) => void setParams({ shipment: id, shipmentStep: null })}
      />
    )
  else if (existing && !detail.data)
    content = (
      <SheetFrame title="Shipment" closeError={closeError}>
        {detail.isError ? (
          <FormFeedback appearance="dashboard">
            {errorText(detail.error)}
          </FormFeedback>
        ) : (
          <p>Loading…</p>
        )}
      </SheetFrame>
    )
  else if (detail.data) {
    const d = detail.data
    const draftStep =
      d.status === "DRAFT" &&
      (step === "edit" || step === "rates" || step === "costs")
    if (draftStep)
      content = (
        <ShipmentDraftForm
          key={`${d.id}:${d.revision}`}
          bookId={book.id}
          bookCurrencyCode={book.currencyCode}
          storeId={store.id}
          detail={d}
          step={step}
          onStep={(next) => goTo(next)}
          onDone={() => goTo(null)}
        />
      )
    else if (step === "costs")
      content = (
        <SheetFrame
          title="Costs"
          description={d.name}
          back={{ label: "Back", onClick: () => goTo(null) }}
          popupClassName={WIDE}
          footer={<Button onClick={() => goTo(null)}>Done</Button>}
        >
          <ShipmentCostTable
            detail={d}
            currencyCode={book.currencyCode}
            eachCell={(line) =>
              isOpen(d) &&
              compareExactDecimals(line.outstandingQuantity, "0") > 0 ? (
                <button
                  type="button"
                  className="text-primary"
                  onClick={() => goTo("landed", line.id)}
                >
                  {money(line.landedUnitMinor, book.currencyCode)} · Change
                </button>
              ) : null
            }
          />
        </SheetFrame>
      )
    else if (step === "landed")
      content = (
        <LandedCostStep
          key={`${lineId}:${d.revision}`}
          detail={d}
          lineId={lineId}
          currencyCode={book.currencyCode}
          onBack={() => goTo("costs")}
        />
      )
    else if (step === "prices")
      content = (
        <SellingPricesStep
          key={d.revision}
          detail={d}
          storeId={store.id}
          currencyCode={book.currencyCode}
          onBack={() => goTo(null)}
        />
      )
    else if (step === "arrival")
      content = (
        <ArrivalStep
          key={d.revision}
          detail={d}
          store={store}
          currencyCode={book.currencyCode}
          onBack={() => goTo(null)}
        />
      )
    else
      content = (
        <ShipmentRecord
          detail={d}
          store={store}
          currencyCode={book.currencyCode}
          onStep={goTo}
        />
      )
  }

  return (
    <Sheet
      open={Boolean(shipmentId)}
      onOpenChange={(open) => (open ? null : void requestClose())}
    >
      {shipmentId ? content : null}
    </Sheet>
  )
}

function ShipmentRecord({
  detail: d,
  store,
  currencyCode,
  onStep,
}: {
  detail: ShipmentDetail
  store: StoreSummary
  currencyCode: string
  onStep: (
    step: "edit" | "rates" | "costs" | "prices" | "arrival" | null,
  ) => void
}) {
  const trpc = useTRPC()
  const refresh = useRefreshShipments()
  const [error, setError] = useState<string | null>(null)
  const confirm = useMutation(trpc.finance.shipments.confirm.mutationOptions())
  const reopen = useMutation(trpc.finance.shipments.reopen.mutationOptions())
  const expected = sumQuantity(d.lines, "expectedQuantity")
  const received = sumQuantity(d.lines, "receivedQuantity")
  const outstanding = sumQuantity(d.lines, "outstandingQuantity")
  const canReopen =
    d.status === "EXPECTED" && !d.receipts.length && !d.adjustments.length
  const rates = d.rates.map(
    (r) =>
      `1 ${r.currencyCode} = ${money(shipmentMajorToMinor(r.rate) ?? "0", currencyCode)}`,
  )

  async function run(kind: "confirm" | "reopen") {
    setError(null)
    try {
      const input = {
        bookId: d.bookId,
        clientCommandId: crypto.randomUUID(),
        shipmentId: d.id,
        expectedRevision: d.revision,
      }
      await (kind === "confirm" ? confirm : reopen).mutateAsync(input)
      await refresh()
    } catch (failure) {
      setError(errorText(failure))
    }
  }

  const footer =
    d.status === "DRAFT" ? (
      <>
        <Button variant="outline" onClick={() => onStep("edit")}>
          Edit
        </Button>
        <Button
          disabled={confirm.isPending}
          onClick={() => void run("confirm")}
        >
          {confirm.isPending ? "Confirming…" : "Confirm shipment"}
        </Button>
      </>
    ) : isOpen(d) ? (
      <>
        {canReopen ? (
          <Button
            variant="outline"
            disabled={reopen.isPending}
            onClick={() => void run("reopen")}
          >
            Reopen to edit
          </Button>
        ) : null}
        <Button onClick={() => onStep("arrival")}>Record arrival</Button>
      </>
    ) : null

  return (
    <SheetFrame
      title={d.name}
      description={[
        d.supplierName,
        d.reference,
        d.expectedAt ? `expected ${formatDate(d.expectedAt)}` : null,
        store.name,
      ]
        .filter(Boolean)
        .join(" · ")}
      header={<ShipmentStatusBadge status={d.status} />}
      popupClassName={WIDE}
      footer={footer}
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Landed cost", money(d.totals.landedMinor, currencyCode)],
            ["Arrived", `${received} of ${expected}`],
            ["Still to come", outstanding],
          ].map(([label, value]) => (
            <div key={label} className="border border-border p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
        <Section
          title="Items"
          action={
            d.status === "DRAFT"
              ? ["Edit items", () => onStep("edit")]
              : undefined
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Arrived</TableHead>
                <TableHead className="text-right">To come</TableHead>
                <TableHead className="text-right">Landed each</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    {lineName(line)}
                    {line.stockItem ? null : (
                      <span className="block text-xs text-muted-foreground">
                        New product · choose its stock item before it arrives
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.expectedQuantity}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.receivedQuantity}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.outstandingQuantity === "0"
                      ? "—"
                      : line.outstandingQuantity}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(line.landedUnitMinor, currencyCode)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
        <Section title="Costs" action={["Review costs", () => onStep("costs")]}>
          <dl className="divide-y divide-border border border-border text-sm">
            {[
              [
                "Rates",
                rates.length ? rates.join(" · ") : `All in ${currencyCode}`,
                d.status === "DRAFT" ? () => onStep("rates") : undefined,
              ],
              ["Goods", money(d.totals.goodsMinor, currencyCode)],
              [
                `Freight · ${d.freightCurrencyCode} ${d.freightAmount}`,
                money(d.totals.freightMinor, currencyCode),
              ],
              [
                "Changes to cost",
                d.totals.adjustmentMinor === "0"
                  ? "—"
                  : money(d.totals.adjustmentMinor, currencyCode),
              ],
            ].map(([label, value, change]) => (
              <div
                key={label as string}
                className="flex justify-between gap-4 px-3 py-2"
              >
                <dt className="text-muted-foreground">{label as string}</dt>
                <dd className="text-right font-medium tabular-nums">
                  {value as string}
                  {typeof change === "function" ? (
                    <button
                      type="button"
                      className="ml-2 text-primary"
                      onClick={change}
                    >
                      Change
                    </button>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
        <Section
          title="Selling prices"
          action={["Change prices", () => onStep("prices")]}
        >
          <p className="text-sm text-muted-foreground">
            New prices apply to sales from when you save. Past orders keep their
            prices.
          </p>
        </Section>
        <Section title="Arrivals">
          {d.receipts.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arrived</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Supplier bill</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.receipts.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{formatDate(r.receivedAt)}</TableCell>
                    <TableCell>
                      {r.lines
                        .map(
                          (l) => `${l.quantity} ${lineNameById(d, l.lineId)}`,
                        )
                        .join(" · ")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(r.totalMinor, currencyCode)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing has arrived yet. Stock goes up only when you record an
              arrival.
            </p>
          )}
        </Section>
        {error ? (
          <FormFeedback appearance="dashboard">{error}</FormFeedback>
        ) : null}
      </div>
    </SheetFrame>
  )
}

function lineNameById(detail: ShipmentDetail, lineId: string) {
  const line = detail.lines.find((l) => l.id === lineId)
  return line ? lineName(line) : ""
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: [string, () => void]
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        {action ? (
          <button
            type="button"
            className="text-sm text-primary"
            onClick={action[1]}
          >
            {action[0]}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function LandedCostStep({
  detail: d,
  lineId,
  currencyCode,
  onBack,
}: {
  detail: ShipmentDetail
  lineId: string | null
  currencyCode: string
  onBack: () => void
}) {
  const trpc = useTRPC()
  const refresh = useRefreshShipments()
  const line = d.lines.find((l) => l.id === lineId)
  const [target, setTarget] = useState("")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const adjust = useMutation(
    trpc.finance.shipments.adjustLineCost.mutationOptions(),
  )
  if (!line)
    return (
      <SheetFrame
        title="Landed cost"
        back={{ label: "Costs", onClick: onBack }}
      >
        <p>Choose an item from Costs.</p>
      </SheetFrame>
    )
  const adjustedLineId = line.id
  const unitNow = shipmentUnreceivedUnitMinor(
    line.unreceivedCostMinor,
    line.outstandingQuantity,
  )
  const targetMinor = shipmentMajorToMinor(target)
  const delta =
    targetMinor && unitNow
      ? shipmentAdjustmentMinor({
          targetUnitMinor: targetMinor,
          outstandingQuantity: line.outstandingQuantity,
          unreceivedCostMinor: line.unreceivedCostMinor,
        })
      : null
  const perUnit =
    targetMinor && unitNow
      ? (BigInt(targetMinor) - BigInt(unitNow)).toString()
      : null
  const signed = (minor: string) =>
    `${minor.startsWith("-") ? "−" : "+"}${money(minor.replace("-", ""), currencyCode)}`

  async function save() {
    setError(null)
    if (!delta || delta === "0")
      return setError("Enter a landed cost different from the worked-out cost.")
    if (!reason.trim()) return setError("Say why the cost is different.")
    try {
      await adjust.mutateAsync({
        bookId: d.bookId,
        clientCommandId: crypto.randomUUID(),
        shipmentId: d.id,
        expectedRevision: d.revision,
        lineId: adjustedLineId,
        amountMinor: delta,
        reason: reason.trim(),
      })
      await refresh()
      onBack()
    } catch (failure) {
      setError(errorText(failure))
    }
  }

  return (
    <SheetFrame
      title="Landed cost"
      description={lineName(line)}
      back={{ label: "Costs", onClick: onBack }}
      footer={
        <>
          <Button variant="outline" onClick={onBack}>
            Cancel
          </Button>
          <Button disabled={adjust.isPending} onClick={() => void save()}>
            {adjust.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="divide-y divide-border border border-border text-sm">
          {[
            ["Goods", money(line.goodsMinor, currencyCode)],
            ["Freight", money(line.freightMinor, currencyCode)],
            [
              "Changes so far",
              line.adjustmentMinor === "0" ? "—" : signed(line.adjustmentMinor),
            ],
            [
              `Each, for the ${line.outstandingQuantity} still to come`,
              unitNow ? money(unitNow, currencyCode) : "—",
            ],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 px-3 py-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <ControlField label="Landed cost to use, each">
          <Input
            inputMode="decimal"
            placeholder={unitNow ? String(Number(unitNow) / 100) : ""}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </ControlField>
        {delta && delta !== "0" && perUnit ? (
          <p className="border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <b>
              {signed(perUnit)} each × {line.outstandingQuantity} ={" "}
              {signed(delta)} change to cost
            </b>
            <br />
            Landed total {money(line.landedMinor, currencyCode)} →{" "}
            {money(
              (BigInt(line.landedMinor) + BigInt(delta)).toString(),
              currencyCode,
            )}
          </p>
        ) : null}
        <ControlField label="Reason">
          <Input
            placeholder="Why the cost is different"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </ControlField>
        <p className="text-sm text-muted-foreground">
          Selling prices don’t change here. Items already received keep their
          cost.
        </p>
        {error ? (
          <FormFeedback appearance="dashboard">{error}</FormFeedback>
        ) : null}
      </div>
    </SheetFrame>
  )
}

function SellingPricesStep({
  detail: d,
  storeId,
  currencyCode,
  onBack,
}: {
  detail: ShipmentDetail
  storeId: string
  currencyCode: string
  onBack: () => void
}) {
  const trpc = useTRPC()
  const refresh = useRefreshShipments()
  const { choices, query } = useStoreStockChoices(storeId)
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const update = useMutation(trpc.catalog.updatePrice.mutationOptions())
  const rows = d.lines.map((line) => ({
    line,
    offering:
      choices.find((c) => c.balanceSourceId === line.balanceSourceId)
        ?.offering ?? null,
  }))

  async function save() {
    setError(null)
    const built = shipmentPriceChanges(
      rows.map(({ line, offering }) => ({
        name: lineName(line),
        value: prices[line.id] ?? "",
        offering,
      })),
    )
    if (!built.ok) return setError(built.error)
    setSaving(true)
    let saved = 0
    try {
      for (const change of built.changes) {
        await update.mutateAsync({
          ...change,
          reason: `New price from shipment ${d.name}`,
        })
        saved += 1
      }
      await refresh()
      onBack()
    } catch (failure) {
      // Each price is its own Catalog command; recover current revisions before retry.
      await refresh()
      setError(
        `${saved ? `${saved} ${saved === 1 ? "price was" : "prices were"} saved. ` : ""}${errorText(failure)}`,
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <SheetFrame
      title="Selling prices"
      description="New prices apply to sales from when you save. Past orders and their costs don’t change."
      back={{ label: "Back", onClick: onBack }}
      popupClassName={WIDE}
      footer={
        <>
          <Button variant="outline" onClick={onBack}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save prices"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Landed each</TableHead>
              <TableHead className="text-right">Selling now</TableHead>
              <TableHead className="w-36 text-right">New price</TableHead>
              <TableHead className="text-right">Profit each</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ line, offering }) => {
              const next = shipmentMajorToMinor(prices[line.id] ?? "")
              const profit = next
                ? BigInt(next) -
                  BigInt(shipmentRoundedMinor(line.landedUnitMinor))
                : null
              return (
                <TableRow key={line.id}>
                  <TableCell>{lineName(line)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(line.landedUnitMinor, currencyCode)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {offering
                      ? money(offering.priceMinor, currencyCode)
                      : query.isPending
                        ? "…"
                        : "—"}
                  </TableCell>
                  <TableCell>
                    {offering ? (
                      <Input
                        className="h-9 text-right"
                        inputMode="decimal"
                        aria-label={`New price for ${lineName(line)}`}
                        value={prices[line.id] ?? ""}
                        onChange={(e) =>
                          setPrices((p) => ({
                            ...p,
                            [line.id]: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {line.stockItem
                          ? "No fixed price in Catalog"
                          : "Add to Catalog first"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    className={
                      profit !== null && profit < 0
                        ? "text-right text-destructive tabular-nums"
                        : "text-right tabular-nums"
                    }
                  >
                    {profit === null
                      ? "—"
                      : `${profit < 0 ? "−" : ""}${money((profit < 0 ? -profit : profit).toString(), currencyCode)}`}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {error ? (
          <FormFeedback appearance="dashboard">{error}</FormFeedback>
        ) : null}
      </div>
    </SheetFrame>
  )
}

function ArrivalStep({
  detail: d,
  store,
  currencyCode,
  onBack,
}: {
  detail: ShipmentDetail
  store: StoreSummary
  currencyCode: string
  onBack: () => void
}) {
  const trpc = useTRPC()
  const refresh = useRefreshShipments()
  const { choices } = useStoreStockChoices(store.id)
  const balances = useQuery(
    trpc.inventory.balanceReport.queryOptions({ storeId: store.id }),
  )
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [receivedAt, setReceivedAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const receive = useMutation(trpc.finance.shipments.receive.mutationOptions())
  const mapLine = useMutation(trpc.finance.shipments.mapLine.mutationOptions())
  const open = d.lines.filter(
    (l) => compareExactDecimals(l.outstandingQuantity, "0") > 0,
  )
  const arrivals = open.map((line) => ({
    line,
    arrival: shipmentArrivalQuantity(
      quantities[line.id] ?? "",
      line.outstandingQuantity,
    ),
  }))
  const invalid = arrivals.some(({ arrival }) => !arrival.ok)
  const total = arrivals.reduce(
    (t, { arrival }) =>
      arrival.ok ? addExactDecimals(t, arrival.quantity) : t,
    "0",
  )

  async function chooseStock(line: ShipmentLine, balanceSourceId: string) {
    const choice = choices.find((c) => c.balanceSourceId === balanceSourceId)
    if (!choice) return
    setMapping((m) => ({ ...m, [line.id]: balanceSourceId }))
    setError(null)
    try {
      await mapLine.mutateAsync({
        bookId: d.bookId,
        clientCommandId: crypto.randomUUID(),
        shipmentId: d.id,
        expectedRevision: d.revision,
        lineId: line.id,
        balanceSourceId,
        enteredInventoryUnitId: choice.inventoryUnitId,
      })
      await refresh()
    } catch (failure) {
      setError(errorText(failure))
    }
  }

  async function save() {
    setError(null)
    const lines: Parameters<typeof receive.mutateAsync>[0]["lines"] = []
    for (const { line, arrival } of arrivals) {
      if (!arrival.ok)
        return setError(
          arrival.error === "over"
            ? `Only ${line.outstandingQuantity} ${lineName(line)} are still to come.`
            : `Enter a valid quantity for ${lineName(line)} (up to 6 decimal places).`,
        )
      const quantity = arrival.quantity
      if (quantity === "0") continue
      const row = balances.data?.rows.find(
        (r) => r.balanceSourceId === line.balanceSourceId,
      )
      if (!line.balanceSourceId || !row)
        return setError(`Choose the stock item for ${lineName(line)} first.`)
      lines.push({
        lineId: line.id,
        quantity,
        expectedBalanceRevision: row.revision,
        expectedConfigurationVersionId: row.configurationVersionId,
        categories: [{ name: SHIPMENT_RECEIPT_CATEGORY }],
      })
    }
    if (!lines.length) return setError("Enter what arrived.")
    if (lines.length > 10)
      return setError(
        "Record up to 10 items per arrival, then record the rest.",
      )
    try {
      await receive.mutateAsync({
        bookId: d.bookId,
        clientCommandId: crypto.randomUUID(),
        shipmentId: d.id,
        receivedAt: new Date(receivedAt),
        lines,
      })
      await refresh()
      onBack()
    } catch (failure) {
      setError(errorText(failure))
    }
  }

  return (
    <SheetFrame
      title="Record arrival"
      description={`${d.name} · into ${store.name}`}
      back={{ label: "Back", onClick: onBack }}
      popupClassName={WIDE}
      footer={
        <>
          <span className="mr-auto text-sm text-muted-foreground">
            {total === "0"
              ? "Nothing picked yet"
              : `${total} items into ${store.name}`}
          </span>
          <Button variant="outline" onClick={onBack}>
            Cancel
          </Button>
          <Button
            disabled={
              receive.isPending ||
              mapLine.isPending ||
              (total === "0" && !invalid)
            }
            onClick={() => void save()}
          >
            {receive.isPending
              ? "Receiving…"
              : total === "0"
                ? "Pick what arrived"
                : `Receive ${total} items`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <ControlField label="Arrived on">
            <Input
              type="date"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
            />
          </ControlField>
          <button
            type="button"
            className="text-sm text-primary"
            onClick={() =>
              setQuantities(
                Object.fromEntries(
                  open.map((l) => [l.id, l.outstandingQuantity]),
                ),
              )
            }
          >
            Everything still to come
          </button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right">In before</TableHead>
              <TableHead className="w-32 text-right">Arrived now</TableHead>
              <TableHead className="text-right">Still to come</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {open.map((line) => {
              const now = quantities[line.id] ?? ""
              const arrival = shipmentArrivalQuantity(
                now,
                line.outstandingQuantity,
              )
              const after = arrival.ok ? arrival.remaining : "?"
              return (
                <TableRow key={line.id}>
                  <TableCell>
                    {lineName(line)}
                    {line.balanceSourceId ? null : (
                      <Select
                        className="mt-2 h-9"
                        aria-label={`Stock item for ${lineName(line)}`}
                        value={mapping[line.id] ?? ""}
                        disabled={mapLine.isPending}
                        onChange={(e) => void chooseStock(line, e.target.value)}
                      >
                        <option value="">
                          Choose its stock item (add it in Catalog first)
                        </option>
                        {choices.map((c) => (
                          <option
                            key={c.balanceSourceId}
                            value={c.balanceSourceId}
                          >
                            {c.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.expectedQuantity}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.receivedQuantity}
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-9 text-right"
                      inputMode="decimal"
                      aria-label={`Arrived now: ${lineName(line)}`}
                      disabled={!line.balanceSourceId}
                      value={now}
                      onChange={(e) =>
                        setQuantities((q) => ({
                          ...q,
                          [line.id]: e.target.value,
                        }))
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {after === "0" ? "—" : after}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <p className="text-sm text-muted-foreground">
          Stock goes up by what you record now, at landed cost (
          {money(d.totals.landedMinor, currencyCode)} for the whole shipment). A
          supplier bill is recorded for each arrival. You can record the rest
          later.
        </p>
        {error ? (
          <FormFeedback appearance="dashboard">{error}</FormFeedback>
        ) : null}
      </div>
    </SheetFrame>
  )
}
