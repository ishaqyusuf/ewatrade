import {
  type GeneralReviewPresentation,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"
import type { getFinancePurchaseRecordingReview } from "@ewatrade/db/queries"

type Review = Awaited<ReturnType<typeof getFinancePurchaseRecordingReview>>

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
/** Many categories (up to 10 per good) stay readable and within limits. */
const CHIP_LIMIT = 30
function chipsWithin(chips: Array<{ label: string; isNew: boolean }>) {
  return chips.length <= CHIP_LIMIT
    ? chips
    : [
        ...chips.slice(0, CHIP_LIMIT),
        { label: `+ ${chips.length - CHIP_LIMIT} more` },
      ]
}
const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

function valueChange(
  v: Review["goods"][number]["valuation"],
  money: (minor: string) => string,
) {
  return v.status === "KNOWN" &&
    v.valueBeforeMinor !== null &&
    v.valueAfterMinor !== null
    ? `Value ${money(v.valueBeforeMinor)} → ${money(v.valueAfterMinor)}`
    : `Value unknown (${v.unknownReason}); no opening cost invented`
}

/** The purchase as a card: supplier and payable, dates, goods, then folds. */
export function purchaseRecordingPresentation(
  r: Review,
): GeneralReviewPresentation {
  const money = (v: string) => generalMoney(v, r.currencyCode)
  const categories = new Map<string, boolean>()
  for (const g of r.goods)
    for (const c of g.categories)
      categories.set(c.name, (categories.get(c.name) ?? false) || c.willCreate)
  const created = [...categories.values()].filter(Boolean).length
  return {
    summary: {
      party: `${r.supplierName} (${r.supplierCode})`,
      context: r.description,
      amount: money(r.totalMinor),
      amountLabel: "payable",
    },
    facts: [
      { label: "Bill", value: day(r.incurredAt) },
      ...(r.dueAt ? [{ label: "Due", value: day(r.dueAt) }] : []),
      ...(r.reference ? [{ label: "Ref", value: r.reference }] : []),
      { value: plural(r.goods.length, "good received", "goods received") },
    ],
    table: {
      columns: [
        { label: "Goods" },
        { label: "Received", align: "end" },
        { label: "Cost", align: "end" },
      ],
      rows: r.goods.map((g) => ({
        cells: [
          g.stock.productName,
          `${g.enteredQuantity} ${g.enteredUnitName}`,
          money(g.amountMinor),
        ],
        detail: [g.stock.variantName, g.description]
          .filter((part, at, all) => part && all.indexOf(part) === at)
          .join(" · "),
      })),
      total: { label: "Total", value: money(r.totalMinor) },
      preview: 4,
    },
    sections: [
      {
        title: "Stock and value",
        summary: [
          plural(r.goods.length, "item", "items"),
          created ? plural(created, "new category", "new categories") : null,
        ]
          .filter(Boolean)
          .join(" · "),
        rows: r.goods.map((g) => ({
          label: `${g.stock.productName} · ${g.stock.variantName}`,
          value: `${g.stock.before} → ${g.stock.after} ${g.stock.balanceUnitName}`,
          detail: `${valueChange(g.valuation, money)} · reserved ${g.stock.reserved} · available after ${g.stock.availableAfter}`,
        })),
        chips: chipsWithin(
          [...categories].map(([label, isNew]) => ({ label, isNew })),
        ),
      },
      {
        title: "Accounting",
        summary: r.journal
          .map(
            (l) =>
              `${l.accountName} ${BigInt(l.debitMinor) > 0n ? "Dr" : "Cr"}`,
          )
          .join(" · "),
        rows: r.journal.map((l) => ({
          label: `${l.code} ${l.accountName}`,
          value:
            BigInt(l.debitMinor) > 0n
              ? `Dr ${money(l.debitMinor)}`
              : `Cr ${money(l.creditMinor)}`,
        })),
        note: "This records all received goods, original purchase cost and payable together. No payment, transfer or advance allocation occurs. Physical receipt correction requires a supplier return source.",
      },
    ],
  }
}
