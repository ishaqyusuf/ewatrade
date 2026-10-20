"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import {
  Button,
  Checkbox,
  CheckboxField,
  CurrencyInput,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Input,
  ToggleGroup,
  ToggleGroupItem,
  Field as UiField,
} from "@ewatrade/ui"
import type { buildCatalogVariantCombinations } from "@ewatrade/utils"
import {
  canAddCatalogOptionValue,
  findCatalogOptionSuggestion,
  getCatalogOptionSuggestions,
  getCatalogOptionValueSuggestions,
  type resolveCatalogFormGuidance,
} from "@ewatrade/utils/business-catalog-guidance"
import type { Dispatch, ReactNode, SetStateAction } from "react"
import { CatalogDetailEditor, CatalogDetailRow } from "./catalog-detail-editor"
import type {
  AdvancedOptionGroup,
  AdvancedUnitDraft,
  AdvancedVariantDraft,
} from "./catalog-form-types"
import { CatalogGuidanceSuggestions } from "./catalog-guidance-suggestions"
import { updateCatalogOptionValues } from "./catalog-option-values"
import { CatalogOptionValuesCombobox } from "./catalog-option-values-combobox"

function Field({
  children,
  htmlFor,
  label,
}: { children: ReactNode; htmlFor: string; label: string }) {
  return (
    <UiField className="gap-1.5">
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
    </UiField>
  )
}
const TextInput = Input

