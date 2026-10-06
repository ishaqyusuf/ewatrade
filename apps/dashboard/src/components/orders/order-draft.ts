import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { getSaleOfferingDisabledReasons } from "@ewatrade/utils"
import {
  EXACT_QUANTITY_MAX_SCALE,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import { parseFinanceMoney } from "@ewatrade/utils/finance-money"

export type OrderCatalogItem = RouterOutputs["catalog"]["listItems"][number]

export function orderMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-NG", { currency, style: "currency" }).format(
    value / 100,
  )
}

export function availableOrderOfferings(
  items: OrderCatalogItem[],
  storeId: string,
) {
  return items
    .filter((item) => item.status === "active")
    .flatMap((item) =>
      item.variants
        .filter((variant) => variant.status === "active")
        .flatMap((variant) =>
          variant.offerings.flatMap((offering) => {
            if (
              offering.status !== "active" ||
              !["fixed", "order_total"].includes(offering.pricingPolicy) ||
              !offering.stores.some(
                (row) => row.storeId === storeId && row.isAvailable,
              )
            )
              return []
            const inventoryUnit =
              item.product?.currentUnitConfiguration?.units.find(
                (unit) => unit.id === offering.productUnit?.inventoryUnitId,
              )
            const balance = item.product?.stockBalances.find(
              (row) =>
                row.storeId === storeId &&
                row.variantId === variant.id &&
                (inventoryUnit?.stockBehavior === "packaged_stock"
                  ? row.kind === "packaged_stock" &&
                    row.inventoryUnitId ===
                      offering.productUnit?.inventoryUnitId
                  : row.kind === "shared_pool"),
            )
            const disabledReasons = getSaleOfferingDisabledReasons({
              fixedPriceMinor: offering.fixedPriceMinor,
              pricingPolicy: offering.pricingPolicy,
              kind:
                offering.kind === "product_unit" ? "product_unit" : "service",
              onHandQuantity: balance?.onHandQuantity,
              reservedQuantity: balance?.reservedQuantity,
            })
            return [
              {
                balanceRevision: balance?.revision,
                configurationVersionId:
                  item.product?.currentUnitConfiguration?.id,
                catalogItemId: item.id,
                variantId: variant.id,
                unitName: inventoryUnit?.name ?? offering.name,
                unitId: inventoryUnit?.id ?? offering.id,
                disabledReason: disabledReasons.join(" · ") || undefined,
                fixedPriceMinor: offering.fixedPriceMinor,
                pricingPolicy: offering.pricingPolicy,
                id: offering.id,
                kind: offering.kind,
              },
            ]
          }),
        ),
    )
}

export type OrderOffering = ReturnType<typeof availableOrderOfferings>[number]

export function orderCatalogChoices(
  items: OrderCatalogItem[],
  offerings: OrderOffering[],
) {
  return items.flatMap((item) => {
    const choices = offerings.filter(
      (offering) => offering.catalogItemId === item.id,
    )
    if (!choices.length) return []
    const disabled = choices.every((offering) =>
      Boolean(offering.disabledReason),
    )
    return [
      {
        item,
        disabled,
        disabledReason: disabled
          ? [...new Set(choices.map((offering) => offering.disabledReason))]
              .filter(Boolean)
              .join(" · ")
          : undefined,
      },
    ]
  })
}
export type OrderDraftLine = {
  id: string
  catalogItemId: string
  selections: Record<string, string>
  variantId: string
  offeringId: string
  quantity: string
  totalPrice: string
  note: string
}

export function makeOrderDraftLine(
  item: OrderCatalogItem,
  offering: OrderOffering,
): OrderDraftLine {
  const variant = item.variants.find((row) => row.id === offering.variantId)
  return {
    id: crypto.randomUUID(),
    catalogItemId: item.id,
    selections: Object.fromEntries(
      variant?.selections.map((row) => [row.groupId, row.valueId]) ?? [],
    ),
    variantId: offering.variantId,
    offeringId: offering.id,
    quantity: "1",
    totalPrice: "",
    note: "",
  }
}

export function changeOrderOption(
  item: OrderCatalogItem,
  offerings: OrderOffering[],
  line: OrderDraftLine,
  groupId: string,
  valueId: string,
): OrderDraftLine {
  const selections = { ...line.selections, [groupId]: valueId }
  const variant = item.variants.find(
    (row) =>
      row.status === "active" &&
      item.optionGroups.every((group) =>
        row.selections.some(
          (selection) =>
            selection.groupId === group.id &&
            selection.valueId === selections[group.id],
        ),
      ),
  )
  const choices = offerings.filter(
    (row) => row.catalogItemId === item.id && row.variantId === variant?.id,
  )
  const previousUnit = offerings.find(
    (row) => row.id === line.offeringId,
  )?.unitId
  const offering =
    choices.find((row) => row.unitId === previousUnit && !row.disabledReason) ??
    choices.find((row) => !row.disabledReason) ??
    choices[0]
  return {
    ...line,
    selections,
    variantId: variant?.id ?? "",
    offeringId: offering?.id ?? "",
    totalPrice: offering?.id === line.offeringId ? line.totalPrice : "",
    note: offering?.id === line.offeringId ? line.note : "",
  }
}

export function buildOrderLines(
  drafts: OrderDraftLine[],
  offerings: OrderOffering[],
) {
  if (!drafts.length)
    throw new Error("Choose at least one item and enter a quantity.")
  return drafts.map((draft) => {
    const offering = offerings.find(
      (row) =>
        row.id === draft.offeringId &&
        row.catalogItemId === draft.catalogItemId &&
        row.variantId === draft.variantId,
    )
    if (
      !offering ||
      offering.disabledReason ||
      (offering.pricingPolicy !== "order_total" &&
        offering.fixedPriceMinor === null)
    )
      throw new Error("Choose an available option and unit for every item.")
    if (offering.kind === "product_unit" && !offering.configurationVersionId)
      throw new Error(
        "A selected Product is missing its current unit configuration.",
      )
    const enteredTotalMinor =
      offering.pricingPolicy === "order_total"
        ? parseOrderItemTotal(draft.totalPrice)
        : undefined
    if (draft.note.trim().length > 2_000)
      throw new Error("Keep each item note within 2,000 characters.")
    return {
      enteredTotalMinor,
      note: draft.note.trim() || undefined,
      expectedBalanceRevision:
        offering.kind === "product_unit" ? offering.balanceRevision : undefined,
      expectedConfigurationVersionId:
        offering.kind === "product_unit"
          ? offering.configurationVersionId
          : undefined,
      expectedFixedPriceMinor:
        offering.pricingPolicy === "order_total"
          ? undefined
          : (offering.fixedPriceMinor ?? undefined),
      offeringId: offering.id,
      quantity: parseExactDecimal(draft.quantity, {
        allowZero: false,
        maxScale: EXACT_QUANTITY_MAX_SCALE,
      }),
    }
  })
}

export function parseOrderItemTotal(value: string) {
  let minor: bigint
  try {
    minor = BigInt(parseFinanceMoney(value.trim()))
  } catch {
    throw new Error(
      "Enter a valid total price for this item with at most two decimal places.",
    )
  }
  if (minor <= BigInt(0) || minor > BigInt(100_000_000))
    throw new Error(
      "Total price for this item must be greater than zero and at most 1,000,000.",
    )
  return Number(minor)
}
