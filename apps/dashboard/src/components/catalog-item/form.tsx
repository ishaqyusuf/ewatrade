"use client"

import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { useTRPC } from "@/trpc/client"
import { cn } from "@/utils"
import { Button, CurrencyInput } from "@ewatrade/ui"
import { buildCatalogVariantCombinations } from "@ewatrade/utils"
import {
  EXACT_QUANTITY_MAX_SCALE,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import { Package01Icon, ToolsIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { FormEvent, InputHTMLAttributes, ReactNode } from "react"
import { useMemo, useRef, useState } from "react"

import { type SimpleCatalogItemKind, useCatalogItemForm } from "./form-context"

type CatalogItemFormProps = {
  currencyCode: string
  onCreated: (name: string) => void
  storeId: string
}

function Field({
  children,
  htmlFor,
  label,
}: {
  children: ReactNode
  htmlFor: string
  label: string
}) {
  return (
    <label className="grid gap-1.5 text-sm" htmlFor={htmlFor}>
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20",
        props.className,
      )}
    />
  )
}

function parsePrice(value: string) {
  const normalized = value.replaceAll(",", "").trim()
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null
  const [whole = "0", fraction = ""] = normalized.split(".")
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null
}

function createClientOperationId() {
  return globalThis.crypto.randomUUID()
}

type AdvancedOptionGroup = {
  id: string
  name: string
  values: string
}

type AdvancedVariantDraft = {
  barcode: string
  enabled: boolean
  price: string
  quoteRequired: boolean
  sku: string
  storeIds: string[]
}

type AdvancedUnitDraft = {
  factor: string
  id: string
  name: string
  price: string
  stockBehavior: "alternate_transaction" | "packaged_stock"
  transactionScale: number
}

function newOptionGroup(): AdvancedOptionGroup {
  return { id: globalThis.crypto.randomUUID(), name: "", values: "" }
}

function newUnit(): AdvancedUnitDraft {
  return {
    factor: "",
    id: globalThis.crypto.randomUUID(),
    name: "",
    price: "",
    stockBehavior: "alternate_transaction",
    transactionScale: 0,
  }
}

function unitKey(index: number) {
  return `unit-${index + 2}`
}

