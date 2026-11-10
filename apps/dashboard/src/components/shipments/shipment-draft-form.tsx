"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import type { ShipmentStep } from "@/hooks/use-shipment-params"
import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import {
  Button,
  ControlField,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"
import {
  SHIPMENT_SOURCE_CURRENCIES,
  shipmentMajorToMinor,
  shipmentRateCurrencies,
} from "@ewatrade/utils/shipments"
import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import {
  type ShipmentDetail,
  errorText,
  money,
  useRefreshShipments,
  useStoreStockChoices,
} from "./shipment-data"

type DraftLine = {
  key: string
  balanceSourceId: string
  enteredInventoryUnitId: string
  proposedName: string
  expectedQuantity: string
  sourceCurrencyCode: string
  sourceUnitPrice: string
  freightOverride: string
}
type Draft = {
  supplierId: string
  name: string
  reference: string
  expectedAt: string
  freightAmount: string
  freightCurrencyCode: string
  rates: Record<string, { rate: string; rateDate: string; source: string }>
  split: "value" | "hand"
  lines: DraftLine[]
}

const today = () => new Date().toISOString().slice(0, 10)
const isoDate = (value: Date | string | null) =>
  value ? new Date(value).toISOString().slice(0, 10) : ""
const DECIMAL = /^\d{1,20}(\.\d{1,18})?$/
const minorText = (minor: string) => (Number(minor) / 100).toString()

function emptyLine(): DraftLine {
  return {
    key: crypto.randomUUID(),
    balanceSourceId: "",
    enteredInventoryUnitId: "",
    proposedName: "",
    expectedQuantity: "",
    sourceCurrencyCode: "CNY",
    sourceUnitPrice: "",
    freightOverride: "",
  }
}

function fromDetail(detail: ShipmentDetail | null): Draft {
  if (!detail)
    return {
      supplierId: "",
      name: "",
      reference: "",
      expectedAt: "",
      freightAmount: "0",
      freightCurrencyCode: "NGN",
      rates: {},
      split: "value",
      lines: [emptyLine()],
    }
  return {
    supplierId: detail.supplierId,
    name: detail.name,
    reference: detail.reference ?? "",
    expectedAt: isoDate(detail.expectedAt),
    freightAmount: detail.freightAmount,
    freightCurrencyCode: detail.freightCurrencyCode,
    rates: Object.fromEntries(
      detail.rates.map((r) => [
        r.currencyCode,
        { rate: r.rate, rateDate: isoDate(r.rateDate), source: r.source },
      ]),
    ),
    split: detail.lines.some((l) => l.freightOverrideMinor !== null)
      ? "hand"
      : "value",
    lines: detail.lines.map((line) => ({
      key: line.id,
      balanceSourceId: line.balanceSourceId ?? "",
      enteredInventoryUnitId: line.enteredInventoryUnitId ?? "",
      proposedName: line.proposedName ?? "",
      expectedQuantity: line.expectedQuantity,
      sourceCurrencyCode: line.sourceCurrencyCode,
      sourceUnitPrice: line.sourceUnitPrice,
      freightOverride:
        line.freightOverrideMinor === null
          ? minorText(line.freightMinor)
          : minorText(line.freightOverrideMinor),
    })),
  }
}

/** Create or edit a draft: details and items, then rates, then the freight split. */
export function ShipmentDraftForm({
  bookId,
  bookCurrencyCode,
  storeId,
  detail,
  step,
  onStep,
  onDone,
}: {
  bookId: string
  bookCurrencyCode: string
  storeId: string
  detail: ShipmentDetail | null
  step: Extract<ShipmentStep, "edit" | "rates" | "costs">
  onStep: (step: ShipmentStep | null) => void
  onDone: (shipmentId: string) => void
}) {
  const trpc = useTRPC()
  const refresh = useRefreshShipments()
  const [draft, setDraft] = useState(() => fromDetail(detail))
  const [error, setError] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const { choices } = useStoreStockChoices(storeId)
  const suppliers = useQuery(
    trpc.finance.suppliers.queryOptions({ bookId, limit: 50 }),
  )
  const create = useMutation(trpc.finance.shipments.create.mutationOptions())
  const update = useMutation(trpc.finance.shipments.update.mutationOptions())
  const saving = create.isPending || update.isPending
  const currencies = shipmentRateCurrencies(
    draft.lines,
    draft.freightCurrencyCode,
    bookCurrencyCode,
  )
  const missingRates = currencies.filter(
    (code) => !DECIMAL.test(draft.rates[code]?.rate.trim() ?? ""),
  )

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const setLine = (key: string, patch: Partial<DraftLine>) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    }))
  const setRate = (code: string, patch: Partial<Draft["rates"][string]>) =>
    setDraft((d) => {
      const current = d.rates[code] ?? {
        rate: "",
        rateDate: today(),
        source: "",
      }
      return { ...d, rates: { ...d.rates, [code]: { ...current, ...patch } } }
    })

  function payload(): RouterInputs["finance"]["shipments"]["create"] | string {
    if (!draft.supplierId) return "Choose the supplier."
    if (!draft.name.trim()) return "Name the shipment."
    if (!DECIMAL.test(draft.freightAmount.trim()))
      return "Enter the shipping charge, or 0."
    const lines: RouterInputs["finance"]["shipments"]["create"]["lines"] = []
    for (const line of draft.lines) {
      const choice = choices.find(
        (c) => c.balanceSourceId === line.balanceSourceId,
      )
      const name = choice?.label ?? line.proposedName.trim()
      if (!name) return "Choose a stock item or name each new product."
      if (
        !DECIMAL.test(line.expectedQuantity.trim()) ||
        !Number(line.expectedQuantity)
      )
        return `Enter how many ${name} you expect.`
      if (!DECIMAL.test(line.sourceUnitPrice.trim()))
        return `Enter the supplier price for ${name}.`
      const override =
        draft.split === "hand"
          ? shipmentMajorToMinor(line.freightOverride || "0")
          : null
      if (draft.split === "hand" && override === null)
        return `Enter the freight share for ${name}.`
      lines.push({
        description: name,
        ...(choice
          ? {
              balanceSourceId: choice.balanceSourceId,
              enteredInventoryUnitId: choice.inventoryUnitId,
            }
          : { proposedName: line.proposedName.trim() }),
        expectedQuantity: line.expectedQuantity.trim(),
        sourceCurrencyCode: line.sourceCurrencyCode,
        sourceUnitPrice: line.sourceUnitPrice.trim(),
        ...(override === null ? {} : { freightOverrideMinor: override }),
      })
    }
    if (missingRates.length)
      return `Enter a rate for ${missingRates.join(" and ")}.`
    for (const code of currencies)
      if (!draft.rates[code]?.source.trim())
        return `Say where the ${code} rate came from.`
    return {
      bookId,
      clientCommandId: crypto.randomUUID(),
      supplierId: draft.supplierId,
      storeId,
      name: draft.name.trim(),
      ...(draft.reference.trim() ? { reference: draft.reference.trim() } : {}),
      ...(draft.expectedAt ? { expectedAt: new Date(draft.expectedAt) } : {}),
      freightAmount: draft.freightAmount.trim(),
      freightCurrencyCode: draft.freightCurrencyCode,
      rates: currencies.map((code) => ({
        currencyCode: code,
        rate: draft.rates[code]?.rate.trim() ?? "",
        rateDate: new Date(draft.rates[code]?.rateDate || today()),
        source: draft.rates[code]?.source.trim() ?? "",
      })),
      lines,
    }
  }

  async function save() {
    setError(null)
    setTried(true)
    if (step === "edit" && missingRates.length) {
      onStep("rates")
      return
    }
    const input = payload()
    if (typeof input === "string") {
      setError(input)
      return
    }
    try {
      const result = detail
        ? await update.mutateAsync({
            ...input,
            shipmentId: detail.id,
            expectedRevision: detail.revision,
          })
        : await create.mutateAsync(input)
      await refresh()
      onDone(result.id)
    } catch (failure) {
      setError(errorText(failure))
    }
  }

  const back = detail
    ? { label: "Back", onClick: () => onStep(null) }
    : undefined
  const footer = (
    <>
      <Button
        variant="outline"
        onClick={() => onStep(detail ? null : step === "rates" ? "edit" : null)}
      >
        {detail || step === "edit" ? "Cancel" : "Back"}
      </Button>
      <Button disabled={saving} onClick={() => void save()}>
        {saving
          ? "Saving…"
          : step === "rates" && !detail
            ? "Save shipment"
            : step === "rates"
              ? "Save rates"
              : step === "costs"
                ? "Save freight split"
                : "Save shipment"}
      </Button>
    </>
  )

  if (step === "rates")
    return (
      <SheetFrame
        title="Rates to naira"
        description="One rate for each currency in this shipment. Later rate changes never change it."
        back={detail ? back : { label: "Items", onClick: () => onStep("edit") }}
        footer={footer}
      >
        <div className="flex flex-col gap-4">
          {currencies.length ? null : (
            <p className="text-sm text-muted-foreground">
              Everything is priced in {bookCurrencyCode}. No rate needed.
            </p>
          )}
          {currencies.map((code) => {
            const rate = draft.rates[code]
            const bad = tried && !DECIMAL.test(rate?.rate.trim() ?? "")
            return (
              <fieldset
                key={code}
                className="grid gap-3 border border-border p-4"
              >
                <legend className="px-1 font-medium">{code}</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <ControlField
                    label={`Naira for 1 ${code}`}
                    error={bad ? `Enter a rate for ${code}.` : undefined}
                  >
                    <Input
                      inputMode="decimal"
                      value={rate?.rate ?? ""}
                      aria-invalid={bad}
                      onChange={(e) => setRate(code, { rate: e.target.value })}
                    />
                  </ControlField>
                  <ControlField label="Where from">
                    <Input
                      placeholder="Bank, agent…"
                      value={rate?.source ?? ""}
                      onChange={(e) =>
                        setRate(code, { source: e.target.value })
                      }
                    />
                  </ControlField>
                  <ControlField label="Rate date">
                    <Input
                      type="date"
                      value={rate?.rateDate ?? today()}
                      onChange={(e) =>
                        setRate(code, { rateDate: e.target.value })
                      }
                    />
                  </ControlField>
                </div>
              </fieldset>
            )
          })}
          {error ? (
            <FormFeedback appearance="dashboard">{error}</FormFeedback>
          ) : null}
        </div>
      </SheetFrame>
    )

  if (step === "costs" && detail) {
    const freightMinor = BigInt(detail.totals.freightMinor)
    const handMinor = draft.lines.reduce(
      (sum, l) =>
        sum + BigInt(shipmentMajorToMinor(l.freightOverride || "0") ?? "0"),
      BigInt(0),
    )
    const left = freightMinor - handMinor
    return (
      <SheetFrame
        title="Costs"
        description="Freight is shared by each item’s goods value unless you set the shares."
        back={back}
        footer={footer}
        popupClassName="sm:w-[min(880px,95vw)] sm:max-w-[880px]"
      >
        <div className="flex flex-col gap-4">
          <fieldset className="flex" aria-label="Share freight">
            {(
              [
                ["value", "Freight by value"],
                ["hand", "Freight by hand"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                className="rounded-none"
                variant={draft.split === value ? "default" : "outline"}
                aria-pressed={draft.split === value}
                onClick={() => set({ split: value })}
              >
                {label}
              </Button>
            ))}
          </fieldset>
          {draft.split === "hand" ? (
            <p
              className={
                left === BigInt(0)
                  ? "text-sm text-primary"
                  : "text-sm text-destructive"
              }
            >
              {left === BigInt(0)
                ? `All ${money(detail.totals.freightMinor, bookCurrencyCode)} freight is shared.`
                : `${money((left < 0 ? -left : left).toString(), bookCurrencyCode)} ${left > 0 ? "still to share" : "more than the freight"}.`}
            </p>
          ) : null}
          <ShipmentCostTable
            detail={detail}
            currencyCode={bookCurrencyCode}
            freightCell={(line) =>
              draft.split === "hand" ? (
                <Input
                  className="h-8 w-28 text-right"
                  inputMode="decimal"
                  aria-label={`Freight share for ${line.description}`}
                  value={
                    draft.lines.find((l) => l.key === line.id)
                      ?.freightOverride ?? ""
                  }
                  onChange={(e) =>
                    setLine(line.id, { freightOverride: e.target.value })
                  }
                />
              ) : null
            }
          />
          {error ? (
            <FormFeedback appearance="dashboard">{error}</FormFeedback>
          ) : null}
        </div>
      </SheetFrame>
    )
  }

  return (
    <SheetFrame
      title={detail ? "Edit shipment" : "New shipment"}
      description="Saving doesn’t add stock. Stock goes up when you record an arrival."
      back={back}
      footer={footer}
      popupClassName="sm:w-[min(880px,95vw)] sm:max-w-[880px]"
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <ControlField label="Name">
            <Input
              placeholder="China consignment · Nov"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </ControlField>
          <ControlField
            label="Supplier"
            description={
              suppliers.data && !suppliers.data.data.length
                ? "Add the supplier in Finance → Suppliers first."
                : undefined
            }
          >
            <Select
              value={draft.supplierId}
              onChange={(e) => set({ supplierId: e.target.value })}
            >
              <option value="">Choose a supplier</option>
              {(suppliers.data?.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </ControlField>
          <ControlField label="Supplier reference">
            <Input
              value={draft.reference}
              onChange={(e) => set({ reference: e.target.value })}
            />
          </ControlField>
          <ControlField label="Expected">
            <Input
              type="date"
              value={draft.expectedAt}
              onChange={(e) => set({ expectedAt: e.target.value })}
            />
          </ControlField>
        </div>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Items</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="w-24">Qty</TableHead>
                <TableHead className="w-24">Currency</TableHead>
                <TableHead className="w-32">Price each</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft.lines.map((line) => (
                <TableRow key={line.key}>
                  <TableCell className="min-w-64">
                    <Select
                      className="h-9"
                      aria-label="Stock item"
                      value={line.balanceSourceId || "new"}
                      onChange={(e) => {
                        const choice = choices.find(
                          (c) => c.balanceSourceId === e.target.value,
                        )
                        setLine(line.key, {
                          balanceSourceId: choice?.balanceSourceId ?? "",
                          enteredInventoryUnitId: choice?.inventoryUnitId ?? "",
                        })
                      }}
                    >
                      <option value="new">
                        New product (not in Catalog yet)
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
                    {line.balanceSourceId ? null : (
                      <Input
                        className="mt-2 h-9"
                        placeholder="New product name"
                        aria-label="New product name"
                        value={line.proposedName}
                        onChange={(e) =>
                          setLine(line.key, { proposedName: e.target.value })
                        }
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-9"
                      inputMode="decimal"
                      aria-label="Quantity"
                      value={line.expectedQuantity}
                      onChange={(e) =>
                        setLine(line.key, { expectedQuantity: e.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      className="h-9"
                      aria-label="Currency"
                      value={line.sourceCurrencyCode}
                      onChange={(e) =>
                        setLine(line.key, {
                          sourceCurrencyCode: e.target.value,
                        })
                      }
                    >
                      {[
                        ...new Set([
                          ...SHIPMENT_SOURCE_CURRENCIES,
                          bookCurrencyCode,
                          line.sourceCurrencyCode,
                        ]),
                      ].map((code) => (
                        <option key={code}>{code}</option>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-9"
                      inputMode="decimal"
                      aria-label="Supplier price each"
                      value={line.sourceUnitPrice}
                      onChange={(e) =>
                        setLine(line.key, { sourceUnitPrice: e.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove item"
                      disabled={draft.lines.length === 1}
                      onClick={() =>
                        set({
                          lines: draft.lines.filter((l) => l.key !== line.key),
                        })
                      }
                    >
                      <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div>
            <Button
              variant="outline"
              disabled={draft.lines.length >= 50}
              onClick={() => set({ lines: [...draft.lines, emptyLine()] })}
            >
              <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
              Add item
            </Button>
          </div>
        </section>
        <section className="grid gap-4 sm:grid-cols-[1fr_8rem_10rem]">
          <p className="self-end pb-2 text-sm font-medium">Shipping charge</p>
          <ControlField label="Currency">
            <Select
              value={draft.freightCurrencyCode}
              onChange={(e) => set({ freightCurrencyCode: e.target.value })}
            >
              {[
                ...new Set([...SHIPMENT_SOURCE_CURRENCIES, bookCurrencyCode]),
              ].map((code) => (
                <option key={code}>{code}</option>
              ))}
            </Select>
          </ControlField>
          <ControlField label="Amount">
            <Input
              inputMode="decimal"
              value={draft.freightAmount}
              onChange={(e) => set({ freightAmount: e.target.value })}
            />
          </ControlField>
        </section>
        {currencies.length ? (
          <p className="text-sm text-muted-foreground">
            Rates:{" "}
            {currencies
              .map((code) =>
                draft.rates[code]?.rate
                  ? `1 ${code} = ${money(shipmentMajorToMinor(draft.rates[code].rate) ?? "0", bookCurrencyCode)}`
                  : `${code} rate needed`,
              )
              .join(" · ")}{" "}
            <button
              type="button"
              className="text-primary"
              onClick={() => onStep("rates")}
            >
              {missingRates.length ? "Add rates" : "Change"}
            </button>
          </p>
        ) : null}
        {error ? (
          <FormFeedback appearance="dashboard">{error}</FormFeedback>
        ) : null}
      </div>
    </SheetFrame>
  )
}

export function ShipmentCostTable({
  detail,
  currencyCode,
  freightCell,
  eachCell,
}: {
  detail: ShipmentDetail
  currencyCode: string
  freightCell?: (line: ShipmentDetail["lines"][number]) => React.ReactNode
  eachCell?: (line: ShipmentDetail["lines"][number]) => React.ReactNode
}) {
  const rate = (code: string) =>
    code === detail.bookCurrencyCode
      ? "1"
      : (detail.rates.find((r) => r.currencyCode === code)?.rate ?? "?")
  const totals = detail.totals
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          <TableHead className="text-right">Supplier cost</TableHead>
          <TableHead className="text-right">Goods</TableHead>
          <TableHead className="text-right">Freight</TableHead>
          <TableHead className="text-right">Change</TableHead>
          <TableHead className="text-right">Landed</TableHead>
          <TableHead className="text-right">Each</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {detail.lines.map((line) => (
          <TableRow key={line.id}>
            <TableCell>
              {line.description}
              <span className="block text-xs text-muted-foreground">
                {line.expectedQuantity} × {line.sourceCurrencyCode}{" "}
                {line.sourceUnitPrice}
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {line.sourceCurrencyCode}{" "}
              {(
                Number(line.expectedQuantity) * Number(line.sourceUnitPrice)
              ).toLocaleString("en-NG", { maximumFractionDigits: 2 })}
              <span className="block text-xs text-muted-foreground">
                × {rate(line.sourceCurrencyCode)}
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {money(line.goodsMinor, currencyCode)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {freightCell?.(line) ?? money(line.freightMinor, currencyCode)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {line.adjustmentMinor === "0"
                ? "—"
                : money(line.adjustmentMinor, currencyCode)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {money(line.landedMinor, currencyCode)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {eachCell?.(line) ?? money(line.landedUnitMinor, currencyCode)}
            </TableCell>
          </TableRow>
        ))}
        <TableRow className="font-medium">
          <TableCell>Total</TableCell>
          <TableCell />
          <TableCell className="text-right tabular-nums">
            {money(totals.goodsMinor, currencyCode)}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {money(totals.freightMinor, currencyCode)}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {totals.adjustmentMinor === "0"
              ? "—"
              : money(totals.adjustmentMinor, currencyCode)}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {money(totals.landedMinor, currencyCode)}
          </TableCell>
          <TableCell />
        </TableRow>
      </TableBody>
    </Table>
  )
}