type Props = {
  active: string
  additionalUnits: AdvancedUnitDraft[]
  combinations: ReturnType<typeof buildCatalogVariantCombinations>
  currencyCode: string
  form: { kind: "product" | "service"; unitName: string }
  formGuidance: ReturnType<typeof resolveCatalogFormGuidance>
  hasOpeningStock: boolean
  onBack: () => void
  onConfirmOptions: () => void
  onEnable: () => void
  onOpen: (editor: string) => void
  onRemove: () => void
  optionGroups: AdvancedOptionGroup[]
  optionIssue: string | null
  setOptionGroups: Dispatch<SetStateAction<AdvancedOptionGroup[]>>
  showAdvanced: boolean
  stores: { id: string; name: string }[]
  suggestionsDisabled: boolean
  updateVariantDraft: (
    key: string,
    update: Partial<AdvancedVariantDraft>,
  ) => void
  variantDraft: (key: string) => AdvancedVariantDraft
}
export function CatalogOptionsEditor({
  active,
  additionalUnits,
  combinations,
  currencyCode,
  form,
  formGuidance,
  hasOpeningStock,
  onBack,
  onConfirmOptions,
  onEnable,
  onOpen,
  onRemove,
  optionGroups,
  optionIssue,
  setOptionGroups,
  showAdvanced,
  stores,
  suggestionsDisabled,
  updateVariantDraft,
  variantDraft,
}: Props) {
  const availableOptionNames = getCatalogOptionSuggestions(formGuidance, {
    usedNames: optionGroups.map((group) => group.name),
    limit: 12,
  }).map((option) => option.label)
  const normalizedOptionGroups = optionGroups.map((group) => ({
    values: group.values
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((label) => ({ label })),
  }))
  return (
    <>
      <CatalogDetailEditor
        active={active}
        editor="options"
        title={
          form.kind === "service"
            ? "Packages or customer choices"
            : "Customer choices"
        }
        description={
          form.kind === "service"
            ? "Each package or customer choice has its own fixed price or quote policy. No price is copied into a new choice."
            : "Size and Colour create separate choices with their own prices and stock. Packs and trays belong in Selling units."
        }
        onBack={onBack}
      >
        {!showAdvanced ? (
          <Button
            appearance="form"
            type="button"
            variant="outline"
            onClick={() => {
              if (form.kind === "product" && hasOpeningStock) onConfirmOptions()
              else onEnable()
            }}
          >
            Add{" "}
            {form.kind === "service"
              ? "packages or customer choices"
              : "customer choices"}
          </Button>
        ) : null}
        {showAdvanced ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-medium">Options</h3>
                <p className="text-xs text-muted-foreground">
                  {formGuidance.options.helperText}
                </p>
              </div>
              <Button
                appearance="form"
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  onRemove()
                }}
              >
                Remove
              </Button>
            </div>

            {optionIssue ? (
              <FormFeedback appearance="dashboard">{optionIssue}</FormFeedback>
            ) : null}
            {optionGroups.map((group, groupIndex) => {
              const optionSuggestion = findCatalogOptionSuggestion(
                formGuidance,
                group.name,
              )
              const valueSuggestions = getCatalogOptionValueSuggestions(
                formGuidance,
                group.name,
                {
                  limit: 12,
                },
              )
              return (
                <FieldGroup
                  className="grid gap-3 border border-border bg-background p-3"
                  key={group.id}
                >
                  <Field
                    htmlFor={`catalog-option-name-${group.id}`}
                    label="Option name"
                  >
                    <TextInput
                      id={`catalog-option-name-${group.id}`}
                      placeholder={formGuidance.options.namePlaceholder}
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
                    <CatalogGuidanceSuggestions
                      label="Option name suggestions"
                      values={availableOptionNames}
                      disabled={suggestionsDisabled}
                      onSelect={(name) =>
                        setOptionGroups((current) =>
                          current.map((candidate) =>
                            candidate.id === group.id
                              ? { ...candidate, name }
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
                    <CatalogOptionValuesCombobox
                      id={`catalog-option-values-${group.id}`}
                      placeholder={
                        optionSuggestion?.valuePlaceholder ??
                        "Select or add values"
                      }
                      value={group.values}
                      suggestions={valueSuggestions}
                      disabled={suggestionsDisabled}
                      canAdd={canAddCatalogOptionValue(
                        normalizedOptionGroups.map((option) => ({
                          values: option.values.map((value) => value.label),
                        })),
                        groupIndex,
                      )}
                      onChange={(values) =>
                        setOptionGroups((current) =>
                          current.map((candidate, index) =>
                            candidate.id === group.id
                              ? {
                                  ...candidate,
                                  values: updateCatalogOptionValues(
                                    current,
                                    index,
                                    values,
                                  ),
                                }
                              : candidate,
                          ),
                        )
                      }
                    />
                  </Field>
                  {optionGroups.length > 1 ? (
                    <Button
                      appearance="form"
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
                </FieldGroup>
              )
            })}

            <Button
              appearance="form"
              type="button"
              size="sm"
              variant="outline"
              disabled={suggestionsDisabled || optionGroups.length >= 12}
              onClick={() =>
                setOptionGroups((current) => [
                  ...current,
                  { id: globalThis.crypto.randomUUID(), name: "", values: "" },
                ])
              }
            >
              Add another option
            </Button>

            {combinations.length ? (
              <FieldGroup className="gap-1">
                <h4 className="font-medium">Price each customer choice</h4>
                {combinations.map((combination) => {
                  const draft = variantDraft(combination.key)
                  return (
                    <CatalogDetailRow
                      key={combination.key}
                      title={combination.name}
                      summary={
                        !draft.enabled
                          ? "Disabled"
                          : draft.orderTotal && form.kind === "product"
                            ? "Enter price during order"
                            : draft.quoteRequired && form.kind === "service"
                              ? "Quote each job"
                              : draft.price
                                ? `${currencyCode} ${draft.price}`
                                : "Price not set"
                      }
                      onClick={() => onOpen(`choice:${combination.key}`)}
                    />
                  )
                })}
              </FieldGroup>
            ) : null}
          </>
        ) : null}
      </CatalogDetailEditor>
      {showAdvanced
        ? combinations.map((combination) => {
            const draft = variantDraft(combination.key)
            return (
              <CatalogDetailEditor
                backLabel="Back to customer choices"
                key={combination.key}
                active={active}
                editor={`choice:${combination.key}`}
                title={combination.name}
                description={
                  form.kind === "service"
                    ? "Set this choice’s pricing independently. Fixed prices are required; quotes confirm the amount after a request."
                    : "This choice has its own main-unit price, optional stock and inventory codes. Blank prices remain unset."
                }
                onBack={onBack}
              >
                <FieldGroup
                  className="grid gap-3 border border-border bg-background p-3"
                  key={combination.key}
                >
                  <CheckboxField label={<span>{combination.name}</span>}>
                    <Checkbox
                      checked={draft.enabled}
                      onCheckedChange={(checked) =>
                        updateVariantDraft(combination.key, {
                          enabled: checked,
                        })
                      }
                    />
                  </CheckboxField>
                  {form.kind === "service" ? (
                    <ToggleGroup
                      value={[draft.quoteRequired ? "quote" : "fixed"]}
                      variant="outline"
                      aria-label="Choice pricing"
                      onValueChange={(values) => {
                        if (values.length)
                          updateVariantDraft(combination.key, {
                            quoteRequired: values[0] === "quote",
                          })
                      }}
                    >
                      <ToggleGroupItem value="fixed">
                        Fixed price
                      </ToggleGroupItem>
                      <ToggleGroupItem value="quote">
                        Quote each job
                      </ToggleGroupItem>
                    </ToggleGroup>
                  ) : null}
                  {form.kind === "product" ? (
                    <CheckboxField label="Enter price during order">
                      <Checkbox
                        checked={draft.orderTotal ?? false}
                        onCheckedChange={(checked) =>
                          updateVariantDraft(combination.key, {
                            orderTotal: checked,
                          })
                        }
                      />
                    </CheckboxField>
                  ) : null}
                  {form.kind === "product" && draft.orderTotal ? (
                    <p className="text-sm text-muted-foreground">
                      The attendant enters the total for all selected items.
                      This choice requires no saved price; its selling units use
                      this mode.
                    </p>
                  ) : null}
                  <div
                    hidden={
                      (form.kind === "service" && draft.quoteRequired) ||
                      (form.kind === "product" && draft.orderTotal)
                    }
                  >
                    <Field
                      htmlFor={`catalog-variant-price-${combination.key}`}
                      label={form.kind === "product" ? "Price" : "Fixed price"}
                    >
                      <CurrencyInput
                        id={`catalog-variant-price-${combination.key}`}
                        currencyCode={currencyCode}
                        placeholder={
                          form.kind === "product"
                            ? "Enter price"
                            : "Enter this choice’s price"
                        }
                        value={draft.price}
                        onValueChange={(value) =>
                          updateVariantDraft(combination.key, {
                            price: value,
                          })
                        }
                      />
                    </Field>{" "}
                  </div>
                  {form.kind === "service" && draft.quoteRequired ? (
                    <p className="text-sm text-muted-foreground">
                      Confirm a quote before creating the Order. The hidden
                      fixed-price draft is retained.
                    </p>
                  ) : null}

                  {form.kind === "product" ? (
                    <>
                      <Field
                        htmlFor={`catalog-variant-stock-${combination.key}`}
                        label="Opening stock (optional)"
                      >
                        <TextInput
                          id={`catalog-variant-stock-${combination.key}`}
                          inputMode="decimal"
                          placeholder="Enter current stock"
                          value={draft.quantity}
                          onChange={(event) =>
                            updateVariantDraft(combination.key, {
                              quantity: event.target.value,
                            })
                          }
                        />
                      </Field>
                      {additionalUnits.length > 0 ? (
                        <div className="grid gap-3 border-t border-border pt-3">
                          <div>
                            <p className="text-sm font-medium">
                              Selling prices by unit
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Set this choice’s price for each selling unit.
                              Blank uses an explicitly entered unit price;
                              otherwise it stays unset.
                            </p>
                          </div>
                          {additionalUnits.map((unit) => (
                            <Field
                              htmlFor={`catalog-variant-unit-price-${combination.key}-${unit.id}`}
                              key={unit.id}
                              label={`${unit.name} price`}
                            >
                              <CurrencyInput
                                id={`catalog-variant-unit-price-${combination.key}-${unit.id}`}
                                currencyCode={currencyCode}
                                placeholder={unit.price || "Price not set"}
                                value={draft.unitPrices[unit.id] ?? ""}
                                onValueChange={(value) =>
                                  updateVariantDraft(combination.key, {
                                    unitPrices: {
                                      ...draft.unitPrices,
                                      [unit.id]: value,
                                    },
                                  })
                                }
                              />
                            </Field>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {stores.length > 1 ? (
                    <FieldSet className="grid gap-2">
                      <FieldLegend
                        variant="label"
                        className="text-sm font-medium"
                      >
                        Available at
                      </FieldLegend>
                      <div className="flex flex-wrap gap-3">
                        {stores.map((candidate) => (
                          <CheckboxField
                            key={candidate.id}
                            label={candidate.name}
                          >
                            <Checkbox
                              checked={draft.storeIds.includes(candidate.id)}
                              onCheckedChange={(checked) =>
                                updateVariantDraft(combination.key, {
                                  storeIds: checked
                                    ? [...draft.storeIds, candidate.id]
                                    : draft.storeIds.filter(
                                        (id) => id !== candidate.id,
                                      ),
                                })
                              }
                            />
                          </CheckboxField>
                        ))}
                      </div>
                    </FieldSet>
                  ) : null}
                </FieldGroup>
              </CatalogDetailEditor>
            )
          })
        : null}
    </>
  )
}
