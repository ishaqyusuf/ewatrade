import { CatalogFormText as Text } from "@/components/mobile/catalog-form-text"
import { FormField as BaseFormField } from "@/components/mobile/form-field"
import { MoneyField as BaseMoneyField } from "@/components/mobile/money-field"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { resolveCatalogOptionUnitPrice } from "@/lib/catalog-option-pricing"
import {
  BottomSheetFooter,
  type BottomSheetFooterProps,
} from "@gorhom/bottom-sheet"
import { type ComponentProps, useMemo, useState } from "react"
import { Keyboard, View } from "react-native"
import { KeyboardStickyView } from "react-native-keyboard-controller"

export type CatalogVariantDraft = {
  barcode: string
  description: string
  enabled: boolean
  imageUrl: string
  price: string
  quantity: string
  quoteRequired: boolean
  sku: string
  storeIds: string[]
  unitPrices: Record<string, string>
}

type CatalogVariantCombination = {
  key: string
  name: string
}

type CatalogVariantUnit = {
  id: string
  name: string
  price: string
  stockBehavior?: "alternate_transaction" | "packaged_stock"
}

type CatalogVariantStore = {
  id: string
  name: string
}

type CatalogVariantManagerProps = {
  basePrice: string
  combinations: CatalogVariantCombination[]
  currencyCode: string
  drafts: Record<string, CatalogVariantDraft>
  kind: "product" | "service"
  makeDefaultDraft: () => CatalogVariantDraft
  onChangeDraft: (key: string, draft: CatalogVariantDraft) => void
  optionPricingOnly?: boolean
  stores: CatalogVariantStore[]
  unitName: string
  units: CatalogVariantUnit[]
}

function FormField(props: ComponentProps<typeof BaseFormField>) {
  return <BaseFormField textScale={1.5} {...props} />
}

function MoneyField(props: ComponentProps<typeof BaseMoneyField>) {
  return <BaseMoneyField textScale={1.5} {...props} />
}

function displayValue(value: string, fallback = "Not set") {
  return value.trim() || fallback
}

function MenuAction({
  icon,
  label,
  onPress,
}: {
  icon: "Check" | "EyeOff" | "Pencil"
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      className="min-h-14 flex-row items-center gap-3 border-b border-border py-3 last:border-b-0"
      haptic
      onPress={onPress}
      transition
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-sm text-foreground" name={icon} />
      </View>
      <Text className="font-semibold text-foreground">{label}</Text>
    </Pressable>
  )
}

