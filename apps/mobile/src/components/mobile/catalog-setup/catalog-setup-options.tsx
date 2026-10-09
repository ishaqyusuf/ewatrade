import * as Classic from "@/components/mobile/appearances/classic/catalog-setup"
import * as Market from "@/components/mobile/appearances/market-day/catalog-setup"
import { SetupCheckboxRow } from "@/components/mobile/setup-flow"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { cn } from "@/lib/utils"
import { formatMinorMoney } from "@ewatrade/utils"
import { getCatalogOptionValueHint } from "@ewatrade/utils/business-catalog-guidance"
import {
  Switch as NativeSwitch,
  Text as NativeText,
  TextInput,
  View,
} from "react-native"
import { catalogSetupClassName } from "./catalog-setup-presentation"
import type { CatalogVariantDraft } from "./catalog-variant-model"
import type { CatalogSetupModel } from "./use-catalog-setup"

export function CatalogSetupOptions({
  model,
  market,
}: { model: CatalogSetupModel; market: boolean }) {
  const {
    kind,
    formGuidance,
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
          description={formGuidance.options.helperText}
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
            <ServiceChoicesSectionHeader
              helperText={formGuidance.options.helperText}
              onAddOption={openVariantComposer}
            />
          ) : (
            <ProductOptionsSectionHeader
              helperText={formGuidance.options.helperText}
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
                  {formGuidance.options.helperText}
                </Text>
              ) : (
                <ProductFirstOptionAction
                  helperText={formGuidance.options.helperText}
                  onPress={openVariantComposer}
                />
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
                    helperText={getCatalogOptionValueHint(
                      formGuidance,
                      group.name,
                    )}
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

/**
 * Customer choices (01 Live Card): each group as a card of value chips, then
 * one price and an on switch per choice when there is a single group.
 */
export function ClassicProductChoices({
  model,
  onOpenPricing,
}: {
  model: CatalogSetupModel
  onOpenPricing: () => void
}) {
  const colors = useColors()
  const {
    optionGroups,
    showAdvanced,
    combinations,
    variantDrafts,
    makeDefaultVariantDraft,
    setVariantDrafts,
    currencyCode,
    unitName,
    price,
    openVariantComposer,
    openVariantValueComposer,
    openOptionNameEditor,
    removeOptionValue,
  } = model
  const symbol =
    formatMinorMoney(0, currencyCode).replace(/[\d.,\s]/g, "") || currencyCode
  const draft = (key: string) => variantDrafts[key] ?? makeDefaultVariantDraft()
  const update = (key: string, change: Partial<CatalogVariantDraft>) =>
    setVariantDrafts((current) => ({
      ...current,
      [key]: { ...(current[key] ?? makeDefaultVariantDraft()), ...change },
    }))
  const enabledCount = combinations.filter(
    (entry) => draft(entry.key).enabled,
  ).length
  const unitLabel = unitName.trim().toLowerCase() || "unit"

  if (!showAdvanced)
    return (
      <View className="gap-3.5">
        <Text className="text-[13px] text-muted-foreground">
          Sizes or grades customers pick. Each one has its own price.
        </Text>
        <Pressable
          accessibilityLabel="Add sizes or grades"
          accessibilityRole="button"
          className="min-h-[54px] flex-row items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed border-primary/50 active:bg-accent"
          disabled={model.locked}
          haptic
          onPress={() => {
            model.toggleOptionPricing()
            openVariantComposer()
          }}
        >
          <Icon className="size-[18px] text-primary" name="Plus" />
          <Text className="text-[14.5px] font-extrabold text-primary">
            Add sizes or grades
          </Text>
        </Pressable>
      </View>
    )

  return (
    <View className="gap-3.5">
      <Text className="text-[13px] text-muted-foreground">
        Sizes or grades customers pick. Each one has its own price.
      </Text>
      {optionGroups.map((group, index) => (
        <View
          key={group.id}
          className="gap-2 rounded-[20px] bg-card p-3.5 shadow-sm"
        >
          <View className="flex-row items-center justify-between gap-2">
            <Text className="min-w-0 flex-1 text-xs font-bold text-muted-foreground">
              {group.name || `Option ${index + 1}`}
            </Text>
            <Pressable
              accessibilityLabel={`Edit ${group.name || `option ${index + 1}`} name`}
              accessibilityRole="button"
              className="size-9 items-center justify-center rounded-full bg-muted"
              haptic
              onPress={() => openOptionNameEditor(group)}
            >
              <Icon className="size-[15px] text-foreground" name="Pencil" />
            </Pressable>
          </View>
          <View className="flex-row flex-wrap gap-1.5">
            {group.values.map((value) => (
              <View
                key={value.id}
                className="min-h-9 flex-row items-center gap-1 rounded-full border-[1.5px] border-primary/40 bg-accent pl-3 pr-1"
              >
                <Icon className="size-[13px] text-primary" name="Check" />
                <Text className="text-[12.5px] font-bold text-accent-foreground">
                  {value.label}
                </Text>
                <Pressable
                  accessibilityLabel={`Remove ${value.label}`}
                  accessibilityRole="button"
                  className="size-7 items-center justify-center rounded-full"
                  haptic
                  onPress={() => removeOptionValue(group.id, value.id)}
                >
                  <Icon
                    className="size-[12px] text-accent-foreground"
                    name="X"
                  />
                </Pressable>
              </View>
            ))}
            <Pressable
              accessibilityLabel={`Add to ${group.name || `option ${index + 1}`}`}
              accessibilityRole="button"
              className="min-h-9 flex-row items-center gap-1 rounded-full border-[1.5px] border-dashed border-border px-3"
              haptic
              onPress={() => openVariantValueComposer(group.id)}
            >
              <Icon className="size-[13px] text-muted-foreground" name="Plus" />
              <Text className="text-[12.5px] font-bold text-muted-foreground">
                Add
              </Text>
            </Pressable>
          </View>
        </View>
      ))}
      {optionGroups.length === 1 && combinations.length ? (
        <>
          <View className="mt-2 flex-row items-baseline justify-between">
            <Text className="text-base font-extrabold text-foreground">
              {`Price per ${unitLabel}`}
            </Text>
            <Text className="text-[13px] font-bold text-muted-foreground">
              {`${enabledCount} on`}
            </Text>
          </View>
          <View className="rounded-[20px] bg-card px-3.5 shadow-sm">
            {combinations.map((combination, index) => {
              const entry = draft(combination.key)
              return (
                <View
                  key={combination.key}
                  className={cn(
                    "min-h-[58px] flex-row items-center gap-2.5 py-2.5",
                    index > 0 && "border-t border-border",
                  )}
                >
                  <Text
                    numberOfLines={1}
                    className="min-w-0 flex-1 text-sm font-bold text-foreground"
                  >
                    {combination.name}
                  </Text>
                  <View
                    style={{
                      alignItems: "center",
                      backgroundColor: colors.muted,
                      borderColor: colors.border,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      flexDirection: "row",
                      gap: 4,
                      height: 42,
                      opacity: entry.enabled ? 1 : 0.4,
                      paddingHorizontal: 10,
                      width: 116,
                    }}
                  >
                    <NativeText
                      style={{
                        color: colors.mutedForeground,
                        fontWeight: "800",
                      }}
                    >
                      {symbol}
                    </NativeText>
                    <TextInput
                      accessibilityLabel={`Price for ${combination.name}`}
                      editable={entry.enabled && !model.locked}
                      keyboardType="decimal-pad"
                      maxFontSizeMultiplier={1.3}
                      onChangeText={(value) =>
                        update(combination.key, { price: value })
                      }
                      placeholder={price || "0"}
                      placeholderTextColor={colors.mutedForeground}
                      selectTextOnFocus
                      style={{
                        color: colors.foreground,
                        flex: 1,
                        fontSize: 14,
                        fontVariant: ["tabular-nums"],
                        fontWeight: "700",
                        padding: 0,
                      }}
                      value={entry.price}
                    />
                  </View>
                  <NativeSwitch
                    accessibilityLabel={`Sell ${combination.name}`}
                    disabled={model.locked}
                    ios_backgroundColor={colors.border}
                    onValueChange={(checked) =>
                      update(combination.key, { enabled: checked })
                    }
                    thumbColor={colors.card}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    value={entry.enabled}
                  />
                </View>
              )
            })}
          </View>
          {enabledCount === 0 ? (
            <StatusBanner
              icon="AlertCircle"
              tone="destructive"
              message="Keep at least one choice on."
            />
          ) : null}
        </>
      ) : optionGroups.length > 1 ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-[58px] flex-row items-center gap-3 rounded-[20px] bg-card px-3.5 py-3 shadow-sm active:opacity-70"
          haptic
          onPress={onOpenPricing}
        >
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-bold text-foreground">
              Price each combination
            </Text>
            <Text className="text-xs text-muted-foreground">
              {`${combinations.length} combinations · ${enabledCount} on`}
            </Text>
          </View>
          <Icon
            className="size-[18px] text-muted-foreground"
            name="ChevronRight"
          />
        </Pressable>
      ) : null}
      <Pressable
        accessibilityLabel="Add another choice group"
        accessibilityRole="button"
        className="min-h-[50px] flex-row items-center justify-center gap-2 rounded-[16px] border-[1.5px] border-dashed border-primary/50 active:bg-accent"
        haptic
        onPress={openVariantComposer}
      >
        <Icon className="size-[17px] text-primary" name="Plus" />
        <Text className="text-sm font-extrabold text-primary">
          {optionGroups.length ? "Add another group" : "Add a choice group"}
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Use one price"
        accessibilityRole="button"
        className="min-h-11 items-center justify-center"
        haptic
        onPress={() => model.requestConfirmation({ kind: "remove-options" })}
      >
        <Text className="text-sm text-destructive">Use one price instead</Text>
      </Pressable>
    </View>
  )
}
