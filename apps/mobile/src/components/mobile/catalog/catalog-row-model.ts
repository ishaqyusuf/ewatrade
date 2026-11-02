import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatMinorMoney } from "@ewatrade/utils"
import {
  catalogItemAttention,
  catalogItemStockBalance,
} from "@ewatrade/utils/catalog-attention"
import { selectCatalogAvatar } from "./catalog-avatar-model"
import type { CatalogRow } from "./catalog-presentation"
type CatalogItem = RouterOutputs["catalog"]["listItems"][number]

export function mapCatalogItem(
  item: CatalogItem,
  storeId?: string,
): CatalogRow {
  const defaultVariant =
    item.variants.find((variant) => variant.isDefault) ?? item.variants[0]
  const offering = defaultVariant?.offerings[0]
  const currencyCode = offering?.currencyCode ?? "NGN"
  const avatar = selectCatalogAvatar(
    item,
    storeId,
    defaultVariant?.imageUrl ?? item.imageUrl,
  )
  const priceLabel =
    offering?.pricingPolicy === "fixed" && offering.fixedPriceMinor !== null
      ? formatMinorMoney(offering.fixedPriceMinor, currencyCode).replace(
          /\.00(?=\D*$)/,
          "",
        )
      : offering?.pricingPolicy === "quote_required"
        ? "Quote"
        : "Price not set"

  if (item.kind === "service") {
    return {
      avatar,
      problem: catalogItemAttention(item, storeId),
      detail: `${priceLabel} · Service`,
      availabilityLabel: "Service",
      id: item.id,
      kind: item.kind,
      name: item.name,
      priceLabel,
      unitName: offering?.name ?? "Service",
    }
  }

  const canonicalUnit =
    item.product?.currentUnitConfiguration?.units.find(
      (unit) => unit.stockBehavior === "canonical_shared",
    ) ?? item.product?.currentUnitConfiguration?.units[0]
  const stock = catalogItemStockBalance(item, storeId)
  const unitName =
    stock?.balance.inventoryUnitName ?? canonicalUnit?.name ?? "unit"
  const availableQuantity = stock?.available ?? null
  const availabilityLabel =
    availableQuantity === null
      ? "Availability not recorded"
      : Number(availableQuantity) <= 0
        ? `${availableQuantity} ${unitName} left`
        : `${availableQuantity} ${unitName} available`

  return {
    avatar,
    problem: catalogItemAttention(item, storeId),
    detail: `${availabilityLabel} · ${priceLabel}`,
    availabilityLabel,
    id: item.id,
    kind: item.kind,
    name: item.name,
    priceLabel,
    unitName,
  }
}