export function CatalogVariantManager({
  basePrice,
  combinations,
  currencyCode,
  drafts,
  kind,
  makeDefaultDraft,
  onChangeDraft,
  optionPricingOnly = false,
  stores,
  unitName,
  units,
}: CatalogVariantManagerProps) {
  const actionModal = useModal()
  const editorModal = useModal()
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [actionUnitId, setActionUnitId] = useState<string | null>(null)
  const [editor, setEditor] = useState<{
    draft: CatalogVariantDraft
    key: string
    unitId?: string
  } | null>(null)
  const [descriptionVisible, setDescriptionVisible] = useState(false)
  const [editorExpanded, setEditorExpanded] = useState(false)
  const actionCombination = useMemo(
    () => combinations.find((combination) => combination.key === actionKey),
    [actionKey, combinations],
  )
  const actionUnit = units.find((unit) => unit.id === actionUnitId)
  const editorUnit = units.find((unit) => unit.id === editor?.unitId)

  const getDraft = (key: string) => drafts[key] ?? makeDefaultDraft()

  const openActions = (key: string, unitId?: string) => {
    Keyboard.dismiss()
    setActionKey(key)
    setActionUnitId(unitId ?? null)
    setTimeout(actionModal.present, 80)
  }

  const openEditor = (key: string, unitId?: string) => {
    const draft = getDraft(key)
    setEditor({
      draft: { ...draft, unitPrices: { ...draft.unitPrices } },
      key,
      unitId,
    })
    setDescriptionVisible(Boolean(draft.description.trim()))
    setEditorExpanded(false)
    setTimeout(() => {
      editorModal.present()
    }, 140)
  }

  const editFromActions = () => {
    if (!actionKey) return
    const key = actionKey
    const unitId = actionUnitId ?? undefined
    actionModal.dismiss()
    setActionKey(null)
    setActionUnitId(null)
    openEditor(key, unitId)
  }

  const toggleEnabledFromActions = () => {
    if (!actionKey) return
    const draft = getDraft(actionKey)
    onChangeDraft(actionKey, { ...draft, enabled: !draft.enabled })
    actionModal.dismiss()
    setActionKey(null)
    setActionUnitId(null)
  }

  const updateEditor = (update: Partial<CatalogVariantDraft>) => {
    setEditor((current) =>
      current
        ? { ...current, draft: { ...current.draft, ...update } }
        : current,
    )
  }

  const updateEditorUnitPrice = (unitId: string, value: string) => {
    setEditor((current) =>
      current
        ? {
            ...current,
            draft: {
              ...current.draft,
              unitPrices: { ...current.draft.unitPrices, [unitId]: value },
            },
          }
        : current,
    )
  }

  const expandEditor = () => {
    Keyboard.dismiss()
    setEditorExpanded(true)
    requestAnimationFrame(() => editorModal.ref.current?.snapToIndex(1))
  }

  const saveEditor = () => {
    if (!editor) return
    onChangeDraft(editor.key, editor.draft)
    editorModal.dismiss()
  }

  const renderEditorFooter = (props: BottomSheetFooterProps) => (
    <BottomSheetFooter {...props} bottomInset={20}>
      {/* The requested save check stays visible throughout option editing. */}
      <KeyboardStickyView offset={{ closed: 0, opened: 16 }}>
        <View className="items-end px-5">
          <Pressable
            accessibilityLabel="Save option configuration"
            className="h-14 w-14 items-center justify-center rounded-full bg-primary"
            haptic
            onPress={saveEditor}
            transition
          >
            <Icon className="size-base text-primary-foreground" name="Check" />
          </Pressable>
        </View>
      </KeyboardStickyView>
    </BottomSheetFooter>
  )

  return (
    <>
      <View className="border-t border-border">
        {combinations.map((combination) => {
          const draft = getDraft(combination.key)
          const canonicalUnitName = displayValue(unitName, "Unit not set")
          const listingUnits =
            kind === "product"
              ? [
                  {
                    id: "canonical",
                    name: canonicalUnitName,
                    price: draft.price.trim(),
                    stock: draft.quantity.trim()
                      ? `${draft.quantity.trim()} ${canonicalUnitName}`
                      : "Stock not set",
                  },
                  ...units.map((unit) => ({
                    id: unit.id,
                    name: unit.name,
                    price: resolveCatalogOptionUnitPrice({
                      optionPrice: draft.price,
                      optionPricingOnly,
                      unitDefaultPrice: unit.price,
                      unitOverridePrice: draft.unitPrices[unit.id] ?? "",
                    }),
                    stock:
                      unit.stockBehavior === "packaged_stock"
                        ? "Prepared stock"
                        : `Shared ${canonicalUnitName} stock`,
                  })),
                ]
              : [
                  {
                    id: "service",
                    name: "",
                    price: draft.price.trim() || basePrice.trim(),
                    stock: draft.quoteRequired ? "Quote" : "Fixed price",
                  },
                ]

          return listingUnits.map((listingUnit) => {
            const resolvedPrice = listingUnit.price
              ? `${currencyCode} ${listingUnit.price}`
              : "Price not set"
            const listingTitle = listingUnit.name
              ? `${combination.name} · ${listingUnit.name}`
              : combination.name

            return (
              <View
                className={
                  draft.enabled
                    ? "flex-row items-center gap-2 border-b border-border"
                    : "flex-row items-center gap-2 border-b border-border opacity-60"
                }
                key={`${combination.key}-${listingUnit.id}`}
              >
                <Pressable
                  accessibilityHint="Opens this listing for editing"
                  accessibilityLabel={`Edit ${listingTitle}`}
                  className="min-h-20 min-w-0 flex-1 justify-center gap-1 py-4"
                  haptic
                  onPress={() =>
                    openEditor(
                      combination.key,
                      kind === "product" && listingUnit.id !== "canonical"
                        ? listingUnit.id
                        : undefined,
                    )
                  }
                  transition
                >
                  <View className="flex-row items-center gap-2">
                    <Text
                      className="min-w-0 flex-1 font-bold text-foreground"
                      numberOfLines={2}
                    >
                      {listingTitle}
                    </Text>
                    {!draft.enabled ? (
                      <Text className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-[0.8px] text-muted-foreground">
                        Disabled
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    className="text-xs leading-5 text-muted-foreground"
                    numberOfLines={2}
                  >
                    {listingUnit.stock} · {resolvedPrice}
                  </Text>
                  {draft.description.trim() ? (
                    <Text
                      className="text-xs leading-5 text-muted-foreground"
                      numberOfLines={2}
                    >
                      {draft.description.trim()}
                    </Text>
                  ) : null}
                </Pressable>
                <Pressable
                  accessibilityLabel={`Open ${listingTitle} menu`}
                  className="h-11 w-11 items-center justify-center rounded-full bg-transparent active:bg-muted"
                  haptic
                  onPress={() =>
                    openActions(
                      combination.key,
                      kind === "product" && listingUnit.id !== "canonical"
                        ? listingUnit.id
                        : undefined,
                    )
                  }
                  transition
                >
                  <Icon className="size-sm text-foreground" name="more" />
                </Pressable>
              </View>
            )
          })
        })}
      </View>

      <Modal
        onDismiss={() => {
          setActionKey(null)
          setActionUnitId(null)
        }}
        ref={actionModal.ref}
        snapPoints={["38%"]}
        title={
          actionCombination
            ? actionUnit
              ? `${actionCombination.name} · ${actionUnit.name}`
              : actionCombination.name
            : "Option"
        }
      >
        {actionCombination ? (
          <View className="px-5 pb-6">
            <MenuAction icon="Pencil" label="Edit" onPress={editFromActions} />
            <MenuAction
              icon={
                getDraft(actionCombination.key).enabled ? "EyeOff" : "Check"
              }
              label={
                getDraft(actionCombination.key).enabled
                  ? "Disable entire option combination"
                  : "Enable entire option combination"
              }
              onPress={toggleEnabledFromActions}
            />
          </View>
        ) : null}
      </Modal>

      <Modal
        onChange={(index) => {
          setEditorExpanded(index === 1)
        }}
        onDismiss={() => {
          setEditor(null)
          setDescriptionVisible(false)
          setEditorExpanded(false)
        }}
        footerComponent={renderEditorFooter}
        ref={editorModal.ref}
        snapPoints={["62%", "96%"]}
        title={
          editor
            ? [
                combinations.find(
                  (combination) => combination.key === editor.key,
                )?.name,
                editorUnit?.name,
              ]
                .filter(Boolean)
                .join(" · ")
            : "Edit option"
        }
      >
        {editor ? (
          <View className="flex-1">
            <BottomSheetKeyboardAwareScrollView
              bottomOffset={140}
              contentContainerStyle={{ paddingBottom: 132 }}
              extraKeyboardSpace={220}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
            >
              <View className="gap-5 px-5 pb-4">
                {editorUnit ? (
                  <Text className="text-sm leading-6 text-muted-foreground">
                    Editing the {editorUnit.name} price. Quantity, description,
                    media, codes, and availability belong to the full option
                    combination.
                  </Text>
                ) : null}
                <View className="flex-row gap-3">
                  {kind === "product" && !editorUnit ? (
                    <FormField
                      containerClassName="min-w-0 flex-1"
                      keyboardType="decimal-pad"
                      label="Qty"
                      onChangeText={(quantity) => updateEditor({ quantity })}
                      placeholder="0"
                      value={editor.draft.quantity}
                    />
                  ) : null}
                  <MoneyField
                    containerClassName="min-w-0 flex-1"
                    currencyCode={currencyCode}
                    label={editorUnit ? `${editorUnit.name} price` : "Price"}
                    onChangeValue={(price) =>
                      editorUnit
                        ? updateEditorUnitPrice(editorUnit.id, price)
                        : updateEditor({ price })
                    }
                    placeholder={
                      editorUnit
                        ? (!optionPricingOnly ? editorUnit.price.trim() : "") ||
                          (!optionPricingOnly
                            ? editor.draft.price.trim() || basePrice.trim()
                            : "0.00")
                        : basePrice.trim() || "0.00"
                    }
                    value={
                      editorUnit
                        ? (editor.draft.unitPrices[editorUnit.id] ?? "")
                        : editor.draft.price
                    }
                  />
                </View>

                {editorUnit ? null : descriptionVisible ? (
                  <FormField
                    label="Description"
                    multiline
                    onActionPress={() => {
                      updateEditor({ description: "" })
                      setDescriptionVisible(false)
                    }}
                    actionLabel="Remove"
                    onChangeText={(description) =>
                      updateEditor({ description })
                    }
                    placeholder="Add notes about this option"
                    textAlignVertical="top"
                    value={editor.draft.description}
                  />
                ) : (
                  <Pressable
                    accessibilityLabel="Add option description"
                    className="min-h-11 flex-row items-center gap-2 self-start rounded-full bg-muted px-4"
                    haptic
                    onPress={() => setDescriptionVisible(true)}
                    transition
                  >
                    <Icon className="size-xs text-foreground" name="Plus" />
                    <Text className="text-sm font-bold text-foreground">
                      Add description
                    </Text>
                  </Pressable>
                )}

                {!editorExpanded ? (
                  <Pressable
                    accessibilityLabel="Show all option settings"
                    className="min-h-12 flex-row items-center justify-center gap-2 rounded-xl bg-muted"
                    haptic
                    onPress={expandEditor}
                    transition
                  >
                    <Text className="text-sm font-bold text-foreground">
                      More
                    </Text>
                    <Icon
                      className="size-xs text-muted-foreground"
                      name="ChevronRight"
                    />
                  </Pressable>
                ) : (
                  <View className="gap-5 border-t border-border pt-5">
                    {editorUnit ? (
                      <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
                        Full option combination settings
                      </Text>
                    ) : null}
                    <FormField
                      autoCapitalize="none"
                      autoCorrect={false}
                      inputMode="url"
                      keyboardType="url"
                      label="Image link"
                      leadingIcon="Globe"
                      onChangeText={(imageUrl) => updateEditor({ imageUrl })}
                      placeholder="https://example.com/image.jpg"
                      value={editor.draft.imageUrl}
                    />

                    {kind === "product" ? (
                      <>
                        <FormField
                          autoCapitalize="characters"
                          label="SKU"
                          onChangeText={(sku) => updateEditor({ sku })}
                          placeholder="Optional stock keeping code"
                          value={editor.draft.sku}
                        />
                        <FormField
                          label="Barcode"
                          onChangeText={(barcode) => updateEditor({ barcode })}
                          placeholder="Optional barcode number"
                          value={editor.draft.barcode}
                        />
                      </>
                    ) : (
                      <Pressable
                        accessibilityLabel="Toggle quote required"
                        accessibilityRole="switch"
                        accessibilityState={{
                          checked: editor.draft.quoteRequired,
                        }}
                        className="min-h-12 flex-row items-center justify-between gap-3 border-b border-border pb-4"
                        haptic
                        onPress={() =>
                          updateEditor({
                            quoteRequired: !editor.draft.quoteRequired,
                          })
                        }
                      >
                        <Text className="font-bold text-foreground">
                          Quote required
                        </Text>
                        <Text className="text-sm font-bold text-primary">
                          {editor.draft.quoteRequired ? "Yes" : "No"}
                        </Text>
                      </Pressable>
                    )}

                    {kind === "product" && units.length > 0 ? (
                      <View className="gap-4">
                        <View className="gap-1">
                          <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
                            Prices by unit
                          </Text>
                          <Text className="text-xs leading-5 text-muted-foreground">
                            Leave a unit price blank to use its default.
                          </Text>
                        </View>
                        {units.map((unit) => (
                          <MoneyField
                            currencyCode={currencyCode}
                            helper={
                              optionPricingOnly
                                ? "Set a separate price for this option and unit combination."
                                : unit.price.trim()
                                  ? `Defaults to ${currencyCode} ${unit.price}.`
                                  : "Uses this option's main price."
                            }
                            key={unit.id}
                            label={`${unit.name} price`}
                            onChangeValue={(value) =>
                              updateEditorUnitPrice(unit.id, value)
                            }
                            placeholder={
                              (!optionPricingOnly ? unit.price.trim() : "") ||
                              editor.draft.price.trim() ||
                              (!optionPricingOnly ? basePrice : "0.00")
                            }
                            value={editor.draft.unitPrices[unit.id] ?? ""}
                          />
                        ))}
                      </View>
                    ) : null}

                    {stores.length > 1 ? (
                      <View className="gap-3">
                        <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
                          Available at
                        </Text>
                        <View className="flex-row flex-wrap gap-2">
                          {stores.map((store) => {
                            const available = editor.draft.storeIds.includes(
                              store.id,
                            )
                            return (
                              <Pressable
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: available }}
                                className={
                                  available
                                    ? "min-h-10 justify-center rounded-full bg-primary px-4"
                                    : "min-h-10 justify-center rounded-full bg-muted px-4"
                                }
                                key={store.id}
                                onPress={() =>
                                  updateEditor({
                                    storeIds: available
                                      ? editor.draft.storeIds.filter(
                                          (storeId) => storeId !== store.id,
                                        )
                                      : [...editor.draft.storeIds, store.id],
                                  })
                                }
                              >
                                <Text
                                  className={
                                    available
                                      ? "text-xs font-bold text-primary-foreground"
                                      : "text-xs font-bold text-foreground"
                                  }
                                >
                                  {store.name}
                                </Text>
                              </Pressable>
                            )
                          })}
                        </View>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
            </BottomSheetKeyboardAwareScrollView>
          </View>
        ) : null}
      </Modal>
    </>
  )
}
