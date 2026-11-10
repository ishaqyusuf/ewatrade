import { shipmentMajorToMinor, shipmentRateCurrencies } from "./shipments"

export type ShipmentDraftLine = {
  key: string
  balanceSourceId: string
  enteredInventoryUnitId: string
  proposedName: string
  expectedQuantity: string
  sourceCurrencyCode: string
  sourceUnitPrice: string
  /** Naira share when freight is split by hand. */
  freightOverride: string
}

export type ShipmentDraft = {
  supplierId: string
  name: string
  reference: string
  /** yyyy-mm-dd or empty. */
  expectedAt: string
  freightAmount: string
  freightCurrencyCode: string
  rates: Record<string, { rate: string; rateDate: string; source: string }>
  split: "value" | "hand"
  lines: ShipmentDraftLine[]
}

/** The parts of finance.shipments.detail a draft is rebuilt from. */
export type ShipmentDraftSource = {
  supplierId: string
  name: string
  reference: string | null
  expectedAt: Date | string | null
  freightAmount: string
  freightCurrencyCode: string
  rates: Array<{
    currencyCode: string
    rate: string
    rateDate: Date | string
    source: string
  }>
  lines: Array<{
    id: string
    balanceSourceId: string | null
    enteredInventoryUnitId: string | null
    proposedName: string | null
    expectedQuantity: string
    sourceCurrencyCode: string
    sourceUnitPrice: string
    freightOverrideMinor: string | null
    freightMinor: string
  }>
}

export type ShipmentStockChoiceLike = {
  balanceSourceId: string
  inventoryUnitId: string
  label: string
}

const DECIMAL = /^\d{1,20}(\.\d{1,18})?$/
export const isShipmentDecimal = (value: string) => DECIMAL.test(value.trim())
export const shipmentDateInput = (value: Date | string | null) =>
  value ? new Date(value).toISOString().slice(0, 10) : ""
const minorText = (minor: string) => (Number(minor) / 100).toString()

export function emptyShipmentLine(key: string): ShipmentDraftLine {
  return {
    key,
    balanceSourceId: "",
    enteredInventoryUnitId: "",
    proposedName: "",
    expectedQuantity: "",
    sourceCurrencyCode: "CNY",
    sourceUnitPrice: "",
    freightOverride: "",
  }
}

export function emptyShipmentDraft(lineKey: string): ShipmentDraft {
  return {
    supplierId: "",
    name: "",
    reference: "",
    expectedAt: "",
    freightAmount: "0",
    freightCurrencyCode: "NGN",
    rates: {},
    split: "value",
    lines: [emptyShipmentLine(lineKey)],
  }
}

export function shipmentDraftFromDetail(
  detail: ShipmentDraftSource,
): ShipmentDraft {
  return {
    supplierId: detail.supplierId,
    name: detail.name,
    reference: detail.reference ?? "",
    expectedAt: shipmentDateInput(detail.expectedAt),
    freightAmount: detail.freightAmount,
    freightCurrencyCode: detail.freightCurrencyCode,
    rates: Object.fromEntries(
      detail.rates.map((r) => [
        r.currencyCode,
        {
          rate: r.rate,
          rateDate: shipmentDateInput(r.rateDate),
          source: r.source,
        },
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
      freightOverride: minorText(
        line.freightOverrideMinor ?? line.freightMinor,
      ),
    })),
  }
}

export function shipmentDraftCurrencies(
  draft: ShipmentDraft,
  bookCurrencyCode: string,
) {
  return shipmentRateCurrencies(
    draft.lines,
    draft.freightCurrencyCode,
    bookCurrencyCode,
  )
}

export function shipmentMissingRates(
  draft: ShipmentDraft,
  bookCurrencyCode: string,
) {
  return shipmentDraftCurrencies(draft, bookCurrencyCode).filter(
    (code) => !isShipmentDecimal(draft.rates[code]?.rate ?? ""),
  )
}

/** Naira still to share (negative when over) for a by-hand freight split. */
export function shipmentHandFreightLeftMinor(
  draft: ShipmentDraft,
  freightMinor: string,
) {
  return draft.lines.reduce(
    (left, line) =>
      left - BigInt(shipmentMajorToMinor(line.freightOverride || "0") ?? "0"),
    BigInt(freightMinor),
  )
}

/** finance.shipments.create/update body, or the first thing to fix. */
export function buildShipmentDraftInput(
  draft: ShipmentDraft,
  context: {
    bookId: string
    storeId: string
    bookCurrencyCode: string
    clientCommandId: string
    choices: ShipmentStockChoiceLike[]
    today: string
  },
) {
  const fail = (error: string) => ({ ok: false as const, error })
  if (!draft.supplierId) return fail("Choose the supplier.")
  if (!draft.name.trim()) return fail("Name the shipment.")
  if (!isShipmentDecimal(draft.freightAmount))
    return fail("Enter the shipping charge, or 0.")
  const lines = []
  for (const line of draft.lines) {
    const choice = context.choices.find(
      (c) => c.balanceSourceId === line.balanceSourceId,
    )
    const name = choice?.label ?? line.proposedName.trim()
    if (!name) return fail("Choose a stock item or name each new product.")
    if (
      !isShipmentDecimal(line.expectedQuantity) ||
      !Number(line.expectedQuantity)
    )
      return fail(`Enter how many ${name} you expect.`)
    if (!isShipmentDecimal(line.sourceUnitPrice))
      return fail(`Enter the supplier price for ${name}.`)
    const override =
      draft.split === "hand"
        ? shipmentMajorToMinor(line.freightOverride || "0")
        : undefined
    if (override === null) return fail(`Enter the freight share for ${name}.`)
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
      ...(override === undefined ? {} : { freightOverrideMinor: override }),
    })
  }
  const currencies = shipmentDraftCurrencies(draft, context.bookCurrencyCode)
  const missing = shipmentMissingRates(draft, context.bookCurrencyCode)
  if (missing.length) return fail(`Enter a rate for ${missing.join(" and ")}.`)
  for (const code of currencies)
    if (!draft.rates[code]?.source.trim())
      return fail(`Say where the ${code} rate came from.`)
  return {
    ok: true as const,
    input: {
      bookId: context.bookId,
      clientCommandId: context.clientCommandId,
      supplierId: draft.supplierId,
      storeId: context.storeId,
      name: draft.name.trim(),
      ...(draft.reference.trim() ? { reference: draft.reference.trim() } : {}),
      ...(draft.expectedAt ? { expectedAt: new Date(draft.expectedAt) } : {}),
      freightAmount: draft.freightAmount.trim(),
      freightCurrencyCode: draft.freightCurrencyCode,
      rates: currencies.map((code) => ({
        currencyCode: code,
        rate: draft.rates[code]?.rate.trim() ?? "",
        rateDate: new Date(draft.rates[code]?.rateDate || context.today),
        source: draft.rates[code]?.source.trim() ?? "",
      })),
      lines,
    },
  }
}
