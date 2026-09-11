import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "react-native"
import { catalogSetupClassName } from "./catalog-setup-presentation"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import * as Classic from "@/components/mobile/appearances/classic/catalog-setup"
import * as Market from "@/components/mobile/appearances/market-day/catalog-setup"
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
  const largeTextLayout = useLargeTextLayout()
  const { SectionHeaderActions } = market ? Market : Classic
  if (!kind) return null
  return (
    <>
      {kind === "product" ? (
        <View
          className={catalogSetupClassName(
            "mt-3 gap-5 border-t border-border pt-7",
            market,
          )}
        >
          <View
            className={
              largeTextLayout
                ? "gap-3"
                : "flex-row items-center justify-between gap-3"
            }
          >
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
            <SectionHeaderActions
              addLabel="Add unit"
              canRemove={additionalUnits.length > 0}
              onAdd={() => openUnitEditor()}
              onRemove={() =>
                model.requestConfirmation({ kind: "remove-units" })
              }
              removeLabel="Remove all additional units"
            />
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
                        ? `${unit.relationCount} ${unit.name} in 1 ${unitName.trim() || "main unit"}`
                        : `1 ${unit.name} contains ${unit.relationCount} ${unitName.trim() || "main units"}`}{" "}
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
                No extra selling units. Your stock unit is enough to begin.
              </Text>
            </View>
          )}
        </View>
      ) : null}
    </>
  )
}