export function CatalogItemForm({
  currencyCode,
  onCreated,
  storeId,
}: CatalogItemFormProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { setCatalogItemMode } = useCatalogItemParams()
  const {
    form,
    setForm,
    setShowDescription,
    setShowOpeningStock,
    showDescription,
    showOpeningStock,
  } = useCatalogItemForm()
  const clientOperationId = useRef(createClientOperationId())
  const [error, setError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showUnits, setShowUnits] = useState(false)
  const [trackServiceWork, setTrackServiceWork] = useState(false)
  const [serviceAuthorization, setServiceAuthorization] = useState<
    "after_required_payment" | "manual_release" | "on_order_confirmation"
  >("on_order_confirmation")
  const [serviceQuantityScale, setServiceQuantityScale] = useState(0)
  const [serviceGuidance, setServiceGuidance] = useState("")
  const [optionGroups, setOptionGroups] = useState<AdvancedOptionGroup[]>([
    newOptionGroup(),
  ])
  const [variantDrafts, setVariantDrafts] = useState<
    Record<string, AdvancedVariantDraft>
  >({})
  const [additionalUnits, setAdditionalUnits] = useState<AdvancedUnitDraft[]>(
    [],
  )
  const storesQuery = useQuery(trpc.tenant.stores.queryOptions())
  const stores = storesQuery.data ?? []
  const normalizedOptionGroups = useMemo(
    () =>
      optionGroups.map((group, groupIndex) => ({
        key: `group-${groupIndex + 1}`,
        name: group.name.trim(),
        values: group.values
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .map((label, valueIndex) => ({
            key: `value-${valueIndex + 1}`,
            label,
          })),
      })),
    [optionGroups],
  )
  const combinations = useMemo(
    () => buildCatalogVariantCombinations(normalizedOptionGroups),
    [normalizedOptionGroups],
  )
  const onCreatedMutation = (item: { name: string }) => {
    queryClient.invalidateQueries({
      queryKey: trpc.catalog.listItems.queryKey(),
    })
    onCreated(item.name)
    setCatalogItemMode(null)
  }
  const createMutation = useMutation(
    trpc.catalog.createSimpleItem.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: onCreatedMutation,
    }),
  )
  const createAdvancedMutation = useMutation(
    trpc.catalog.createItem.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: onCreatedMutation,
    }),
  )

  function variantDraft(key: string): AdvancedVariantDraft {
    return (
      variantDrafts[key] ?? {
        barcode: "",
        enabled: true,
        price: "",
        quoteRequired: false,
        sku: "",
        storeIds: [storeId],
      }
    )
  }

  function updateVariantDraft(
    key: string,
    update: Partial<AdvancedVariantDraft>,
  ) {
    setVariantDrafts((current) => ({
      ...current,
      [key]: { ...variantDraft(key), ...update },
    }))
  }

  function chooseKind(kind: SimpleCatalogItemKind) {
    setError(null)
    setForm((current) => ({ ...current, kind }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!form.kind || !form.name.trim()) {
      setError("Enter an item name.")
      return
    }

    const priceMinor = parsePrice(form.price)
    if (priceMinor === null) {
      setError("Enter a valid price.")
      return
    }

    if (showAdvanced || (form.kind === "product" && showUnits)) {
      const activeCombinations = showAdvanced
        ? combinations
        : [{ key: "default", name: form.name.trim(), selections: [] }]
      if (
        showAdvanced &&
        (normalizedOptionGroups.some(
          (group) => !group.name || group.values.length === 0,
        ) ||
          activeCombinations.length === 0)
      ) {
        setError("Add a name and at least one value for every option.")
        return
      }
      const firstEnabledIndex = activeCombinations.findIndex(
        (combination) => variantDraft(combination.key).enabled,
      )
      if (firstEnabledIndex < 0) {
        setError("Keep at least one variant enabled.")
        return
      }

      let openingStockQuantity: string | undefined
      if (
        form.kind === "product" &&
        showOpeningStock &&
        form.openingStockQuantity.trim()
      ) {
        try {
          openingStockQuantity = parseExactDecimal(form.openingStockQuantity, {
            maxScale: EXACT_QUANTITY_MAX_SCALE,
          })
        } catch (quantityError) {
          setError(
            quantityError instanceof Error
              ? quantityError.message
              : "Enter a valid opening stock quantity.",
          )
          return
        }
      }

      const invalidPriceCombination = activeCombinations.find((combination) => {
        const override = variantDraft(combination.key).price.trim()
        return override ? parsePrice(override) === null : false
      })
      if (invalidPriceCombination) {
        setError(`Enter a valid price for ${invalidPriceCombination.name}.`)
        return
      }

      const invalidUnit = additionalUnits.find(
        (unit) =>
          !unit.name.trim() ||
          !/^\d+(?:\.\d+)?$/.test(unit.factor.trim()) ||
          Number(unit.factor) <= 0 ||
          (unit.price.trim() ? parsePrice(unit.price) === null : false),
      )
      if (invalidUnit) {
        setError(
          "Every additional unit needs a name, positive exact factor, and valid optional price.",
        )
        return
      }

      const variantRows = activeCombinations.map((combination, index) => {
        const draft = variantDraft(combination.key)
        const variantPriceMinor = draft.price.trim()
          ? (parsePrice(draft.price) ?? priceMinor)
          : priceMinor
        const storeAvailability = stores.map((candidate) => ({
          isAvailable: draft.storeIds.includes(candidate.id),
          storeId: candidate.id,
        }))
        const commonOffering = {
          enabled: draft.enabled,
          key: `offering-${index + 1}`,
          name: combination.name,
          storeAvailability:
            storeAvailability.length > 0
              ? storeAvailability
              : [{ isAvailable: true, storeId }],
        }

        return {
          commonOffering,
          draft,
          enabled: draft.enabled,
          isDefault: index === firstEnabledIndex,
          key: combination.key,
          name: combination.name,
          selections: combination.selections,
          variantPriceMinor,
        }
      })

      try {
        if (form.kind === "product") {
          if (!form.unitName.trim()) {
            setError("Enter the unit this Product is counted in.")
            return
          }
          createAdvancedMutation.mutate({
            clientOperationId: clientOperationId.current,
            description: form.description.trim() || undefined,
            kind: "product",
            name: form.name.trim(),
            openingStockQuantity,
            optionGroups: showAdvanced ? normalizedOptionGroups : undefined,
            storeId,
            unitConfiguration: {
              canonicalBalanceScale: 0,
              units: [
                {
                  factor: "1",
                  key: "canonical",
                  name: form.unitName.trim(),
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
            variants: variantRows.map(
              (
                { commonOffering, draft, variantPriceMinor, ...variant },
                variantIndex,
              ) => ({
                ...variant,
                offerings: [
                  {
                    ...commonOffering,
                    barcode: draft.barcode.trim() || undefined,
                    fixedPriceMinor: variantPriceMinor,
                    inventoryUnitKey: "canonical",
                    pricingPolicy: "fixed" as const,
                    sku: draft.sku.trim() || undefined,
                  },
                  ...additionalUnits.map((unit, unitIndex) => ({
                    ...commonOffering,
                    barcode: undefined,
                    fixedPriceMinor: unit.price.trim()
                      ? (parsePrice(unit.price) ?? variantPriceMinor)
                      : variantPriceMinor,
                    inventoryUnitKey: unitKey(unitIndex),
                    key: `offering-${variantIndex + 1}-${unitIndex + 2}`,
                    name: `${variant.name} · ${unit.name.trim()}`,
                    pricingPolicy: "fixed" as const,
                    sku: undefined,
                  })),
                ],
              }),
            ),
          })
        } else {
          createAdvancedMutation.mutate({
            clientOperationId: clientOperationId.current,
            description: form.description.trim() || undefined,
            kind: "service",
            name: form.name.trim(),
            optionGroups: normalizedOptionGroups,
            storeId,
            variants: variantRows.map(
              ({ commonOffering, draft, variantPriceMinor, ...variant }) => ({
                ...variant,
                offerings: [
                  draft.quoteRequired
                    ? {
                        ...commonOffering,
                        authorizationPolicy: serviceAuthorization,
                        guidance: serviceGuidance.trim() || undefined,
                        pricingPolicy: "quote_required" as const,
                        quantityScale: serviceQuantityScale,
                        workPolicy: trackServiceWork
                          ? ("tracked" as const)
                          : ("charge_only" as const),
                      }
                    : {
                        ...commonOffering,
                        authorizationPolicy: serviceAuthorization,
                        fixedPriceMinor: variantPriceMinor,
                        guidance: serviceGuidance.trim() || undefined,
                        pricingPolicy: "fixed" as const,
                        quantityScale: serviceQuantityScale,
                        workPolicy: trackServiceWork
                          ? ("tracked" as const)
                          : ("charge_only" as const),
                      },
                ],
              }),
            ),
          })
        }
      } catch (advancedError) {
        setError(
          advancedError instanceof Error
            ? advancedError.message
            : "Review the advanced setup.",
        )
      }
      return
    }

    if (form.kind === "service") {
      createMutation.mutate({
        clientOperationId: clientOperationId.current,
        description: form.description.trim() || undefined,
        kind: "service",
        name: form.name.trim(),
        priceMinor,
        authorizationPolicy: serviceAuthorization,
        guidance: serviceGuidance.trim() || undefined,
        quantityScale: serviceQuantityScale,
        storeId,
        workPolicy: trackServiceWork ? "tracked" : "charge_only",
      })
      return
    }

    if (!form.unitName.trim()) {
      setError("Enter the unit this Product is counted in.")
      return
    }

    let openingStockQuantity: string | undefined
    if (showOpeningStock && form.openingStockQuantity.trim()) {
      try {
        openingStockQuantity = parseExactDecimal(form.openingStockQuantity, {
          maxScale: EXACT_QUANTITY_MAX_SCALE,
        })
      } catch (quantityError) {
        setError(
          quantityError instanceof Error
            ? quantityError.message
            : "Enter a valid opening stock quantity.",
        )
        return
      }
    }

    createMutation.mutate({
      canonicalUnitName: form.unitName.trim(),
      clientOperationId: clientOperationId.current,
      description: form.description.trim() || undefined,
      kind: "product",
      name: form.name.trim(),
      openingStockQuantity,
      priceMinor,
      storeId,
    })
  }

  if (!form.kind) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          className="group rounded-xl border border-border p-4 text-left transition hover:border-foreground/25 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => chooseKind("product")}
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
            <HugeiconsIcon icon={Package01Icon} className="size-5" />
          </span>
          <span className="mt-4 block font-medium">Product</span>
          <span className="mt-1 block text-sm text-muted-foreground">
            Something you count or keep in stock.
          </span>
        </button>
        <button
          type="button"
          className="group rounded-xl border border-border p-4 text-left transition hover:border-foreground/25 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => chooseKind("service")}
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <HugeiconsIcon icon={ToolsIcon} className="size-5" />
          </span>
          <span className="mt-4 block font-medium">Service</span>
          <span className="mt-1 block text-sm text-muted-foreground">
            Work you price without stock.
          </span>
        </button>
      </div>
    )
  }

  return (
    <form className="flex min-h-full flex-col" onSubmit={submit}>
      <button
        type="button"
        className="mb-5 w-fit text-sm text-muted-foreground hover:text-foreground"
        onClick={() => setForm((current) => ({ ...current, kind: null }))}
      >
        {form.kind === "product" ? "Product" : "Service"} · Change
      </button>

      <div className="grid gap-4">
        <Field htmlFor="catalog-item-name" label="Name">
          <TextInput
            id="catalog-item-name"
            autoFocus
            autoComplete="off"
            placeholder={form.kind === "product" ? "Item name" : "Service name"}
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            required
          />
        </Field>

        <Field htmlFor="catalog-item-price" label="Price">
          <CurrencyInput
            id="catalog-item-price"
            className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            currencyCode={currencyCode}
            value={form.price}
            onValueChange={(value) =>
              setForm((current) => ({ ...current, price: value }))
            }
            required
          />
        </Field>

        {form.kind === "product" ? (
          <Field htmlFor="catalog-item-unit" label="Counted in">
            <TextInput
              id="catalog-item-unit"
              autoComplete="off"
              placeholder="e.g. piece, kilogram, bag"
              value={form.unitName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  unitName: event.target.value,
                }))
              }
              required
            />
          </Field>
        ) : null}

        {showOpeningStock && form.kind === "product" ? (
          <Field htmlFor="catalog-opening-stock" label="Opening stock">
            <TextInput
              id="catalog-opening-stock"
              inputMode="decimal"
              placeholder="0"
              value={form.openingStockQuantity}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  openingStockQuantity: event.target.value,
                }))
              }
            />
          </Field>
        ) : null}

        {showDescription ? (
          <Field htmlFor="catalog-item-description" label="Description">
            <textarea
              id="catalog-item-description"
              className="min-h-24 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </Field>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {form.kind === "product" && !showOpeningStock ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowOpeningStock(true)}
            >
              Add opening stock
            </Button>
          ) : null}
          {!showDescription ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowDescription(true)}
            >
              Add description
            </Button>
          ) : null}
          {!showAdvanced ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAdvanced(true)}
            >
              Add options
            </Button>
          ) : null}
          {form.kind === "product" && !showUnits ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowUnits(true)}
            >
              Add selling units
            </Button>
          ) : null}
          {form.kind === "service" && !trackServiceWork ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTrackServiceWork(true)}
            >
              Track work after order
            </Button>
          ) : null}
        </div>

        {form.kind === "service" && trackServiceWork ? (
          <section className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium">Tracked work</h3>
                <p className="text-xs text-muted-foreground">
                  Orders for this offering create work lines in the Service
                  queue.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setTrackServiceWork(false)}
              >
                Remove
              </Button>
            </div>
            <Field htmlFor="service-work-authorization" label="Work can start">
              <select
                id="service-work-authorization"
                className="h-11 rounded-lg border border-border bg-background px-3 text-sm"
                value={serviceAuthorization}
                onChange={(event) =>
                  setServiceAuthorization(
                    event.target.value as typeof serviceAuthorization,
                  )
                }
              >
                <option value="on_order_confirmation">
                  When order is confirmed
                </option>
                <option value="after_required_payment">
                  After required payment
                </option>
                <option value="manual_release">After manager release</option>
              </select>
            </Field>
            <Field htmlFor="service-quantity-scale" label="Quantity precision">
              <select
                id="service-quantity-scale"
                className="h-11 rounded-lg border border-border bg-background px-3 text-sm"
                value={serviceQuantityScale}
                onChange={(event) =>
                  setServiceQuantityScale(Number(event.target.value))
                }
              >
                <option value={0}>Whole quantities</option>
                <option value={1}>1 decimal place</option>
                <option value={2}>2 decimal places</option>
                <option value={3}>3 decimal places</option>
              </select>
            </Field>
            <Field
              htmlFor="service-guidance"
              label="Customer guidance (optional)"
            >
              <TextInput
                id="service-guidance"
                placeholder="What the customer should know"
                value={serviceGuidance}
                onChange={(event) => setServiceGuidance(event.target.value)}
              />
            </Field>
          </section>
        ) : null}

        {showAdvanced || (form.kind === "product" && showUnits) ? (
          <section className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4">
            {showAdvanced ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-medium">Options</h3>
                    <p className="text-xs text-muted-foreground">
                      Use neutral choices such as Colour and Size.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowAdvanced(false)
                      setVariantDrafts({})
                    }}
                  >
                    Remove
                  </Button>
                </div>

                {optionGroups.map((group, groupIndex) => (
                  <div
                    className="grid gap-3 rounded-lg border border-border bg-background p-3"
                    key={group.id}
                  >
                    <Field
                      htmlFor={`catalog-option-name-${group.id}`}
                      label="Option name"
                    >
                      <TextInput
                        id={`catalog-option-name-${group.id}`}
                        placeholder="e.g. Size"
                        value={group.name}
                        onChange={(event) =>
                          setOptionGroups((current) =>
                            current.map((candidate) =>
                              candidate.id === group.id
                                ? { ...candidate, name: event.target.value }
                                : candidate,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field
                      htmlFor={`catalog-option-values-${group.id}`}
                      label="Values"
                    >
                      <TextInput
                        id={`catalog-option-values-${group.id}`}
                        placeholder="Small, Medium, Large"
                        value={group.values}
                        onChange={(event) =>
                          setOptionGroups((current) =>
                            current.map((candidate) =>
                              candidate.id === group.id
                                ? { ...candidate, values: event.target.value }
                                : candidate,
                            ),
                          )
                        }
                      />
                    </Field>
                    {optionGroups.length > 1 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setOptionGroups((current) =>
                            current.filter(
                              (candidate) => candidate.id !== group.id,
                            ),
                          )
                        }
                      >
                        Remove option {groupIndex + 1}
                      </Button>
                    ) : null}
                  </div>
                ))}

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setOptionGroups((current) => [...current, newOptionGroup()])
                  }
                >
                  Add another option
                </Button>

                {combinations.length > 0 ? (
                  <div className="grid gap-3">
                    <h3 className="font-medium">Variants</h3>
                    {combinations.map((combination) => {
                      const draft = variantDraft(combination.key)
                      return (
                        <div
                          className="grid gap-3 rounded-lg border border-border bg-background p-3"
                          key={combination.key}
                        >
                          <label className="flex items-center justify-between gap-3 text-sm font-medium">
                            <span>{combination.name}</span>
                            <input
                              type="checkbox"
                              checked={draft.enabled}
                              onChange={(event) =>
                                updateVariantDraft(combination.key, {
                                  enabled: event.target.checked,
                                })
                              }
                            />
                          </label>
                          <Field
                            htmlFor={`catalog-variant-price-${combination.key}`}
                            label="Price override"
                          >
                            <CurrencyInput
                              id={`catalog-variant-price-${combination.key}`}
                              className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              currencyCode={currencyCode}
                              placeholder={form.price || "Use item price"}
                              value={draft.price}
                              onValueChange={(value) =>
                                updateVariantDraft(combination.key, {
                                  price: value,
                                })
                              }
                            />
                          </Field>
                          {form.kind === "service" ? (
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={draft.quoteRequired}
                                onChange={(event) =>
                                  updateVariantDraft(combination.key, {
                                    quoteRequired: event.target.checked,
                                  })
                                }
                              />
                              Quote required
                            </label>
                          ) : (
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Field
                                htmlFor={`catalog-sku-${combination.key}`}
                                label="SKU"
                              >
                                <TextInput
                                  id={`catalog-sku-${combination.key}`}
                                  value={draft.sku}
                                  onChange={(event) =>
                                    updateVariantDraft(combination.key, {
                                      sku: event.target.value,
                                    })
                                  }
                                />
                              </Field>
                              <Field
                                htmlFor={`catalog-barcode-${combination.key}`}
                                label="Barcode"
                              >
                                <TextInput
                                  id={`catalog-barcode-${combination.key}`}
                                  value={draft.barcode}
                                  onChange={(event) =>
                                    updateVariantDraft(combination.key, {
                                      barcode: event.target.value,
                                    })
                                  }
                                />
                              </Field>
                            </div>
                          )}

                          {stores.length > 1 ? (
                            <fieldset className="grid gap-2">
                              <legend className="text-sm font-medium">
                                Available at
                              </legend>
                              <div className="flex flex-wrap gap-3">
                                {stores.map((candidate) => (
                                  <label
                                    className="flex items-center gap-2 text-sm"
                                    key={candidate.id}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={draft.storeIds.includes(
                                        candidate.id,
                                      )}
                                      onChange={(event) =>
                                        updateVariantDraft(combination.key, {
                                          storeIds: event.target.checked
                                            ? [...draft.storeIds, candidate.id]
                                            : draft.storeIds.filter(
                                                (id) => id !== candidate.id,
                                              ),
                                        })
                                      }
                                    />
                                    {candidate.name}
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </>
            ) : null}

            {form.kind === "product" && showUnits ? (
              <div className="grid gap-3 border-t border-border pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">Selling units</h3>
                    <p className="text-xs text-muted-foreground">
                      Add units sold from shared stock or independently prepared
                      stock. A factor means 1 configured unit equals that many
                      counted units.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowUnits(false)
                      setAdditionalUnits([])
                    }}
                  >
                    Remove
                  </Button>
                </div>
                {additionalUnits.map((unit, unitIndex) => (
                  <div
                    className="grid gap-3 rounded-lg border border-border bg-background p-3"
                    key={unit.id}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field
                        htmlFor={`catalog-unit-name-${unit.id}`}
                        label="Unit name"
                      >
                        <TextInput
                          id={`catalog-unit-name-${unit.id}`}
                          placeholder="e.g. carton"
                          value={unit.name}
                          onChange={(event) =>
                            setAdditionalUnits((current) =>
                              current.map((candidate) =>
                                candidate.id === unit.id
                                  ? { ...candidate, name: event.target.value }
                                  : candidate,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field
                        htmlFor={`catalog-unit-factor-${unit.id}`}
                        label="1 unit equals counted units"
                      >
                        <TextInput
                          id={`catalog-unit-factor-${unit.id}`}
                          inputMode="decimal"
                          placeholder="e.g. 12"
                          value={unit.factor}
                          onChange={(event) =>
                            setAdditionalUnits((current) =>
                              current.map((candidate) =>
                                candidate.id === unit.id
                                  ? { ...candidate, factor: event.target.value }
                                  : candidate,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field
                        htmlFor={`catalog-unit-price-${unit.id}`}
                        label="Selling price"
                      >
                        <CurrencyInput
                          id={`catalog-unit-price-${unit.id}`}
                          className="h-11 rounded-lg border border-border bg-background px-3 text-sm"
                          currencyCode={currencyCode}
                          placeholder={form.price || "Use item price"}
                          value={unit.price}
                          onValueChange={(value) =>
                            setAdditionalUnits((current) =>
                              current.map((candidate) =>
                                candidate.id === unit.id
                                  ? { ...candidate, price: value }
                                  : candidate,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field
                        htmlFor={`catalog-unit-behavior-${unit.id}`}
                        label="Stock source"
                      >
                        <select
                          id={`catalog-unit-behavior-${unit.id}`}
                          className="h-11 rounded-lg border border-border bg-background px-3 text-sm"
                          value={unit.stockBehavior}
                          onChange={(event) =>
                            setAdditionalUnits((current) =>
                              current.map((candidate) =>
                                candidate.id === unit.id
                                  ? {
                                      ...candidate,
                                      stockBehavior: event.target
                                        .value as AdvancedUnitDraft["stockBehavior"],
                                    }
                                  : candidate,
                              ),
                            )
                          }
                        >
                          <option value="alternate_transaction">
                            Use shared stock
                          </option>
                          <option value="packaged_stock">
                            Prepared stock balance
                          </option>
                        </select>
                      </Field>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        Decimal places
                        <select
                          className="h-9 rounded-lg border border-border bg-background px-2"
                          value={unit.transactionScale}
                          onChange={(event) =>
                            setAdditionalUnits((current) =>
                              current.map((candidate) =>
                                candidate.id === unit.id
                                  ? {
                                      ...candidate,
                                      transactionScale: Number(
                                        event.target.value,
                                      ),
                                    }
                                  : candidate,
                              ),
                            )
                          }
                        >
                          {[0, 1, 2, 3, 4, 5, 6].map((scale) => (
                            <option key={scale} value={scale}>
                              {scale}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setAdditionalUnits((current) =>
                            current.filter(
                              (candidate) => candidate.id !== unit.id,
                            ),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setAdditionalUnits((current) => [...current, newUnit()])
                  }
                >
                  Add selling unit
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="mt-auto border-t border-border pt-5">
        <Button
          type="submit"
          className="w-full"
          disabled={
            createMutation.isPending || createAdvancedMutation.isPending
          }
        >
          {createMutation.isPending || createAdvancedMutation.isPending
            ? "Adding…"
            : "Add item"}
        </Button>
      </div>
    </form>
  )
}
