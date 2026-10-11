import { compareExactDecimals, subtractExactDecimals } from "@ewatrade/utils/exact-decimal"
import { CatalogError } from "./catalog-errors"
import { calculateWeightedAverageIssue } from "./finance/valuation-math"

type LineImpact = {
  orderLineId: string
  stock: {
    balanceSourceId: string
    unitName: string
    onHandBefore: string
    onHandAfter: string
    reservedBefore: string
    canonicalBefore: string
    canonicalQuantity: string
  }
  cost: {
    status: string
    currencyCode: string
    valueBeforeMinor: string | null
    unknownReason: string | null
    poolSequence?: string | null
  }
}

/** Input order must match canonical fulfillment order; round each issue separately. */
export function productBatchImpact(lines: readonly LineImpact[]) {
  const groups = new Map<string, {
    baseline: string
    balanceSourceId: string
    unitName: string
    onHandBefore: string
    onHandAfter: string
    reservedBefore: string
    reservedAfter: string
    canonicalAfter: string
    costStatus: string
    currencyCode: string
    valueBeforeMinor: string | null
    valueAfterMinor: string | null
    unknownReason: string | null
  }>()
  const seen = new Set<string>()
  for (const line of lines) {
    if (seen.has(line.orderLineId))
      throw new CatalogError("REVISION_CONFLICT", "A Product line appeared twice in the review.")
    seen.add(line.orderLineId)
    const { stock, cost } = line
    const baseline = JSON.stringify({
      unit: stock.unitName, onHand: stock.onHandBefore, reserved: stock.reservedBefore,
      canonical: stock.canonicalBefore,
      cost: { status: cost.status, currencyCode: cost.currencyCode,
        valueBeforeMinor: cost.valueBeforeMinor, unknownReason: cost.unknownReason,
        poolSequence: cost.poolSequence ?? null },
    })
    const existing = groups.get(stock.balanceSourceId)
    if (existing && existing.baseline !== baseline)
      throw new CatalogError("REVISION_CONFLICT", "Stock or cost changed while reviewing this Order.")
    const group = existing ?? {
      baseline, balanceSourceId: stock.balanceSourceId, unitName: stock.unitName,
      onHandBefore: stock.onHandBefore, onHandAfter: stock.onHandBefore,
      reservedBefore: stock.reservedBefore, reservedAfter: stock.reservedBefore,
      canonicalAfter: stock.canonicalBefore, costStatus: cost.status,
      currencyCode: cost.currencyCode, valueBeforeMinor: cost.valueBeforeMinor,
      valueAfterMinor: cost.valueBeforeMinor, unknownReason: cost.unknownReason,
    }
    const quantity = subtractExactDecimals(stock.onHandBefore, stock.onHandAfter)
    if (compareExactDecimals(quantity, "0") <= 0 || compareExactDecimals(stock.canonicalQuantity, "0") <= 0)
      throw new CatalogError("INVALID_ORDER", "Product fulfillment requires positive quantities.")
    const onHandAfter = subtractExactDecimals(group.onHandAfter, quantity)
    const reservedAfter = subtractExactDecimals(group.reservedAfter, quantity)
    const canonicalAfter = subtractExactDecimals(group.canonicalAfter, stock.canonicalQuantity)
    if ([onHandAfter, reservedAfter, canonicalAfter].some(value => compareExactDecimals(value, "0") < 0))
      throw new CatalogError("INSUFFICIENT_STOCK", "Combined reserved quantities exceed available stock.")
    if (group.valueAfterMinor !== null) {
      group.valueAfterMinor = calculateWeightedAverageIssue({
        quantityBefore: group.canonicalAfter,
        quantityIssued: stock.canonicalQuantity,
        valueBeforeMinor: BigInt(group.valueAfterMinor),
      }).valueAfterMinor.toString()
    }
    Object.assign(group, { onHandAfter, reservedAfter, canonicalAfter })
    groups.set(stock.balanceSourceId, group)
  }
  return [...groups.values()].map(({ baseline, ...group }) => ({
    ...group,
    valueDeltaMinor: group.valueBeforeMinor === null || group.valueAfterMinor === null
      ? null : (BigInt(group.valueAfterMinor) - BigInt(group.valueBeforeMinor)).toString(),
  }))
}
