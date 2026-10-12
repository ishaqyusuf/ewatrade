import {
  type GeneralReviewPresentation,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"

/**
 * Structured card reviews for the accepted sale (B05) and stock (C01–C05)
 * drafts. DB-free: adapters pass the previews they already read, so these
 * stay unit-testable. Shapes follow `GeneralReviewPresentation`.
 */

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
/** Free text (reasons, notes) kept within the card limits. */
const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`
const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`
/** "supplier_delivery" or "SHIFT" → "Supplier delivery" / "Shift". */
const words = (code: string) => {
  const text = code.toLowerCase().replaceAll("_", " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}
/** "+2", "-1" or "0" for a variance. */
const signed = (value: string) =>
  /^[-0]/.test(value) || Number(value) === 0 ? value : `+${value}`
const changed = (value: string) => Number(value) !== 0
const item = (line: { productName: string; variantName: string }) =>
  `${line.productName} · ${line.variantName}`
const categoryChips = (categories?: Array<{ name: string }>) =>
  (categories ?? []).slice(0, 30).map((c) => ({ label: c.name }))

type StockCost = {
  status: string
  currencyCode: string
  valueBeforeMinor: string | null
  valueAfterMinor: string | null
  valueDeltaMinor: string | null
}
/** Short value change for a fact or detail line. */
export function stockCostText(cost: StockCost) {
  if (cost.valueAfterMinor === null)
    return cost.status === "NO_FINANCE_BOOK"
      ? "No finance book"
      : cost.status === "SOURCE_OWNED"
        ? "Follows original source"
        : "Unknown cost"
  const money = (value: string | null) =>
    value === null ? "unknown" : generalMoney(value, cost.currencyCode)
  return `${money(cost.valueBeforeMinor)} → ${money(cost.valueAfterMinor)}`
}

// B05 ---------------------------------------------------------------------

export type SaleReviewRow = {
  title: string
  detail?: string
  quantity?: string
  unitPriceMinor?: number | null
  totalMinor: number
}
export function saleReviewPresentation(input: {
  rows: SaleReviewRow[]
  totalMinor: number
  currencyCode: string
  customerName: string
  notes?: string
  payment?: {
    amountMinor: number
    method: string
    accountName?: string | null
    note?: string
  }
}): GeneralReviewPresentation {
  const money = (minor: number) => generalMoney(minor, input.currencyCode)
  const remaining = input.totalMinor - (input.payment?.amountMinor ?? 0)
  return {
    summary: {
      party: input.customerName,
      ...(input.notes ? { context: clip(input.notes, 400) } : {}),
      amount: money(input.totalMinor),
      amountLabel: "sale",
    },
    facts: input.payment
      ? [
          {
            label: "Paid",
            value: `${money(input.payment.amountMinor)} · ${input.payment.method.replaceAll("_", " ")}`,
          },
          ...(input.payment.accountName
            ? [{ label: "Into", value: clip(input.payment.accountName, 160) }]
            : []),
          remaining > 0
            ? { label: "Still owed", value: money(remaining) }
            : { value: "Paid in full" },
        ]
      : [{ label: "Still owed", value: `${money(remaining)} · no payment` }],
    table: {
      columns: [
        { label: "Item" },
        { label: "Qty", align: "end" },
        { label: "Total", align: "end" },
      ],
      rows: input.rows.map((row) => ({
        cells: [
          clip(row.title, 200),
          row.quantity ?? "—",
          money(row.totalMinor),
        ],
        detail: [
          row.detail,
          row.unitPriceMinor != null && row.quantity
            ? `${row.quantity} × ${money(row.unitPriceMinor)}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 240),
      })),
      total: { label: "Total", value: money(input.totalMinor) },
      preview: 6,
    },
    ...(input.payment
      ? {
          note: [
            input.payment.note ? `Payment note: ${input.payment.note}.` : null,
            "Creates the order and records this payment together. No bank transfer or card charge is initiated.",
          ]
            .filter(Boolean)
            .join(" "),
        }
      : {}),
  }
}

// C01 ---------------------------------------------------------------------

export function stockReceivePresentation(
  p: {
    productName: string
    variantName: string
    enteredQuantity: string
    enteredUnitName: string
    factor: string
    canonicalQuantity: string
    before: string
    after: string
    balanceUnitName: string
    reserved: string
    availableAfter: string
    currencyCode: string
  },
  payload: {
    reason: string
    source: string
    supplierName?: string
    categories?: Array<{ name: string }>
    effectiveAt?: string
    unitCostMinor?: string | number
  },
): GeneralReviewPresentation {
  return {
    summary: {
      party: item(p),
      context: clip(payload.reason, 400),
      amount: `+${p.enteredQuantity} ${p.enteredUnitName}`,
      amountLabel: "received",
    },
    facts: [
      {
        label: "On hand",
        value: `${p.before} → ${p.after} ${p.balanceUnitName}`,
      },
      {
        label: "Available",
        value: `${p.availableAfter} ${p.balanceUnitName}`,
      },
      {
        label: "Unit cost",
        value:
          payload.unitCostMinor === undefined
            ? "unknown"
            : generalMoney(payload.unitCostMinor, p.currencyCode),
      },
      ...(payload.effectiveAt
        ? [{ label: "Effective", value: day(payload.effectiveAt) }]
        : []),
    ],
    sections: [
      {
        title: "Details",
        summary: words(payload.source),
        rows: [
          { label: "Source", value: words(payload.source) },
          {
            label: "Unit factor",
            value: `× ${p.factor} = ${p.canonicalQuantity}`,
          },
          { label: "Reserved", value: `${p.reserved} ${p.balanceUnitName}` },
          ...(payload.supplierName
            ? [
                {
                  label: "Supplier name",
                  value: clip(payload.supplierName, 240),
                  detail: "Receipt note only; no supplier account or payment.",
                },
              ]
            : []),
        ],
        chips: categoryChips(payload.categories),
        note: `${
          payload.unitCostMinor === undefined
            ? "Unit cost unknown; no purchase payment recorded."
            : "The cost is a stock cost snapshot, not purchase recognition or payment."
        } Receives into the current Store; valuation follows the ordinary receipt rules and unknown cost stays unknown.`,
      },
    ],
  }
}

// C03 ---------------------------------------------------------------------

export function stockAdjustPresentation(
  p: {
    productName: string
    variantName: string
    enteredQuantity: string
    enteredUnitName: string
    factor: string
    canonicalQuantity: string
    before: string
    after: string
    balanceUnitName: string
    reserved: string
    availableAfter: string
    cost: StockCost
  },
  payload: {
    purpose: "adjustment" | "waste"
    direction: "increase" | "decrease"
    reason: string
    categories: Array<{ name: string }>
    effectiveAt?: string
  },
): GeneralReviewPresentation {
  const sign = payload.direction === "decrease" ? "−" : "+"
  return {
    summary: {
      party: item(p),
      context: clip(payload.reason, 400),
      amount: `${sign}${p.enteredQuantity} ${p.enteredUnitName}`,
      amountLabel: payload.purpose === "waste" ? "waste" : "adjustment",
    },
    facts: [
      {
        label: "On hand",
        value: `${p.before} → ${p.after} ${p.balanceUnitName}`,
      },
      {
        label: "Available",
        value: `${p.availableAfter} ${p.balanceUnitName}`,
      },
      { label: "Value", value: stockCostText(p.cost) },
      ...(payload.effectiveAt
        ? [{ label: "Effective", value: day(payload.effectiveAt) }]
        : []),
    ],
    sections: [
      {
        title: "Details",
        summary: plural(payload.categories.length, "category", "categories"),
        rows: [
          {
            label: "Unit factor",
            value: `× ${p.factor} = ${p.canonicalQuantity}`,
          },
          { label: "Reserved", value: `${p.reserved} ${p.balanceUnitName}` },
        ],
        chips: categoryChips(payload.categories),
        note: "This stock operation does not record a payment.",
      },
    ],
  }
}

export function stockCorrectPresentation(
  p: {
    targetOperationId: string
    originalType: string
    originalReason: string | null
    lines: Array<{
      productName: string
      variantName: string
      originalEnteredQuantity: string
      correctedQuantity: string
      enteredUnitName: string
      before: string
      afterReplacement: string
      reserved: string
      availableAfter: string
      cost: StockCost
    }>
  },
  payload: { reason: string },
): GeneralReviewPresentation {
  return {
    summary: {
      party: `Correct a ${p.originalType.toLowerCase().replaceAll("_", " ")}`,
      context: clip(payload.reason, 400),
    },
    facts: [
      {
        label: "Original reason",
        value: clip(p.originalReason ?? "Not recorded", 160),
      },
      { value: plural(p.lines.length, "line", "lines") },
    ],
    table: {
      columns: [
        { label: "Item" },
        { label: "Was", align: "end" },
        { label: "Now", align: "end" },
        { label: "On hand", align: "end" },
      ],
      rows: p.lines.map((line) => ({
        cells: [
          line.productName,
          `${line.originalEnteredQuantity} ${line.enteredUnitName}`,
          `${line.correctedQuantity} ${line.enteredUnitName}`,
          `${line.before} → ${line.afterReplacement}`,
        ],
        detail: `${line.variantName} · value ${stockCostText(line.cost)}`,
      })),
      preview: 6,
    },
    note: "The original operation stays in history. Confirming records its reversal and replacement together.",
  }
}

// C02 / C05 ----------------------------------------------------------------

type CountedLine = {
  productName: string
  variantName: string
  expectedQuantity: string
  varianceQuantity: string
  unitName: string
  reservedQuantity: string
}
function countTable(
  lines: Array<CountedLine & { counted: string; detail?: string }>,
  countedLabel: string,
): GeneralReviewPresentation["table"] {
  return {
    columns: [
      { label: "Item" },
      { label: "System", align: "end" },
      { label: countedLabel, align: "end" },
      { label: "Variance", align: "end" },
    ],
    rows: lines.map((line) => ({
      cells: [
        line.productName,
        `${line.expectedQuantity} ${line.unitName}`,
        `${line.counted} ${line.unitName}`,
        signed(line.varianceQuantity),
      ],
      detail: [line.variantName, line.detail].filter(Boolean).join(" · "),
    })),
    preview: 6,
  }
}
const differences = (lines: CountedLine[]) => {
  const count = lines.filter((line) => changed(line.varianceQuantity)).length
  return count
    ? { label: "Differences", value: String(count) }
    : { value: "No differences" }
}

export function stockCountCreatePresentation(
  lines: Array<
    CountedLine & {
      observedQuantity: string
      custodyType: string
      custodyReferenceId?: string | null
    }
  >,
  payload: { reason: string },
): GeneralReviewPresentation {
  return {
    summary: {
      party: `Count ${plural(lines.length, "item", "items")}`,
      context: clip(payload.reason, 400),
    },
    facts: [
      differences(lines),
      { value: "Observations only · stock unchanged" },
    ],
    table: countTable(
      lines.map((line) => ({
        ...line,
        counted: line.observedQuantity,
        detail: `${words(line.custodyType)}${line.custodyReferenceId ? ` ${line.custodyReferenceId}` : ""} · reserved ${line.reservedQuantity}`,
      })),
      "Counted",
    ),
    note: "Saves observations only. Stock does not change until a separate finalization is reviewed and confirmed.",
  }
}

export function stockCountFinalizePresentation(
  count: {
    reason?: string | null
    lines: Array<
      CountedLine & { observedQuantity: string; availableAfter: string }
    >
  },
  payload: { reason: string },
): GeneralReviewPresentation {
  return {
    summary: {
      party: `Finalize count of ${plural(count.lines.length, "item", "items")}`,
      context: clip(payload.reason, 400),
    },
    facts: [
      differences(count.lines),
      {
        label: "Counted for",
        value: clip(count.reason ?? "Not recorded", 160),
      },
    ],
    table: countTable(
      count.lines.map((line) => ({
        ...line,
        counted: line.observedQuantity,
        detail: `available after ${line.availableAfter}`,
      })),
      "Counted",
    ),
    note: "Applies the saved count as one signed stock adjustment. Valuation and finance posting follow the count rules; unknown cost is not invented.",
  }
}

export function closeoutCreatePresentation(
  lines: Array<
    CountedLine & { declaredQuantity: string; preservesReservations: boolean }
  >,
  payload: { custodyType: string; custodyReferenceId: string; reason: string },
): GeneralReviewPresentation {
  const blocked = lines.filter((line) => !line.preservesReservations).length
  return {
    summary: {
      party: `${words(payload.custodyType)} closeout · ${payload.custodyReferenceId}`,
      context: clip(payload.reason, 400),
    },
    facts: [
      differences(lines),
      ...(blocked
        ? [{ label: "Below reserved", value: `${blocked} · blocks finalizing` }]
        : []),
      { value: "Declarations only · stock unchanged" },
    ],
    table: countTable(
      lines.map((line) => ({
        ...line,
        counted: line.declaredQuantity,
        detail: line.preservesReservations
          ? `reserved ${line.reservedQuantity}`
          : `below reserved ${line.reservedQuantity}; finalizing is blocked`,
      })),
      "Declared",
    ),
    note: "An inventory custody closeout, not a financial period close.",
  }
}

export function closeoutFinalizePresentation(
  closeout: {
    custodyType: string
    reason?: string | null
    lines: Array<CountedLine & { declaredQuantity: string }>
  },
  payload: { reason: string },
): GeneralReviewPresentation {
  return {
    summary: {
      party: `Finalize ${words(closeout.custodyType).toLowerCase()} closeout`,
      context: clip(payload.reason, 400),
    },
    facts: [
      differences(closeout.lines),
      {
        label: "Saved for",
        value: clip(closeout.reason ?? "Not recorded", 160),
      },
    ],
    table: countTable(
      closeout.lines.map((line) => ({
        ...line,
        counted: line.declaredQuantity,
        detail: `reserved ${line.reservedQuantity}`,
      })),
      "Declared",
    ),
    note: "The saved reconciliation controls stock and any financial posting. Unknown cost is not invented. This does not close a financial period.",
  }
}
