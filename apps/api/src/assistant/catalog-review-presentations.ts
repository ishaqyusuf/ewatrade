import {
  type GeneralReviewPresentation,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"
import {
  type ProductCreateAction,
  isSimpleProductCreate,
  productCreateIssues,
  productCreatePayload,
  productCreateVariants,
} from "@ewatrade/assistant/general/product-create"
import { productCategoryLabel } from "@ewatrade/assistant/product/knowledge"
import {
  isCanonicalUnitAlias,
  setupSelectionsEqual,
} from "@ewatrade/assistant/setup/variants"

/**
 * Structured card reviews for the accepted customer (B01), product (B02) and
 * selling-configuration (B03) drafts. DB-free, like `review-presentations`.
 */

const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`
const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

export type FieldChange = {
  label: string
  before: string | null
  after: string | null
}

/** Any "these fields change" draft: a Was / Now table under the record. */
function changesPresentation(input: {
  party: string
  changes: FieldChange[]
  note: string
}): GeneralReviewPresentation {
  return {
    summary: { party: clip(input.party, 240) },
    facts: [
      {
        value: plural(input.changes.length, "change", "changes"),
      },
    ],
    table: {
      columns: [{ label: "Field" }, { label: "Was" }, { label: "Now" }],
      rows: input.changes.map((change) => ({
        cells: [
          change.label,
          clip(change.before ?? "Not set", 200),
          clip(change.after ?? "Removed", 200),
        ],
      })),
    },
    note: input.note,
  }
}

// B01 ---------------------------------------------------------------------

export function customerCreatePresentation(payload: {
  name: string
  phone?: string
  email?: string
}): GeneralReviewPresentation {
  return {
    summary: { party: clip(payload.name, 240), amountLabel: "new customer" },
    facts: [
      ...(payload.phone ? [{ label: "Phone", value: payload.phone }] : []),
      ...(payload.email ? [{ label: "Email", value: payload.email }] : []),
      ...(!payload.phone && !payload.email
        ? [{ value: "No phone or email" }]
        : []),
    ],
  }
}

export function customerUpdatePresentation(
  customerName: string,
  changes: FieldChange[],
) {
  return changesPresentation({
    party: customerName,
    changes,
    note: "Past orders keep the customer name they were saved with.",
  })
}

// B02 ---------------------------------------------------------------------

export function productCreatePresentation(
  action: ProductCreateAction,
  currencyCode: string,
): GeneralReviewPresentation {
  const money = (minor: number) => generalMoney(minor, currencyCode)
  const issues = productCreateIssues(action)
  const note = issues.length ? clip(issues.join(" "), 800) : undefined
  const category = productCategoryLabel(
    action.categoryKey,
    action.categoryLabel,
  )
  const categoryFacts = category
    ? [{ label: "Category", value: clip(category, 160) }]
    : []
  const unit = action.canonicalUnitName
  const stock = (quantity: string | undefined) =>
    quantity === undefined ? "Not supplied" : `${quantity} ${unit}`
  if (isSimpleProductCreate(action))
    return {
      summary: {
        party: clip(action.name, 240),
        amount:
          action.priceMinor === undefined
            ? "Price needed"
            : money(action.priceMinor),
        amountLabel: `per ${unit}`,
      },
      facts: [
        ...categoryFacts,
        { label: "Opening stock", value: stock(action.openingStock) },
      ],
      note,
    }
  const packs = (action.sellingUnits ?? [])
    .filter((pack) => !isCanonicalUnitAlias(pack, unit, action.priceMinor))
    .map(
      (pack) =>
        `${pack.name} = ${pack.containsQuantity} ${unit}${pack.quantityDefault ? " (default)" : ""}`,
    )
  const rows = productCreateVariants(action)
  return {
    summary: {
      party: clip(action.name, 240),
      context: [`Counted in ${unit}`, ...packs].join(" · "),
    },
    note,
    facts: [
      ...categoryFacts,
      { value: plural(rows.length, "option", "options") },
      ...(packs.length
        ? [{ value: plural(packs.length, "pack size", "pack sizes") }]
        : []),
    ],
    table: {
      columns: [
        { label: "Option" },
        { label: "Price", align: "end" },
        { label: "Opening stock", align: "end" },
      ],
      rows: rows.map((row) => ({
        cells: [
          clip(row.label, 200),
          row.priceMinor === undefined
            ? "Price needed"
            : `${money(row.priceMinor)} / ${unit}`,
          stock(row.openingStock),
        ],
        detail: row.sellingUnits
          .map((pack) =>
            pack.priceMinor === undefined
              ? `${pack.name} price needed`
              : `${money(pack.priceMinor)} / ${pack.name}${action.variants?.find((variant) => setupSelectionsEqual(variant.selections, row.selections))?.sellingUnitPrices?.some((price) => price.unitName === pack.name && price.derivedFromUnit) ? " (suggested)" : ""}`,
          )
          .join(" · "),
      })),
      preview: 6,
    },
  }
}

const sellingUnit = (offering: {
  itemName: string
  variantName: string
  name: string
}) => `${offering.itemName} · ${offering.variantName} · ${offering.name}`

export function productDetailsPresentation(
  itemName: string,
  changes: FieldChange[],
) {
  return changesPresentation({
    party: itemName,
    changes,
    note: "Applies to this product in every Store. Past orders and product links stay unchanged.",
  })
}

export function productIdentifiersPresentation(
  offering: { itemName: string; variantName: string; name: string },
  changes: FieldChange[],
) {
  return changesPresentation({
    party: sellingUnit(offering),
    changes,
    note: "Only this selling unit changes, in every Store. Other variants, units and past orders stay unchanged.",
  })
}

export function productPricePresentation(input: {
  offering: { itemName: string; variantName: string; name: string }
  currencyCode: string
  beforeMinor: number | null
  afterMinor: number
  reason: string
}): GeneralReviewPresentation {
  const money = (minor: number | null) =>
    minor === null ? "No fixed price" : generalMoney(minor, input.currencyCode)
  return {
    summary: {
      party: clip(sellingUnit(input.offering), 240),
      context: clip(input.reason, 400),
      amount: money(input.afterMinor),
      amountLabel: "new price",
    },
    facts: [{ label: "Was", value: money(input.beforeMinor) }],
    note: "Applies in every Store selling this offering. Other units and variants stay unchanged. Past orders keep their saved prices.",
  }
}

// B03 ---------------------------------------------------------------------

export function productAvailabilityPresentation(input: {
  offering: { itemName: string; variantName: string; name: string }
  before: boolean | undefined
  after: boolean
  storeName: string
}): GeneralReviewPresentation {
  const state = (on: boolean | undefined) => (on ? "Available" : "Unavailable")
  return {
    summary: {
      party: clip(sellingUnit(input.offering), 240),
      amount: state(input.after),
      amountLabel: `in ${input.storeName}`,
    },
    facts: [{ label: "Was", value: state(input.before) }],
    note: "Only this Store changes. Stock quantities, reservations, prices and past orders stay unchanged.",
  }
}

export type UnitConfigurationUnit = {
  name: string
  factor: unknown
  stockBehavior: string
  transactionScale: number
}
export function unitKind(unit: UnitConfigurationUnit) {
  const behavior = unit.stockBehavior.toLowerCase()
  return behavior === "canonical_shared"
    ? "Main unit"
    : behavior === "alternate_transaction"
      ? "Shared selling unit"
      : "Independent packaged stock"
}
const unitText = (unit: UnitConfigurationUnit) =>
  `× ${String(unit.factor)} · ${unitKind(unit)}`

export function unitConfigurationPresentation(input: {
  productName: string
  publish: boolean
  draftVersion?: number
  currentVersion: number
  currentScale: number
  proposedScale: number
  current: UnitConfigurationUnit[]
  proposed: UnitConfigurationUnit[]
  /** A draft this one replaces (save only). */
  replaces?: { version: number; units: UnitConfigurationUnit[] }
  offerings: Array<{
    variantName: string
    name: string
    price: string
    unitKey: string
  }>
  balances: Array<{
    storeName: string
    variantName: string
    unitName: string
    onHand: string
    reserved: string
    custodyType: string
  }>
  stockTransitionOperationId?: string
}): GeneralReviewPresentation {
  return {
    summary: {
      party: clip(input.productName, 240),
      context: input.publish
        ? `Publish draft v${input.draftVersion}; current v${input.currentVersion} becomes superseded.`
        : "Save a draft only. Selling stays unchanged until it is published.",
    },
    facts: [
      {
        label: "Precision",
        value:
          input.currentScale === input.proposedScale
            ? `${input.proposedScale} decimals`
            : `${input.currentScale} → ${input.proposedScale} decimals`,
      },
      {
        value: plural(
          input.offerings.length,
          "selling offering",
          "selling offerings",
        ),
      },
      { value: plural(input.balances.length, "stock source", "stock sources") },
      ...(input.replaces
        ? [{ label: "Replaces draft", value: `v${input.replaces.version}` }]
        : []),
    ],
    table: {
      columns: [
        { label: "Proposed unit" },
        { label: "Main units", align: "end" },
        { label: "Kind", align: "end" },
      ],
      rows: input.proposed.map((unit) => ({
        cells: [unit.name, `× ${String(unit.factor)}`, unitKind(unit)],
        detail: `${unit.transactionScale} decimal places`,
      })),
    },
    sections: [
      {
        title: "Current units",
        summary: `v${input.currentVersion} · ${plural(input.current.length, "unit", "units")}`,
        rows: input.current.map((unit) => ({
          label: unit.name,
          value: unitText(unit),
        })),
      },
      ...(input.replaces
        ? [
            {
              title: "Draft being replaced",
              summary: `v${input.replaces.version}`,
              rows: input.replaces.units.map((unit) => ({
                label: unit.name,
                value: unitText(unit),
              })),
            },
          ]
        : []),
      {
        title: "Affected selling offerings",
        summary: String(input.offerings.length),
        rows: input.offerings.slice(0, 60).map((offering) => ({
          label: `${offering.variantName} · ${offering.name}`,
          value: offering.price,
          detail: `Unit ${offering.unitKey}`,
        })),
        note: "Publishing replaces their unit references and keeps each offering's price, identifiers and Store availability.",
      },
      {
        title: "Stock sources",
        summary: `${input.balances.length} · no automatic conversion`,
        rows: input.balances.slice(0, 60).map((balance) => ({
          label: `${balance.storeName} · ${balance.variantName} · ${balance.unitName}`,
          value: `${balance.onHand} on hand`,
          detail: `${balance.reserved} reserved · ${balance.custodyType.toLowerCase()}`,
        })),
        note: "Changing the meaning of units that hold stock or reservations needs a separate Stock Transition; publishing rechecks this.",
      },
    ],
    note: [
      "Applies across this business's Stores. Past orders keep their saved configuration and prices.",
      input.stockTransitionOperationId
        ? `Uses existing Stock Transition ${input.stockTransitionOperationId}; no new transition is created.`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
  }
}
