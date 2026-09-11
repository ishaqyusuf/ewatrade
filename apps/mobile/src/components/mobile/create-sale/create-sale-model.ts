import type { CommerceCustomer } from "@/components/mobile/commerce"
import { type SaleOfferingChoice } from "@/components/mobile/sale-item-picker"
import { getSelectableSaleItemChoices } from "@/components/mobile/sale-item-picker-model"
import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
import {
  floorExactDecimalQuotient,
  getSaleOfferingDisabledReasons,
  subtractExactDecimals,
} from "@ewatrade/utils"

export type CatalogItem = RouterOutputs["catalog"]["listItems"][number]
export type PaymentMethod = RouterInputs["orders"]["recordPayment"]["method"]
export type SaleStep = "customer" | "items" | "review"

export type SelectedCustomer = {
  email?: string
  id: string
  name: string
  phone?: string
}

export type CreateSaleCompletion = {
  amount: string
  customer: string
  itemCount: number
  paymentState: "paid" | "partially_paid" | "pending"
  reference?: string
  status: "created" | "queued"
}

export type CreateSaleContentProps = {
  attendantName?: string
  initialCatalogItemId?: string
  initialCustomer?: SelectedCustomer
  itemKind?: "service"
  onComplete?: (completion: CreateSaleCompletion) => void
  presentation?: "screen" | "sheet"
}

export const PAYMENT_METHODS: Array<[PaymentMethod, string]> = [
  ["cash", "Cash"],
  ["bank_transfer", "Transfer"],
  ["pos", "POS"],
]

export function deliveryDateLabel(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value)
}

export function flattenSaleOfferings(
  items: CatalogItem[],
  storeId: string | undefined,
  kind?: "service",
): SaleOfferingChoice[] {
  if (!storeId) return []

  const choices = items.flatMap((item) =>
    item.variants.flatMap((variant) =>
      item.kind === kind || !kind
        ? variant.offerings.flatMap((offering) => {
            if (
              offering.status !== "active" ||
              offering.pricingPolicy !== "fixed" ||
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
              kind:
                offering.kind === "product_unit" ? "product_unit" : "service",
              onHandQuantity: balance?.onHandQuantity,
              reservedQuantity: balance?.reservedQuantity,
            })
            const availableBalanceQuantity = balance
              ? subtractExactDecimals(
                  balance.onHandQuantity,
                  balance.reservedQuantity,
                )
              : undefined
            const availableQuantity =
              availableBalanceQuantity === undefined
                ? undefined
                : inventoryUnit?.stockBehavior === "packaged_stock"
                  ? availableBalanceQuantity
                  : inventoryUnit
                    ? floorExactDecimalQuotient(
                        availableBalanceQuantity,
                        inventoryUnit.factor,
                        inventoryUnit.transactionScale,
                      )
                    : undefined
            return [
              {
                availableQuantity,
                balanceRevision: balance?.revision,
                catalogItemId: item.id,
                configurationVersionId:
                  item.product?.currentUnitConfiguration?.id,
                currencyCode: offering.currencyCode,
                displayName:
                  item.variants.length > 1
                    ? `${item.name} · ${variant.name}`
                    : item.name,
                disabledReason: disabledReasons.join(" · ") || undefined,
                fixedPriceMinor: offering.fixedPriceMinor,
                id: offering.id,
                imageUrl: variant.imageUrl ?? item.imageUrl,
                itemName: item.name,
                kind:
                  offering.kind === "product_unit"
                    ? ("product_unit" as const)
                    : ("service" as const),
                offeringName: offering.name,
                unitName: inventoryUnit?.name,
              },
            ]
          })
        : [],
    ),
  )

  return getSelectableSaleItemChoices(choices)
}

export type OfferingRow = SaleOfferingChoice

export function customerFromSuggestion(
  customer: CommerceCustomer,
): SelectedCustomer {
  return {
    email: customer.email ?? undefined,
    id: customer.id,
    name: customer.name,
    phone: customer.phone ?? undefined,
  }
}
