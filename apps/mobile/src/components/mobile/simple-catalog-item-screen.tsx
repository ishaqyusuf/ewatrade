import { ActionButton } from "@/components/mobile/action-button";
import { FormField } from "@/components/mobile/form-field";
import {
  KeyboardInlineComposer,
  type KeyboardInlineComposerPill,
} from "@/components/mobile/keyboard-inline-composer";
import { MoneyField } from "@/components/mobile/money-field";
import { StatusBanner } from "@/components/mobile/status-banner";
import { Icon, type IconKeys } from "@/components/ui/icon";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { useAuthContext } from "@/hooks/use-auth";
import { useTRPC } from "@/trpc/client";
import { buildCatalogVariantCombinations, majorToMinor } from "@ewatrade/utils";
import {
  EXACT_FACTOR_MAX_SCALE,
  EXACT_QUANTITY_MAX_SCALE,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

type CatalogItemKind = "product" | "service";

type SimpleCatalogItemScreenProps = {
  onComplete?: () => void;
};

type MobileOptionGroup = {
  id: string;
  name: string;
  values: Array<{ id: string; label: string }>;
};

type MobileVariantDraft = {
  barcode: string;
  enabled: boolean;
  price: string;
  quoteRequired: boolean;
  sku: string;
  storeIds: string[];
};

type MobileUnitDraft = {
  factor: string;
  id: string;
  name: string;
  price: string;
  stockBehavior: "alternate_transaction" | "packaged_stock";
  transactionScale: number;
};

function newOptionGroup(): MobileOptionGroup {
  return { id: Crypto.randomUUID(), name: "", values: [] };
}

function newUnit(): MobileUnitDraft {
  return {
    factor: "",
    id: Crypto.randomUUID(),
    name: "",
    price: "",
    stockBehavior: "alternate_transaction",
    transactionScale: 0,
  };
}

function unitKey(index: number) {
  return `unit-${index + 2}`;
}

function KindChoice({
  description,
  icon,
  label,
  onPress,
}: {
  description: string;
  icon: IconKeys;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={`Create ${label}`}
      accessibilityRole="button"
      className="flex-1 gap-4 rounded-3xl border border-border bg-card p-5 active:bg-accent"
      haptic
      onPress={onPress}
      transition
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Icon className="size-base text-primary" name={icon} />
      </View>
      <View className="gap-1.5">
        <Text className="text-lg font-extrabold text-foreground">{label}</Text>
        <Text className="text-sm leading-5 text-muted-foreground">
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

function OptionalFieldButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="min-h-11 flex-row items-center gap-2 self-start rounded-full bg-muted px-4 active:bg-accent"
      haptic
      onPress={onPress}
      transition
    >
      <Icon className="size-xs text-foreground" name="Plus" />
      <Text className="text-sm font-bold text-foreground">{label}</Text>
    </Pressable>
  );
}

function ToggleRow({
  enabled,
  label,
  onPress,
}: {
  enabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      className="min-h-11 flex-row items-center justify-between gap-3"
      haptic
      onPress={onPress}
    >
      <Text className="min-w-0 flex-1 font-bold text-foreground">{label}</Text>
      <View
        className={
          enabled
            ? "h-7 w-12 items-end justify-center rounded-full bg-primary px-1"
            : "h-7 w-12 items-start justify-center rounded-full bg-muted px-1"
        }
      >
        <View className="h-5 w-5 rounded-full bg-background" />
      </View>
    </Pressable>
  );
}

function getExactOpeningStock(value: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;

  return parseExactDecimal(normalized, {
    maxScale: EXACT_QUANTITY_MAX_SCALE,
  });
}

export function SimpleCatalogItemScreen({
  onComplete,
}: SimpleCatalogItemScreenProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { profile } = useAuthContext();
  const clientOperationIdRef = useRef(Crypto.randomUUID());
  const [kind, setKind] = useState<CatalogItemKind | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [unitName, setUnitName] = useState("");
  const [openingStock, setOpeningStock] = useState("");
  const [description, setDescription] = useState("");
  const [showOpeningStock, setShowOpeningStock] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showUnits, setShowUnits] = useState(false);
  const [trackServiceWork, setTrackServiceWork] = useState(false);
  const [serviceAuthorization, setServiceAuthorization] = useState<
    "after_required_payment" | "manual_release" | "on_order_confirmation"
  >("on_order_confirmation");
  const [serviceGuidance, setServiceGuidance] = useState("");
  const [optionGroups, setOptionGroups] = useState<MobileOptionGroup[]>([
    newOptionGroup(),
  ]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [composerText, setComposerText] = useState("");
  const [variantDrafts, setVariantDrafts] = useState<
    Record<string, MobileVariantDraft>
  >({});
  const [additionalUnits, setAdditionalUnits] = useState<MobileUnitDraft[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const currencyCode = profile?.currencyCode ?? "NGN";
  const storesQuery = useQuery(trpc.tenant.stores.queryOptions());
  const stores = storesQuery.data ?? [];
  const normalizedOptionGroups = useMemo(
    () =>
      optionGroups.map((group, groupIndex) => ({
        key: `group-${groupIndex + 1}`,
        name: group.name.trim(),
        values: group.values.map((value, valueIndex) => ({
          key: `value-${valueIndex + 1}`,
          label: value.label,
        })),
      })),
    [optionGroups],
  );
  const combinations = useMemo(
    () => buildCatalogVariantCombinations(normalizedOptionGroups),
    [normalizedOptionGroups],
  );
  const activeGroup = optionGroups.find((group) => group.id === activeGroupId);
  const composerPills: KeyboardInlineComposerPill[] =
    activeGroup?.values.map((value) => ({
      id: value.id,
      label: value.label,
      removable: true,
    })) ?? [];
  const onCreated = async () => {
    setSubmitError(null);
    await queryClient.invalidateQueries(trpc.catalog.listItems.queryFilter());
    onComplete?.();
  };
  const createItemMutation = useMutation(
    trpc.catalog.createSimpleItem.mutationOptions({
      onError: (error) => setSubmitError(error.message),
      onSuccess: onCreated,
    }),
  );
  const createAdvancedMutation = useMutation(
    trpc.catalog.createItem.mutationOptions({
      onError: (error) => setSubmitError(error.message),
      onSuccess: onCreated,
    }),
  );

  const defaultStoreId = stores[0]?.id;

  const variantDraft = (key: string): MobileVariantDraft =>
    variantDrafts[key] ?? {
      barcode: "",
      enabled: true,
      price: "",
      quoteRequired: false,
      sku: "",
      storeIds: defaultStoreId ? [defaultStoreId] : [],
    };

  const updateVariantDraft = (
    key: string,
    update: Partial<MobileVariantDraft>,
  ) => {
    setVariantDrafts((current) => ({
      ...current,
      [key]: { ...variantDraft(key), ...update },
    }));
  };

  const submitAdvanced = (
    itemKind: CatalogItemKind,
    trimmedName: string,
    priceMinor: number,
  ) => {
    const activeCombinations = showAdvanced
      ? combinations
      : [{ key: "default", name: trimmedName, selections: [] }];
    if (
      showAdvanced &&
      (normalizedOptionGroups.some(
        (group) => !group.name || group.values.length === 0,
      ) ||
        activeCombinations.length === 0)
    ) {
      setSubmitError("Add a name and at least one value for every option.");
      return;
    }

    const firstEnabledIndex = activeCombinations.findIndex(
      (combination) => variantDraft(combination.key).enabled,
    );
    if (firstEnabledIndex < 0) {
      setSubmitError("Keep at least one variant enabled.");
      return;
    }

    const invalidPrice = activeCombinations.find((combination) => {
      const override = variantDraft(combination.key).price.trim();
      return override ? majorToMinor(override) === null : false;
    });
    if (invalidPrice) {
      setSubmitError(`Enter a valid price for ${invalidPrice.name}.`);
      return;
    }

    try {
      for (const unit of additionalUnits) {
        if (!unit.name.trim())
          throw new Error("Enter a name for every selling unit.");
        parseExactDecimal(unit.factor, {
          allowZero: false,
          maxScale: EXACT_FACTOR_MAX_SCALE,
        });
        if (unit.price.trim() && majorToMinor(unit.price) === null) {
          throw new Error(`Enter a valid price for ${unit.name}.`);
        }
      }
    } catch (unitError) {
      setSubmitError(
        unitError instanceof Error
          ? unitError.message
          : "Review the selling units.",
      );
      return;
    }

    const rows = activeCombinations.map((combination, index) => {
      const draft = variantDraft(combination.key);
      const storeAvailability = stores.map((store) => ({
        isAvailable: draft.storeIds.includes(store.id),
        storeId: store.id,
      }));
      return {
        commonOffering: {
          enabled: draft.enabled,
          key: `offering-${index + 1}`,
          name: combination.name,
          storeAvailability:
            storeAvailability.length > 0 ? storeAvailability : undefined,
        },
        draft,
        enabled: draft.enabled,
        isDefault: index === firstEnabledIndex,
        key: combination.key,
        name: combination.name,
        priceMinor: draft.price.trim()
          ? (majorToMinor(draft.price) ?? priceMinor)
          : priceMinor,
        selections: combination.selections,
      };
    });

    if (itemKind === "product") {
      const canonicalUnitName = unitName.trim();
      if (!canonicalUnitName) {
        setSubmitError("Enter the unit you count this Product in.");
        return;
      }

      createAdvancedMutation.mutate({
        clientOperationId: clientOperationIdRef.current,
        description: description.trim() || undefined,
        kind: "product",
        name: trimmedName,
        openingStockQuantity: showOpeningStock
          ? getExactOpeningStock(openingStock)
          : undefined,
        optionGroups: showAdvanced ? normalizedOptionGroups : undefined,
        unitConfiguration: {
          canonicalBalanceScale: 0,
          units: [
            {
              factor: "1",
              key: "canonical",
              name: canonicalUnitName,
              stockBehavior: "canonical_shared",
              transactionScale: 0,
            },
            ...additionalUnits.map((unit, unitIndex) => ({
              factor: unit.factor.trim(),
              key: unitKey(unitIndex),
              name: unit.name.trim(),
              stockBehavior: unit.stockBehavior,
              transactionScale: unit.transactionScale,
            })),
          ],
        },
        variants: rows.map(
          (
            { commonOffering, draft, priceMinor: rowPrice, ...variant },
            variantIndex,
          ) => ({
            ...variant,
            offerings: [
              {
                ...commonOffering,
                barcode: draft.barcode.trim() || undefined,
                fixedPriceMinor: rowPrice,
                inventoryUnitKey: "canonical",
                pricingPolicy: "fixed" as const,
                sku: draft.sku.trim() || undefined,
              },
              ...additionalUnits.map((unit, unitIndex) => ({
                ...commonOffering,
                barcode: undefined,
                fixedPriceMinor: unit.price.trim()
                  ? (majorToMinor(unit.price) ?? rowPrice)
                  : rowPrice,
                inventoryUnitKey: unitKey(unitIndex),
                key: `offering-${variantIndex + 1}-${unitIndex + 2}`,
                name: `${variant.name} · ${unit.name.trim()}`,
                pricingPolicy: "fixed" as const,
                sku: undefined,
              })),
            ],
          }),
        ),
      });
      return;
    }

    createAdvancedMutation.mutate({
      clientOperationId: clientOperationIdRef.current,
      description: description.trim() || undefined,
      kind: "service",
      name: trimmedName,
      optionGroups: normalizedOptionGroups,
      variants: rows.map(
        ({ commonOffering, draft, priceMinor: rowPrice, ...variant }) => ({
          ...variant,
          offerings: [
            draft.quoteRequired
              ? {
                  ...commonOffering,
                  authorizationPolicy: serviceAuthorization,
                  guidance: serviceGuidance.trim() || undefined,
                  pricingPolicy: "quote_required" as const,
                  workPolicy: trackServiceWork
                    ? ("tracked" as const)
                    : ("charge_only" as const),
                }
              : {
                  ...commonOffering,
                  authorizationPolicy: serviceAuthorization,
                  fixedPriceMinor: rowPrice,
                  guidance: serviceGuidance.trim() || undefined,
                  pricingPolicy: "fixed" as const,
                  workPolicy: trackServiceWork
                    ? ("tracked" as const)
                    : ("charge_only" as const),
                },
          ],
        }),
      ),
    });
  };

  const submit = () => {
    if (!kind) return;

    const trimmedName = name.trim();
    const priceMinor = majorToMinor(price);

    if (!trimmedName) {
      setSubmitError("Enter an item name.");
      return;
    }
    if (priceMinor === null) {
      setSubmitError("Enter a valid price.");
      return;
    }

    try {
      if (showAdvanced || (kind === "product" && showUnits)) {
        submitAdvanced(kind, trimmedName, priceMinor);
        return;
      }

      if (kind === "product") {
        const canonicalUnitName = unitName.trim();
        if (!canonicalUnitName) {
          setSubmitError("Enter the unit you count this Product in.");
          return;
        }

        createItemMutation.mutate({
          canonicalUnitName,
          clientOperationId: clientOperationIdRef.current,
          description: description.trim() || undefined,
          kind,
          name: trimmedName,
          openingStockQuantity: showOpeningStock
            ? getExactOpeningStock(openingStock)
            : undefined,
          priceMinor,
        });
        return;
      }

      createItemMutation.mutate({
        authorizationPolicy: serviceAuthorization,
        clientOperationId: clientOperationIdRef.current,
        description: description.trim() || undefined,
        guidance: serviceGuidance.trim() || undefined,
        kind,
        name: trimmedName,
        priceMinor,
        workPolicy: trackServiceWork ? "tracked" : "charge_only",
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Review the item details.",
      );
    }
  };

  const addComposerValue = () => {
    const label = composerText.trim();
    if (!label || !activeGroupId) return;
    setOptionGroups((current) =>
      current.map((group) =>
        group.id === activeGroupId &&
        !group.values.some(
          (value) => value.label.toLowerCase() === label.toLowerCase(),
        )
          ? {
              ...group,
              values: [...group.values, { id: Crypto.randomUUID(), label }],
            }
          : group,
      ),
    );
    setComposerText("");
  };

  const removeComposerValue = (pill: KeyboardInlineComposerPill) => {
    if (!activeGroupId) return;
    setOptionGroups((current) =>
      current.map((group) =>
        group.id === activeGroupId
          ? {
              ...group,
              values: group.values.filter((value) => value.id !== pill.id),
            }
          : group,
      ),
    );
  };

  if (!kind) {
    return (
      <View className="flex-1 px-4 pt-2">
        <View className="gap-2 pb-6">
          <Text className="text-xl font-extrabold text-foreground">
            What are you adding?
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            Products can track stock. Services do not affect inventory.
          </Text>
        </View>
        <View className="flex-row gap-3">
          <KindChoice
            description="An item you keep and sell."
            icon="Warehouse"
            label="Product"
            onPress={() => setKind("product")}
          />
          <KindChoice
            description="Work you price and deliver."
            icon="Wrench"
            label="Service"
            onPress={() => setKind("service")}
          />
        </View>
      </View>
    );
  }

  const isSaving =
    createItemMutation.isPending || createAdvancedMutation.isPending;

  return (
    <View className="flex-1">
      <KeyboardAwareScrollView
        bottomOffset={160}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: activeGroupId ? 240 : 144 }}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-4 pt-2">
          <Pressable
            accessibilityLabel="Change item type"
            accessibilityRole="button"
            className="min-h-11 flex-row items-center gap-2 self-start rounded-full bg-primary/10 px-4 active:bg-primary/20"
            haptic
            onPress={() => {
              setKind(null);
              setSubmitError(null);
              setActiveGroupId(null);
            }}
            transition
          >
            <Icon
              className="size-xs text-primary"
              name={kind === "product" ? "Warehouse" : "Wrench"}
            />
            <Text className="text-sm font-bold text-primary">
              {kind === "product" ? "Product" : "Service"}
            </Text>
          </Pressable>

          {submitError ? (
            <StatusBanner
              icon="AlertCircle"
              message={submitError}
              tone="destructive"
            />
          ) : null}

          <FormField
            autoCapitalize="words"
            autoFocus
            label="Name"
            onChangeText={setName}
            placeholder={
              kind === "product" ? "Enter product name" : "Enter service name"
            }
            returnKeyType="next"
            value={name}
          />
          <MoneyField
            currencyCode={currencyCode}
            label="Price"
            onChangeValue={setPrice}
            placeholder="0.00"
            value={price}
          />

          {kind === "product" ? (
            <FormField
              autoCapitalize="words"
              label="Counted in"
              onChangeText={setUnitName}
              placeholder="Enter counted unit"
              value={unitName}
            />
          ) : null}

          {kind === "product" && showOpeningStock ? (
            <FormField
              keyboardType="decimal-pad"
              label="Opening stock"
              onChangeText={setOpeningStock}
              placeholder="0"
              value={openingStock}
            />
          ) : null}

          {showDescription ? (
            <FormField
              label="Description"
              multiline
              onChangeText={setDescription}
              placeholder="Optional notes"
              textAlignVertical="top"
              value={description}
            />
          ) : null}

          <View className="flex-row flex-wrap gap-2">
            {kind === "product" && !showOpeningStock ? (
              <OptionalFieldButton
                label="Add opening stock"
                onPress={() => setShowOpeningStock(true)}
              />
            ) : null}
            {!showDescription ? (
              <OptionalFieldButton
                label="Add description"
                onPress={() => setShowDescription(true)}
              />
            ) : null}
            {!showAdvanced ? (
              <OptionalFieldButton
                label="Add options"
                onPress={() => setShowAdvanced(true)}
              />
            ) : null}
            {kind === "product" && !showUnits ? (
              <OptionalFieldButton
                label="Add selling units"
                onPress={() => setShowUnits(true)}
              />
            ) : null}
            {kind === "service" && !trackServiceWork ? (
              <OptionalFieldButton
                label="Track work after order"
                onPress={() => setTrackServiceWork(true)}
              />
            ) : null}
          </View>

          {kind === "service" && trackServiceWork ? (
            <View className="gap-4 rounded-3xl border border-border bg-muted/30 p-4">
              <ToggleRow
                enabled
                label="Create tracked work"
                onPress={() => setTrackServiceWork(false)}
              />
              <View className="gap-2">
                <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
                  Work can start
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {(
                    [
                      ["on_order_confirmation", "On confirmation"],
                      ["after_required_payment", "After payment"],
                      ["manual_release", "Manager release"],
                    ] as const
                  ).map(([value, text]) => (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{
                        selected: serviceAuthorization === value,
                      }}
                      className={
                        serviceAuthorization === value
                          ? "min-h-10 justify-center rounded-full bg-primary px-4"
                          : "min-h-10 justify-center rounded-full bg-muted px-4"
                      }
                      key={value}
                      onPress={() => setServiceAuthorization(value)}
                    >
                      <Text
                        className={
                          serviceAuthorization === value
                            ? "text-xs font-bold text-primary-foreground"
                            : "text-xs font-bold text-foreground"
                        }
                      >
                        {text}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <FormField
                label="Customer guidance"
                multiline
                onChangeText={setServiceGuidance}
                placeholder="Optional information shown with this service"
                value={serviceGuidance}
              />
            </View>
          ) : null}

          {showAdvanced ? (
            <View className="gap-4 rounded-3xl border border-border bg-muted/30 p-4">
              <View className="flex-row items-center justify-between gap-3">
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="font-extrabold text-foreground">
                    Options
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    Add choices such as Colour and Size.
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Remove options"
                  className="min-h-11 justify-center px-2"
                  onPress={() => {
                    setShowAdvanced(false);
                    setActiveGroupId(null);
                    setVariantDrafts({});
                  }}
                >
                  <Text className="text-sm font-bold text-primary">Remove</Text>
                </Pressable>
              </View>

              {optionGroups.map((group, index) => (
                <View
                  className="gap-3 rounded-2xl border border-border bg-background p-3"
                  key={group.id}
                >
                  <FormField
                    autoCapitalize="words"
                    label="Option name"
                    onChangeText={(value) =>
                      setOptionGroups((current) =>
                        current.map((candidate) =>
                          candidate.id === group.id
                            ? { ...candidate, name: value }
                            : candidate,
                        ),
                      )
                    }
                    placeholder="Enter option name"
                    value={group.name}
                  />
                  <Pressable
                    accessibilityLabel={`Add values to ${group.name || `option ${index + 1}`}`}
                    className="min-h-11 flex-row items-center justify-center gap-2 rounded-xl bg-muted px-4"
                    haptic
                    onPress={() => {
                      setActiveGroupId(group.id);
                      setComposerText("");
                    }}
                  >
                    <Icon className="size-xs text-foreground" name="Plus" />
                    <Text className="text-sm font-bold text-foreground">
                      {group.values.length > 0
                        ? `${group.values.length} values · Edit`
                        : "Add values"}
                    </Text>
                  </Pressable>
                  {group.values.length > 0 ? (
                    <Text className="text-xs leading-5 text-muted-foreground">
                      {group.values.map((value) => value.label).join(" · ")}
                    </Text>
                  ) : null}
                  {optionGroups.length > 1 ? (
                    <Pressable
                      accessibilityLabel={`Remove option ${index + 1}`}
                      className="min-h-11 items-center justify-center"
                      onPress={() =>
                        setOptionGroups((current) =>
                          current.filter(
                            (candidate) => candidate.id !== group.id,
                          ),
                        )
                      }
                    >
                      <Text className="text-sm font-bold text-destructive">
                        Remove option
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}

              <ActionButton
                onPress={() =>
                  setOptionGroups((current) => [...current, newOptionGroup()])
                }
                variant="outline"
              >
                Add another option
              </ActionButton>

              {combinations.map((combination) => {
                const draft = variantDraft(combination.key);
                return (
                  <View
                    className="gap-4 rounded-2xl border border-border bg-background p-4"
                    key={combination.key}
                  >
                    <ToggleRow
                      enabled={draft.enabled}
                      label={combination.name}
                      onPress={() =>
                        updateVariantDraft(combination.key, {
                          enabled: !draft.enabled,
                        })
                      }
                    />
                    <MoneyField
                      currencyCode={currencyCode}
                      label="Price override"
                      onChangeValue={(value) =>
                        updateVariantDraft(combination.key, { price: value })
                      }
                      placeholder={price || "Use item price"}
                      value={draft.price}
                    />
                    {kind === "service" ? (
                      <ToggleRow
                        enabled={draft.quoteRequired}
                        label="Quote required"
                        onPress={() =>
                          updateVariantDraft(combination.key, {
                            quoteRequired: !draft.quoteRequired,
                          })
                        }
                      />
                    ) : (
                      <>
                        <FormField
                          autoCapitalize="characters"
                          label="SKU"
                          onChangeText={(value) =>
                            updateVariantDraft(combination.key, { sku: value })
                          }
                          value={draft.sku}
                        />
                        <FormField
                          label="Barcode"
                          onChangeText={(value) =>
                            updateVariantDraft(combination.key, {
                              barcode: value,
                            })
                          }
                          value={draft.barcode}
                        />
                      </>
                    )}

                    {stores.length > 1 ? (
                      <View className="gap-2">
                        <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
                          Available at
                        </Text>
                        <View className="flex-row flex-wrap gap-2">
                          {stores.map((store) => {
                            const available = draft.storeIds.includes(store.id);
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
                                  updateVariantDraft(combination.key, {
                                    storeIds: available
                                      ? draft.storeIds.filter(
                                          (storeId) => storeId !== store.id,
                                        )
                                      : [...draft.storeIds, store.id],
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
                            );
                          })}
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          {kind === "product" && showUnits ? (
            <View className="gap-4 rounded-3xl border border-border bg-muted/30 p-4">
              <View className="flex-row items-start justify-between gap-3">
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="font-extrabold text-foreground">
                    Selling units
                  </Text>
                  <Text className="text-xs leading-5 text-muted-foreground">
                    A factor means 1 configured unit equals that many counted
                    units.
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Remove selling units"
                  className="min-h-11 justify-center px-2"
                  onPress={() => {
                    setShowUnits(false);
                    setAdditionalUnits([]);
                  }}
                >
                  <Text className="text-sm font-bold text-primary">Remove</Text>
                </Pressable>
              </View>
              {additionalUnits.map((unit) => (
                <View
                  className="gap-4 rounded-2xl border border-border bg-background p-4"
                  key={unit.id}
                >
                  <FormField
                    autoCapitalize="words"
                    label="Unit name"
                    onChangeText={(value) =>
                      setAdditionalUnits((current) =>
                        current.map((candidate) =>
                          candidate.id === unit.id
                            ? { ...candidate, name: value }
                            : candidate,
                        ),
                      )
                    }
                    placeholder="Enter unit name"
                    value={unit.name}
                  />
                  <FormField
                    keyboardType="decimal-pad"
                    label="1 unit equals counted units"
                    onChangeText={(value) =>
                      setAdditionalUnits((current) =>
                        current.map((candidate) =>
                          candidate.id === unit.id
                            ? { ...candidate, factor: value }
                            : candidate,
                        ),
                      )
                    }
                    placeholder="Enter conversion factor"
                    value={unit.factor}
                  />
                  <MoneyField
                    currencyCode={currencyCode}
                    label="Selling price"
                    onChangeValue={(value) =>
                      setAdditionalUnits((current) =>
                        current.map((candidate) =>
                          candidate.id === unit.id
                            ? { ...candidate, price: value }
                            : candidate,
                        ),
                      )
                    }
                    placeholder={price || "Use item price"}
                    value={unit.price}
                  />
                  <View className="gap-2">
                    <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
                      Stock source
                    </Text>
                    <View className="flex-row gap-2">
                      {(
                        [
                          ["alternate_transaction", "Shared stock"],
                          ["packaged_stock", "Prepared stock"],
                        ] as const
                      ).map(([value, label]) => (
                        <Pressable
                          accessibilityRole="radio"
                          accessibilityState={{
                            selected: unit.stockBehavior === value,
                          }}
                          className={
                            unit.stockBehavior === value
                              ? "min-h-10 flex-1 items-center justify-center rounded-full bg-primary px-3"
                              : "min-h-10 flex-1 items-center justify-center rounded-full bg-muted px-3"
                          }
                          key={value}
                          onPress={() =>
                            setAdditionalUnits((current) =>
                              current.map((candidate) =>
                                candidate.id === unit.id
                                  ? { ...candidate, stockBehavior: value }
                                  : candidate,
                              ),
                            )
                          }
                        >
                          <Text
                            className={
                              unit.stockBehavior === value
                                ? "text-xs font-bold text-primary-foreground"
                                : "text-xs font-bold text-foreground"
                            }
                          >
                            {label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <View className="gap-2">
                    <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
                      Decimal places
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                      {[0, 1, 2, 3, 4, 5, 6].map((scale) => (
                        <Pressable
                          accessibilityRole="radio"
                          accessibilityState={{
                            selected: unit.transactionScale === scale,
                          }}
                          className={
                            unit.transactionScale === scale
                              ? "h-10 w-10 items-center justify-center rounded-full bg-primary"
                              : "h-10 w-10 items-center justify-center rounded-full bg-muted"
                          }
                          key={scale}
                          onPress={() =>
                            setAdditionalUnits((current) =>
                              current.map((candidate) =>
                                candidate.id === unit.id
                                  ? { ...candidate, transactionScale: scale }
                                  : candidate,
                              ),
                            )
                          }
                        >
                          <Text
                            className={
                              unit.transactionScale === scale
                                ? "text-xs font-bold text-primary-foreground"
                                : "text-xs font-bold text-foreground"
                            }
                          >
                            {scale}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <ActionButton
                    onPress={() =>
                      setAdditionalUnits((current) =>
                        current.filter((candidate) => candidate.id !== unit.id),
                      )
                    }
                    variant="outline"
                  >
                    Remove unit
                  </ActionButton>
                </View>
              ))}
              <ActionButton
                onPress={() =>
                  setAdditionalUnits((current) => [...current, newUnit()])
                }
                variant="outline"
              >
                Add selling unit
              </ActionButton>
            </View>
          ) : null}

          <ActionButton
            isLoading={isSaving}
            loadingLabel="Saving"
            onPress={submit}
          >
            Save item
          </ActionButton>
        </View>
      </KeyboardAwareScrollView>

      <KeyboardInlineComposer
        dismissKeyboardOnSubmit={false}
        onChangeText={setComposerText}
        onPillPress={() => undefined}
        onRemovePill={removeComposerValue}
        onSubmit={addComposerValue}
        pills={composerPills}
        placeholder={`Add ${activeGroup?.name || "option"} value`}
        submitAccessibilityLabel="Add option value"
        value={composerText}
        visible={!!activeGroupId}
      />
    </View>
  );
}
