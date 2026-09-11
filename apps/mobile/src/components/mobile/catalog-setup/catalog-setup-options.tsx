import { SetupCheckboxRow } from "@/components/mobile/setup-flow"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "react-native"
import { catalogSetupClassName } from "./catalog-setup-presentation"
import * as Classic from "@/components/mobile/appearances/classic/catalog-setup"
import * as Market from "@/components/mobile/appearances/market-day/catalog-setup"
import type { CatalogSetupModel } from "./use-catalog-setup"

export function CatalogSetupOptions({
  model,
  market,
}: { model: CatalogSetupModel; market: boolean }) {
  const {
    kind,
    multiplePriceOptions,
    showAdvanced,
    optionGroups,
    openVariantComposer,
    openVariantValueComposer,
    openOptionNameEditor,
    removeOptionValue,
  } = model
  const {
    ServiceChoicesSectionHeader,
    EmptyServiceChoiceGroupActions,
    ProductOptionsSectionHeader,
    ProductFirstOptionAction,
    ProductFirstOptionValueAction,
    ProductUseOnePriceAction,
  } = market ? Market : Classic
  if (!kind) return null
  return (
    <>
      {kind === "product" ? (
        <SetupCheckboxRow
          checked={multiplePriceOptions}
          description="Use this for sizes, colours, or units that need their own prices."
          label="Different prices or options"
          onPress={model.toggleOptionPricing}
        />
      ) : null}

      {showAdvanced ? (
        <View
          className={catalogSetupClassName(
            "mt-3 gap-5 border-t border-border pt-7",
            market,
          )}
        >
          {kind === "service" ? (
            <ServiceChoicesSectionHeader onAddOption={openVariantComposer} />
          ) : (
            <ProductOptionsSectionHeader
              hasOptions={optionGroups.length > 0}
              onAddOption={openVariantComposer}
            />
          )}

          <View
            className={catalogSetupClassName("border-t border-border", market)}
          >
            {optionGroups.length === 0 ? (
              kind === "service" ? (
                <Text
                  className={catalogSetupClassName(
                    "border-b border-border py-5 text-sm text-muted-foreground",
                    market,
                  )}
                >
                  No service choices yet. Add a Package, Service level, or
                  Turnaround option.
                </Text>
              ) : (
                <ProductFirstOptionAction onPress={openVariantComposer} />
              )
            ) : null}
            {optionGroups.map((group, index) => (
              <View
                className={catalogSetupClassName(
                  "gap-3 border-b border-border py-4",
                  market,
                )}
                key={group.id}
              >
                <View
                  className={catalogSetupClassName(
                    "flex-row items-center gap-3",
                    market,
                  )}
                >
                  <View
                    className={catalogSetupClassName(
                      "min-w-0 flex-1 gap-0.5",
                      market,
                    )}
                  >
                    <Text
                      className={catalogSetupClassName(
                        "text-base font-extrabold text-foreground",
                        market,
                      )}
                    >
                      {group.name || `Option ${index + 1}`}
                    </Text>
                    <Text
                      className={catalogSetupClassName(
                        "text-xs text-muted-foreground",
                        market,
                      )}
                    >
                      {group.values.length}{" "}
                      {kind === "service"
                        ? group.values.length === 1
                          ? "choice"
                          : "choices"
                        : group.values.length === 1
                          ? "value"
                          : "values"}
                    </Text>
                  </View>
                  {optionGroups.length > 1 ? (
                    <Pressable
                      accessibilityLabel={`Remove ${group.name || `option ${index + 1}`}`}
                      className={catalogSetupClassName(
                        "min-h-11 min-w-16 items-center justify-center rounded-full px-4 active:bg-destructive/10",
                        market,
                      )}
                      haptic
                      onPress={() =>
                        model.requestConfirmation({
                          kind: "remove-group",
                          id: group.id,
                          name: group.name,
                        })
                      }
                    >
                      <Text
                        className={catalogSetupClassName(
                          "text-xs font-bold text-destructive",
                          market,
                        )}
                      >
                        Remove
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityLabel={`Edit ${group.name || `option ${index + 1}`} name`}
                    className={catalogSetupClassName(
                      "h-11 w-11 items-center justify-center rounded-full bg-muted",
                      market,
                    )}
                    haptic
                    onPress={() => openOptionNameEditor(group)}
                    transition
                  >
                    <Icon
                      className={catalogSetupClassName(
                        "size-sm text-foreground",
                        market,
                      )}
                      name="Pencil"
                    />
                  </Pressable>
                </View>

                {kind === "product" && group.values.length === 0 ? (
                  <ProductFirstOptionValueAction
                    groupName={group.name}
                    onPress={() => openVariantValueComposer(group.id)}
                  />
                ) : kind === "service" && group.values.length === 0 ? (
                  <EmptyServiceChoiceGroupActions
                    groupName={group.name}
                    onAddFirstChoice={() => openVariantValueComposer(group.id)}
                  />
                ) : (
                  <View
                    className={catalogSetupClassName(
                      "flex-row flex-wrap gap-2",
                      market,
                    )}
                  >
                    {group.values.map((value) => (
                      <View
                        className={catalogSetupClassName(
                          "min-h-10 flex-row items-center gap-2 rounded-full bg-primary px-3",
                          market,
                        )}
                        key={value.id}
                      >
                        <Text
                          className={catalogSetupClassName(
                            "text-xs font-bold text-primary-foreground",
                            market,
                          )}
                        >
                          {value.label}
                        </Text>
                        <Pressable
                          accessibilityLabel={`Remove ${value.label}`}
                          className={catalogSetupClassName(
                            "h-7 w-7 items-center justify-center rounded-full",
                            market,
                          )}
                          haptic
                          onPress={() => removeOptionValue(group.id, value.id)}
                        >
                          <Icon
                            className={catalogSetupClassName(
                              "size-xs text-primary-foreground",
                              market,
                            )}
                            name="X"
                          />
                        </Pressable>
                      </View>
                    ))}
                    <Pressable
                      accessibilityLabel={`Add values to ${group.name || `option ${index + 1}`}`}
                      className={catalogSetupClassName(
                        "min-h-10 flex-row items-center gap-2 rounded-full bg-muted px-3",
                        market,
                      )}
                      haptic
                      onPress={() => openVariantValueComposer(group.id)}
                      transition
                    >
                      <Icon
                        className={catalogSetupClassName(
                          "size-xs text-foreground",
                          market,
                        )}
                        name="Plus"
                      />
                      <Text
                        className={catalogSetupClassName(
                          "text-xs font-bold text-foreground",
                          market,
                        )}
                      >
                        {kind === "service"
                          ? group.values.length === 0
                            ? "Add first choice"
                            : "Add choice"
                          : "Add value"}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </View>

          {kind === "product" ? (
            <ProductUseOnePriceAction
              onPress={() =>
                model.requestConfirmation({ kind: "remove-options" })
              }
            />
          ) : (
            <Pressable
              accessibilityLabel="Remove all service choices"
              className={catalogSetupClassName(
                "-mx-2 min-h-16 flex-row items-center gap-3 rounded-2xl px-3 py-3 active:bg-destructive/10",
                market,
              )}
              haptic
              onPress={() =>
                model.requestConfirmation({ kind: "remove-options" })
              }
            >
              <Text
                className={catalogSetupClassName(
                  "text-xs font-extrabold text-destructive",
                  market,
                )}
              >
                Remove all service choices
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </>
  )
}
