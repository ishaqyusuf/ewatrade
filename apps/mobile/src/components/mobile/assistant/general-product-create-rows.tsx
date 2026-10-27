import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils/currency"
import { useState } from "react"
import { FormField } from "../form-field"

type Action = Extract<GeneralAction, { action: "product_create" }>
type Variants = NonNullable<Action["variants"]>

/** Packs and options: a price per unit and a stock count for each option. */
export function GeneralProductCreateRows({
  payload,
  disabled,
  onChange,
}: {
  payload: Action
  disabled: boolean
  onChange: (variants: Variants) => void
}) {
  const unit = payload.canonicalUnitName
  const packs = payload.sellingUnits ?? []
  const units = [unit, ...packs.map((pack) => pack.name)]
  const variants = payload.variants ?? []
  // Typed text stays as entered; an unreadable price is left out, so Save
  // reports which price is still needed.
  const [prices, setPrices] = useState(() =>
    variants.map((variant) => [
      minorToMajorInput(variant.priceMinor),
      ...packs.map((pack) =>
        minorToMajorInput(
          variant.sellingUnitPrices?.find(
            (price) => price.unitName === pack.name,
          )?.priceMinor,
        ),
      ),
    ]),
  )
  const setPrice = (index: number, at: number, text: string) => {
    const nextPrices = prices.map((row, i) =>
      i === index ? row.map((value, j) => (j === at ? text : value)) : row,
    )
    setPrices(nextPrices)
    onChange(
      variants.map((variant, i) => {
        const minor = (nextPrices[i] ?? []).map(
          (value) => majorToMinor(value) ?? undefined,
        )
        return {
          ...variant,
          priceMinor: minor[0],
          sellingUnitPrices: packs.flatMap((pack, j) => {
            const priceMinor = minor[j + 1]
            return priceMinor === undefined
              ? []
              : [
                  {
                    unitName: pack.name,
                    priceMinor,
                    derivedFromUnit:
                      i === index && j + 1 === at
                        ? undefined
                        : variant.sellingUnitPrices?.find(
                            (price) => price.unitName === pack.name,
                          )?.derivedFromUnit,
                  },
                ]
          }),
        }
      }),
    )
  }
  return (
    <>
      {variants.map((variant, index) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: rows follow the saved option order
          key={index}
          className="gap-3 rounded-2xl border border-border px-3 py-3"
        >
          <Text className="text-sm font-bold text-foreground">
            {variant.selections.map((entry) => entry.value).join(" / ") ||
              payload.name}
          </Text>
          {units.map((unitName, at) => (
            <FormField
              key={unitName}
              label={`Price per ${unitName}`}
              value={prices[index]?.[at] ?? ""}
              editable={!disabled}
              keyboardType="decimal-pad"
              onChangeText={(text) => setPrice(index, at, text)}
            />
          ))}
          <FormField
            label={`Opening stock (${unit})`}
            value={variant.openingStock ?? ""}
            placeholder="Not supplied"
            editable={!disabled}
            keyboardType="decimal-pad"
            onChangeText={(text) =>
              onChange(
                variants.map((current, i) =>
                  i === index
                    ? {
                        ...current,
                        stockByUnit: undefined,
                        openingStock: text.trim() || undefined,
                      }
                    : current,
                ),
              )
            }
          />
        </View>
      ))}
    </>
  )
}
