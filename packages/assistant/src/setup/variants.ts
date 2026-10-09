import {
  addExactDecimals,
  isExactDecimal,
  multiplyExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import type { SetupOpenQuestion, SetupProductPayload } from "./contracts"

export const setupNameEqual = (left: string, right: string) =>
  left.trim().toLowerCase() === right.trim().toLowerCase()
export type SetupVariant = NonNullable<SetupProductPayload["variants"]>[number]

export function setupSelectionsEqual(
  left: SetupVariant["selections"],
  right: SetupVariant["selections"],
) {
  return (
    left.length === right.length &&
    new Set(left.map((entry) => entry.optionName.trim().toLowerCase())).size ===
      left.length &&
    left.every((entry) =>
      right.some(
        (other) =>
          setupNameEqual(entry.optionName, other.optionName) &&
          setupNameEqual(entry.value, other.value),
      ),
    )
  )
}

/** Same option order as the Catalog grid; an absent override retains shared prices. */
export function setupProductVariants(payload: SetupProductPayload) {
  let combinations: SetupVariant["selections"][] = [[]]
  for (const group of payload.options ?? []) {
    const values = group.values.filter(
      (value, index, all) =>
        all.findIndex((other) => setupNameEqual(value, other)) === index,
    )
    if (combinations.length * values.length > 36) return []
    combinations = combinations.flatMap((combination) =>
      values.map((value) => [
        ...combination,
        { optionName: group.name, value },
      ]),
    )
  }
  return combinations.map((selections) => {
    const override = payload.variants?.find((variant) =>
      setupSelectionsEqual(variant.selections, selections),
    )
    return {
      selections,
      label: selections.map((entry) => entry.value).join(" / ") || payload.name,
      priceMinor:
        override?.priceMinor ??
        override?.sellingUnitPrices?.find((price) =>
          setupNameEqual(price.unitName, payload.unitName),
        )?.priceMinor ??
        payload.priceMinor,
      pendingUnitPrices: (override?.sellingUnitPrices ?? []).filter(
        (price) =>
          !setupNameEqual(price.unitName, payload.unitName) &&
          !payload.sellingUnits?.some((unit) =>
            setupNameEqual(price.unitName, unit.name),
          ),
      ),
      sellingUnits: (payload.sellingUnits ?? [])
        .filter(
          (unit) =>
            !setupNameEqual(unit.name, payload.unitName) &&
            unit.containsQuantity !== "1",
        )
        .map((unit) => ({
          ...unit,
          priceMinor:
            override?.sellingUnitPrices?.find((price) =>
              setupNameEqual(price.unitName, unit.name),
            )?.priceMinor ?? unit.priceMinor,
        })),
      openingStock: setupVariantStock(payload, override),
    }
  })
}

/** Preserve raw counts until conversions are known; never guess a pack size. */
export function setupVariantStock(
  payload: SetupProductPayload,
  variant: SetupVariant | undefined,
): string | undefined {
  if (!variant) return undefined
  if (!variant.stockByUnit?.length) return variant.openingStock
  let total = "0"
  try {
    for (const part of variant.stockByUnit) {
      const factor = setupNameEqual(part.unitName, payload.unitName)
        ? "1"
        : payload.sellingUnits?.find((unit) =>
            setupNameEqual(unit.name, part.unitName),
          )?.containsQuantity
      if (
        !factor ||
        !isExactDecimal(factor, { allowZero: false, maxScale: 6 }) ||
        !isExactDecimal(part.quantity, { maxScale: 6 })
      )
        return undefined
      total = addExactDecimals(
        total,
        multiplyExactDecimals(part.quantity, factor, 6),
        6,
      )
    }
    return total
  } catch {
    return undefined
  }
}

export function setupProductQuestions(
  payload: SetupProductPayload,
): SetupOpenQuestion[] {
  const questions: SetupOpenQuestion[] = []
  const need = (field: SetupOpenQuestion["field"], question: string) =>
    questions.push({ field, question: question.slice(0, 240), required: true })
  const rows = setupProductVariants(payload)
  if (
    new Set(payload.options?.map((group) => group.name.trim().toLowerCase()))
      .size !== (payload.options?.length ?? 0)
  )
    need("other", `Give each option of ${payload.name} a unique name.`)
  if (!rows.length)
    need(
      "other",
      `${payload.name} has too many option combinations. Keep it to 36 or fewer.`,
    )
  for (const [index, variant] of (payload.variants ?? []).entries()) {
    if (
      !rows.some((row) =>
        setupSelectionsEqual(row.selections, variant.selections),
      ) ||
      payload.variants
        ?.slice(0, index)
        .some((other) =>
          setupSelectionsEqual(other.selections, variant.selections),
        )
    )
      need(
        "other",
        `Match each ${payload.name} variant to one unique combination of its options.`,
      )
    const unknownUnit = variant.sellingUnitPrices?.find(
      (price) =>
        !setupNameEqual(price.unitName, payload.unitName) &&
        !payload.sellingUnits?.some((unit) =>
          setupNameEqual(unit.name, price.unitName),
        ),
    )
    if (unknownUnit)
      need(
        "unit",
        `How many ${payload.unitName.toLowerCase()} are in one ${unknownUnit.unitName.toLowerCase()} of ${payload.name}?`,
      )
    if (
      variant.stockByUnit?.length &&
      setupVariantStock(payload, variant) === undefined
    )
      need(
        "stock",
        `Confirm the quantities and pack sizes for ${variant.selections.map((entry) => entry.value).join(" / ") || payload.name} so its stock can be counted in ${payload.unitName.toLowerCase()}.`,
      )
    if (
      variant.openingStock !== undefined &&
      !isExactDecimal(variant.openingStock, { maxScale: 6 })
    )
      need("stock", `Enter a valid stock quantity for ${payload.name}.`)
  }
  if (payload.usage !== "INTERNAL_USE") {
    for (const row of rows) {
      const missing = [
        row.priceMinor === undefined ? payload.unitName : null,
        ...row.sellingUnits
          .filter((unit) => unit.priceMinor === undefined)
          .map((unit) => unit.name),
      ].filter(Boolean)
      if (missing.length)
        need(
          "price",
          `What is your selling price for ${row.label} per ${missing.join(" and ").toLowerCase()}?`,
        )
    }
  }
  return questions
}
