import { ActionButton } from "@/components/mobile/action-button"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColorScheme } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { cn } from "@/lib/utils"
import { formatMinorMoney } from "@ewatrade/utils"
import { View } from "react-native"
import { catalogSetupClassName } from "./catalog-setup-presentation"
import type { CatalogSetupModel } from "./use-catalog-setup"

export function CatalogSetupUnits({
  model,
  market,
}: { model: CatalogSetupModel; market: boolean }) {
  const {
    kind,
    multiplePriceOptions,
    unitName,
    additionalUnits,
    currencyCode,
    openUnitEditor,
  } = model
  if (!kind) return null
  if (!market && kind === "product")
    return <ClassicSellingUnits model={model} />
  return (
    <>
      {kind === "product" ? (
        <View
          className={catalogSetupClassName(
            "mt-3 gap-5 border-t border-border pt-7",
            market,
          )}
        >
          <View className="gap-3">
            <View
              className={catalogSetupClassName("min-w-0 flex-1 gap-1", market)}
            >
              <Text
                className={catalogSetupClassName(
                  "text-lg font-extrabold text-foreground",
                  market,
                )}
              >
                Selling units
              </Text>
              <Text
                className={catalogSetupClassName(
                  "text-xs [-rn-line-height:20] text-muted-foreground",
                  market,
                )}
              >
                Add cartons, packs, or other ways customers buy this Product.
              </Text>
            </View>
          </View>

          {additionalUnits.length > 0 ? (
            <View
              className={catalogSetupClassName(
                "border-t border-border",
                market,
              )}
            >
              {additionalUnits.map((unit) => (
                <View
                  className={catalogSetupClassName(
                    "flex-row items-center gap-3 border-b border-border py-4",
                    market,
                  )}
                  key={unit.id}
                >
                  <View
                    className={catalogSetupClassName(
                      "min-w-0 flex-1 gap-1",
                      market,
                    )}
                  >
                    <Text
                      className={catalogSetupClassName(
                        "font-bold text-foreground",
                        market,
                      )}
                    >
                      {unit.name}
                    </Text>
                    <Text
                      className={catalogSetupClassName(
                        "text-xs [-rn-line-height:20] text-muted-foreground",
                        market,
                      )}
                    >
                      {unit.relationDirection === "units_per_canonical"
                        ? `${unit.relationCount} ${unit.name} in 1 ${additionalUnits.find((parent) => parent.id === unit.referenceUnitId)?.name || unitName.trim() || "main unit"}`
                        : `1 ${unit.name} contains ${unit.relationCount} ${additionalUnits.find((parent) => parent.id === unit.referenceUnitId)?.name || unitName.trim() || "main units"}`}{" "}
                      ·{" "}
                      {multiplePriceOptions
                        ? "Priced by option"
                        : unit.price.trim()
                          ? `Default price ${currencyCode} ${unit.price}`
                          : "Price not set"}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`Edit ${unit.name} unit`}
                    className={catalogSetupClassName(
                      "h-11 w-11 items-center justify-center rounded-full bg-muted",
                      market,
                    )}
                    haptic
                    onPress={() => openUnitEditor(unit)}
                  >
                    <Icon
                      className={catalogSetupClassName(
                        "size-sm text-foreground",
                        market,
                      )}
                      name="Pencil"
                    />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Delete ${unit.name} unit`}
                    className={catalogSetupClassName(
                      "h-11 w-11 items-center justify-center rounded-full bg-destructive/10",
                      market,
                    )}
                    haptic
                    onPress={() =>
                      model.requestConfirmation({
                        kind: "remove-unit",
                        id: unit.id,
                        name: unit.name,
                      })
                    }
                  >
                    <Icon
                      className={catalogSetupClassName(
                        "size-sm text-destructive",
                        market,
                      )}
                      name="Trash"
                    />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <View
              className={catalogSetupClassName(
                "rounded-2xl bg-muted/60 px-4 py-3",
                market,
              )}
            >
              <Text
                className={catalogSetupClassName(
                  "text-xs [-rn-line-height:20] text-muted-foreground",
                  market,
                )}
              >
                No extra selling units. Your main unit is enough to begin.
              </Text>
            </View>
          )}
          <ActionButton
            variant="outline"
            trailingIcon="Plus"
            onPress={() => openUnitEditor()}
          >
            {additionalUnits.length
              ? "Add another selling unit"
              : "Add a selling unit"}
          </ActionButton>
          {additionalUnits.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove all additional units"
              className="min-h-11 items-center justify-center px-4 py-3"
              onPress={() =>
                model.requestConfirmation({ kind: "remove-units" })
              }
            >
              <Text className="text-sm text-destructive">
                Remove all additional units
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  )
}

/** Sell another way list (01 Live Card): one card of units, dashed add row. */
function ClassicSellingUnits({ model }: { model: CatalogSetupModel }) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const {
    additionalUnits,
    currencyCode,
    multiplePriceOptions,
    openUnitEditor,
    unitName,
  } = model
  const main = unitName.trim() || "main unit"
  return (
    <View className="gap-3.5">
      <Text className="text-[13px] text-muted-foreground">
        Packs, trays and cartons are amounts customers buy. A size customers
        choose goes in Customer choices.
      </Text>
      {additionalUnits.length ? (
        <View className="rounded-[20px] bg-card px-3.5 shadow-sm">
          {additionalUnits.map((unit, index) => {
            const parent =
              additionalUnits.find((entry) => entry.id === unit.referenceUnitId)
                ?.name ?? main
            const relation =
              unit.relationDirection === "units_per_canonical"
                ? `1 ${parent} = ${unit.relationCount} ${unit.name}`
                : `1 ${unit.name} = ${unit.relationCount} ${parent}`
            const price = multiplePriceOptions
              ? "Priced by option"
              : unit.price.trim()
                ? formatMinorMoney(
                    Math.round(Number(unit.price.replace(/,/g, "")) * 100),
                    currencyCode,
                  ).replace(/\.00(?=\D*$)/, "")
                : "Price not set"
            return (
              <View
                key={unit.id}
                className={cn(
                  "min-h-[62px] flex-row items-center gap-3 py-3",
                  index > 0 && "border-t border-border",
                )}
              >
                <View
                  style={{
                    alignItems: "center",
                    backgroundColor: palette.sky,
                    borderRadius: 11,
                    height: 36,
                    justifyContent: "center",
                    width: 36,
                  }}
                >
                  <Icon
                    className="size-[17px]"
                    color={palette.skyForeground}
                    name="Layers"
                  />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-bold text-foreground">
                    {unit.name}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {`${relation} · ${price}`}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel={`Edit ${unit.name} unit`}
                  accessibilityRole="button"
                  className="size-11 items-center justify-center rounded-full bg-muted"
                  haptic
                  onPress={() => openUnitEditor(unit)}
                >
                  <Icon className="size-[17px] text-foreground" name="Pencil" />
                </Pressable>
                <Pressable
                  accessibilityLabel={`Delete ${unit.name} unit`}
                  accessibilityRole="button"
                  className="size-11 items-center justify-center rounded-full bg-destructive/10"
                  haptic
                  onPress={() =>
                    model.requestConfirmation({
                      kind: "remove-unit",
                      id: unit.id,
                      name: unit.name,
                    })
                  }
                >
                  <Icon className="size-[17px] text-destructive" name="Trash" />
                </Pressable>
              </View>
            )
          })}
        </View>
      ) : (
        <View className="rounded-[18px] bg-card px-4 py-3.5 shadow-sm">
          <Text className="text-[13px] text-muted-foreground">
            {`No other way yet. Customers buy by the ${main.toLowerCase()}.`}
          </Text>
        </View>
      )}
      <Pressable
        accessibilityLabel="Add a selling unit"
        accessibilityRole="button"
        className="min-h-[54px] flex-row items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed border-primary/50 active:bg-accent"
        haptic
        onPress={() => openUnitEditor()}
      >
        <Icon className="size-[18px] text-primary" name="Plus" />
        <Text className="text-[14.5px] font-extrabold text-primary">
          {additionalUnits.length ? "Add another way" : "Add a carton or pack"}
        </Text>
      </Pressable>
      {additionalUnits.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove all additional units"
          className="min-h-11 items-center justify-center px-4"
          onPress={() => model.requestConfirmation({ kind: "remove-units" })}
        >
          <Text className="text-sm text-destructive">
            Remove all additional units
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}
