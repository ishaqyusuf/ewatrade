import {
  divideExactDecimals,
  isExactDecimal,
  multiplyExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import type { SetupProductPayload } from "../setup/contracts"
import {
  isCanonicalUnitAlias,
  setupNameEqual,
  setupPackPrice,
  setupProductQuestions,
  setupProductVariants,
} from "../setup/variants"
import { productCategoryLabel, productCategoryReference } from "./knowledge"

const positive = (value: string) =>
  isExactDecimal(value, { allowZero: false, maxScale: 6 })

/** One preparation policy for General, Setup and focused Product. No writes. */
export function prepareProductPayload(
  input: SetupProductPayload,
  currencyCode: string,
): SetupProductPayload {
  const reference = productCategoryReference(input.name)
  const canonicalUnit = input.sellingUnits?.find((unit) =>
    isCanonicalUnitAlias(unit, input.unitName, input.priceMinor),
  )
  const currentSuggestion =
    input.categorySuggested &&
    (!input.categorySuggestionName ||
      setupNameEqual(input.categorySuggestionName, input.name))
      ? input.categoryKey
      : undefined
  const payload: SetupProductPayload = {
    ...input,
    priceMinor: input.priceMinor ?? canonicalUnit?.priceMinor,
    preparationVersion: "product-v1",
    categoryKey:
      input.categoryKey === undefined || input.categorySuggested
        ? (reference?.categoryKey ?? currentSuggestion)
        : input.categoryKey,
    categorySuggested:
      input.categoryKey === undefined || input.categorySuggested
        ? !!reference || !!currentSuggestion
        : false,
    categorySuggestionName:
      input.categorySuggested || reference ? input.name : undefined,
    variantMode:
      input.variants?.length && input.options?.length
        ? "explicit"
        : input.variantMode,
    sellingUnits: input.sellingUnits
      ?.filter(
        (unit) => !isCanonicalUnitAlias(unit, input.unitName, input.priceMinor),
      )
      .map((unit) => ({ ...unit })),
  }
  if (payload.reviewRequirements?.length)
    return {
      ...payload,
      openingStock: undefined,
      variants: payload.variants?.map((variant) => ({
        ...variant,
        openingStock: undefined,
      })),
    }
  const units = payload.sellingUnits ?? []
  function factor(name: string, seen = new Set<string>()): string | undefined {
    if (setupNameEqual(name, payload.unitName)) return "1"
    const key = name.trim().toLowerCase()
    if (seen.has(key)) return undefined
    const unit = units.find((entry) => setupNameEqual(entry.name, name))
    if (!unit) return undefined
    seen.add(key)
    if (unit.referenceUnitName || unit.referenceQuantity !== undefined) {
      const parent =
        unit.referenceUnitName && factor(unit.referenceUnitName, seen)
      try {
        unit.containsQuantity =
          parent && unit.referenceQuantity && positive(unit.referenceQuantity)
            ? multiplyExactDecimals(parent, unit.referenceQuantity, 6)
            : ""
      } catch {
        unit.containsQuantity = ""
      }
    } else if (
      !unit.containsQuantity &&
      currencyCode === "NGN" &&
      reference?.kind === "eggs" &&
      !/\bquail\b/i.test(payload.name) &&
      /^(piece|egg|each)$/i.test(payload.unitName) &&
      /^(crate|tray)$/i.test(unit.name)
    ) {
      unit.containsQuantity = "30"
      unit.quantityDefault = "egg-crate-30"
    }
    if (unit.containsQuantity !== "30") unit.quantityDefault = undefined
    return positive(unit.containsQuantity) ? unit.containsQuantity : undefined
  }
  for (const unit of units) factor(unit.name)

  // Prices marked derived are recalculated from stated facts on every revision.
  // This prevents an old suggested carton price surviving a changed crate price.
  if (
    setupProductQuestions(payload).some(
      (question) => question.field === "other",
    )
  )
    return payload
  const rows = setupProductVariants(payload)
  if (units.length || payload.variants?.length) {
    payload.variants = rows.map((row) => {
      const original = payload.variants?.find(
        (variant) =>
          variant.selections.length === row.selections.length &&
          row.selections.every((selection) =>
            variant.selections.some(
              (value) =>
                setupNameEqual(value.optionName, selection.optionName) &&
                setupNameEqual(value.value, selection.value),
            ),
          ),
      )
      const stated =
        original?.sellingUnitPrices?.filter(
          (price) => !price.derivedFromUnit,
        ) ?? []
      const prices = [...stated]
      const sources = [
        ...(row.priceMinor === undefined
          ? []
          : [
              {
                unitName: payload.unitName,
                factor: "1",
                priceMinor: row.priceMinor,
              },
            ]),
        ...units.flatMap((unit) => {
          const price =
            stated.find((entry) => setupNameEqual(entry.unitName, unit.name))
              ?.priceMinor ?? unit.priceMinor
          return price === undefined || !positive(unit.containsQuantity)
            ? []
            : [
                {
                  unitName: unit.name,
                  factor: unit.containsQuantity,
                  priceMinor: price,
                },
              ]
        }),
      ]
      for (const unit of units) {
        if (prices.some((price) => setupNameEqual(price.unitName, unit.name)))
          continue
        if (unit.priceMinor !== undefined) {
          prices.push({ unitName: unit.name, priceMinor: unit.priceMinor })
          continue
        }
        if (!positive(unit.containsQuantity)) continue
        // Prefer the largest smaller stated package, so carton suggestions use
        // the crate's explicit price, not an inconsistent individual egg price.
        const source = sources
          .filter(
            (entry) => Number(entry.factor) < Number(unit.containsQuantity),
          )
          .sort((a, b) => Number(b.factor) - Number(a.factor))[0]
        if (!source) continue
        try {
          const multiplier = divideExactDecimals(
            unit.containsQuantity,
            source.factor,
            6,
          )
          const price = setupPackPrice(source.priceMinor, multiplier)
          if (price !== undefined)
            prices.push({
              unitName: unit.name,
              priceMinor: price,
              derivedFromUnit: source.unitName,
            })
        } catch {
          /* Inexact conversion remains unresolved. */
        }
      }
      return {
        ...original,
        selections: row.selections,
        priceMinor: row.priceMinor,
        sellingUnitPrices: prices,
        openingStock:
          row.openingStock ??
          (!payload.options?.length ? input.openingStock : undefined),
      }
    })
  }
  return payload
}

export function productPreparationNotes(payload: SetupProductPayload) {
  const notes: string[] = []
  const category = productCategoryLabel(
    payload.categoryKey,
    payload.categoryLabel,
  )
  if (category) notes.push(`Category: ${category}`)
  for (const unit of payload.sellingUnits ?? []) {
    if (unit.quantityDefault)
      notes.push(
        `Used 30 ${payload.unitName} per ${unit.name}; you can change this.`,
      )
    if (unit.referenceUnitName && unit.referenceQuantity)
      notes.push(
        `${unit.name} contains ${unit.referenceQuantity} ${unit.referenceUnitName}.`,
      )
  }
  for (const row of setupProductVariants(payload)) {
    const variant = payload.variants?.find(
      (entry) =>
        entry.selections.length === row.selections.length &&
        row.selections.every((selection) =>
          entry.selections.some(
            (value) =>
              setupNameEqual(value.optionName, selection.optionName) &&
              setupNameEqual(value.value, selection.value),
          ),
        ),
    )
    for (const price of variant?.sellingUnitPrices ?? [])
      if (price.derivedFromUnit)
        notes.push(
          `${row.label}: ${price.unitName} price suggested from ${price.derivedFromUnit} price; editable before creation.`,
        )
    for (const unit of row.sellingUnits) {
      const ordinary = setupPackPrice(row.priceMinor, unit.containsQuantity)
      if (
        ordinary !== undefined &&
        unit.priceMinor !== undefined &&
        unit.priceMinor > ordinary
      )
        notes.push(
          `${row.label}: your ${unit.name} price is higher than buying its contents individually. Kept your stated prices.`,
        )
    }
  }
  if (
    productCategoryReference(payload.name)?.kind === "shirts" &&
    !payload.options?.some((group) => /size/i.test(group.name))
  )
    notes.push(
      "Optional: add sizes for more detailed stock tracking. No size quantities have been assumed.",
    )
  return [...new Set(notes)]
}
