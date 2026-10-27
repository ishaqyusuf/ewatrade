"use client"

import { CatalogIllustrationPicker } from "@/components/catalog-item/catalog-illustration-picker"
import { CatalogIllustrationPreview } from "@/components/catalog-item/catalog-illustration-preview"
import { CatalogPhotoPreview } from "@/components/catalog-item/catalog-photo-preview"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { useCatalogPhoto } from "@/hooks/use-catalog-photo"
import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import { isSimpleProductCreate } from "@ewatrade/assistant/general/product-create"
import { isCanonicalUnitAlias } from "@ewatrade/assistant/setup/variants"
import { CATALOG_PHOTO_CONTENT_TYPES } from "@ewatrade/catalog/photo-contracts"
import {
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  MoneyInput,
  SelectControl,
} from "@ewatrade/ui"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils"
import { getCatalogCategoryPresets } from "@ewatrade/utils/catalog-category-presets"
import { findCatalogIllustration } from "@ewatrade/utils/catalog-illustrations"
import { Image01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRef, useState } from "react"
import { useAssistantStoreId } from "./general-product-picture"
type Action = Extract<GeneralAction, { action: "product_create" }>

/**
 * A product draft: name, counting unit, a price per unit and stock for each
 * option (one row for a simple product), and its photo or library picture.
 */
export function GeneralProductCreateEditor({
  initial,
  currencyCode,
  disabled,
  onSave,
  onCancel,
}: {
  initial: Action
  currencyCode: string
  disabled: boolean
  onSave: (payload: GeneralAction) => void
  onCancel: () => void
}) {
  const catalog = useCatalogItemParams()
  const simple = isSimpleProductCreate(initial)
  const [packs, setPacks] = useState(
    (initial.sellingUnits ?? []).filter(
      (pack) =>
        !isCanonicalUnitAlias(
          pack,
          initial.canonicalUnitName,
          initial.priceMinor,
        ),
    ),
  )
  const [categoryKey, setCategoryKey] = useState(initial.categoryKey ?? "")
  const variants = initial.variants ?? []
  const storeId = useAssistantStoreId()
  const photo = useCatalogPhoto(storeId ?? "")
  const operation = useRef(crypto.randomUUID())
  const [name, setName] = useState(initial.name)
  const [unit, setUnit] = useState(initial.canonicalUnitName)
  // Undefined lets the server pick a matching picture; null means removed.
  const [illustrationId, setIllustrationId] = useState(initial.illustrationId)
  const [keptPhoto, setKeptPhoto] = useState(initial.photoAssetId)
  const [picking, setPicking] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  // The draft's picture unless a photo replaces it.
  const illustration =
    photo.file || keptPhoto
      ? undefined
      : findCatalogIllustration(illustrationId)
  const [rows, setRows] = useState(
    simple
      ? [
          {
            prices: [minorToMajorInput(initial.priceMinor)],
            stock: initial.openingStock ?? "",
          },
        ]
      : variants.map((variant) => ({
          prices: [
            minorToMajorInput(variant.priceMinor),
            ...packs.map((pack) =>
              minorToMajorInput(
                variant.sellingUnitPrices?.find(
                  (price) => price.unitName === pack.name,
                )?.priceMinor,
              ),
            ),
          ],
          stock: variant.openingStock ?? "",
        })),
  )
  const [error, setError] = useState<string | null>(null)
  const busy = disabled || photo.uploading
  const units = [unit, ...packs.map((pack) => pack.name)]
  const label = (index: number) =>
    variants[index]?.selections.map((entry) => entry.value).join(" / ") ||
    name ||
    initial.name
  const setRow = (index: number, next: Partial<(typeof rows)[number]>) =>
    setRows((current) =>
      current.map((row, at) => (at === index ? { ...row, ...next } : row)),
    )
  async function save() {
    if (busy) return
    try {
      const priced = rows.map((row, index) => ({
        minor: row.prices.map((price, at) => {
          const value = majorToMinor(price)
          if (!price.trim()) return undefined
          if (value === null)
            throw Error(`Enter a price for ${label(index)} per ${units[at]}.`)
          return value
        }),
        stock: row.stock.trim() || undefined,
      }))
      // A new photo replaces any earlier one and the library picture. A failed
      // upload shows its own message under the picture.
      let photoAssetId = keptPhoto
      if (photo.file) {
        try {
          photoAssetId = (
            await photo.upload(`assistant-product-${operation.current}`)
          )[0]
        } catch {
          setError(null)
          return
        }
      }
      const parsed = generalActionSchema.safeParse({
        ...initial,
        name,
        canonicalUnitName: unit,
        categoryKey,
        categorySuggested:
          categoryKey === initial.categoryKey
            ? initial.categorySuggested
            : false,
        sellingUnits: packs,
        illustrationId: photoAssetId ? undefined : illustrationId,
        photoAssetId,
        ...(simple
          ? {
              priceMinor: priced[0]?.minor[0],
              openingStock: priced[0]?.stock,
            }
          : {
              priceMinor: undefined,
              openingStock: undefined,
              variants: priced.map((row, index) => ({
                ...variants[index],
                stockByUnit:
                  row.stock === variants[index]?.openingStock
                    ? variants[index]?.stockByUnit
                    : undefined,
                selections: variants[index]?.selections ?? [],
                priceMinor: row.minor[0],
                sellingUnitPrices: packs.flatMap((pack, at) => {
                  const priceMinor = row.minor[at + 1]
                  return priceMinor === undefined
                    ? []
                    : [
                        {
                          unitName: pack.name,
                          priceMinor,
                          derivedFromUnit:
                            priceMinor ===
                            variants[index]?.sellingUnitPrices?.find(
                              (price) => price.unitName === pack.name,
                            )?.priceMinor
                              ? variants[index]?.sellingUnitPrices?.find(
                                  (price) => price.unitName === pack.name,
                                )?.derivedFromUnit
                              : undefined,
                        },
                      ]
                }),
                openingStock: row.stock,
              })),
            }),
      })
      if (!parsed.success)
        throw Error(
          parsed.error.issues[0]?.message ?? "Check the product fields.",
        )
      setError(null)
      onSave(parsed.data)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Check the product fields.",
      )
    }
  }
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      {initial.reviewRequirements?.length ? (
        <div className="grid justify-items-start gap-2">
          <p className="text-sm text-muted-foreground">
            Special stock or tracking details need the advanced product form.
            Your supplied facts remain in this draft.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void catalog.setParams({
                catalogItem: "create",
                catalogCreateKind: "product",
                catalogCreateMode: "form",
                catalogCreateName: initial.name,
                catalogCreatePrice:
                  initial.priceMinor === undefined
                    ? null
                    : String(initial.priceMinor),
              })
            }
          >
            Open advanced product form
          </Button>
        </div>
      ) : null}
      <FieldGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="product-create-name">Name</FieldLabel>
            <Input
              id="product-create-name"
              value={name}
              maxLength={160}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="product-create-unit">Counted in</FieldLabel>
            <Input
              id="product-create-unit"
              value={unit}
              maxLength={80}
              disabled={busy}
              onChange={(event) => setUnit(event.target.value)}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="product-create-category">
            Category / subcategory
          </FieldLabel>
          <SelectControl
            id="product-create-category"
            disabled={busy}
            value={categoryKey}
            onValueChange={setCategoryKey}
            options={[
              ...(initial.categoryKey?.startsWith("shopify:")
                ? [
                    {
                      value: initial.categoryKey,
                      label: initial.categoryLabel ?? initial.categoryKey,
                    },
                  ]
                : []),
              { value: "", label: "Uncategorized" },
              ...getCatalogCategoryPresets({
                kind: "product",
                all: true,
              }).flatMap((category) => [
                { value: category.key, label: category.label },
                ...category.subcategories.map((child) => ({
                  value: child.key,
                  label: `${category.label} / ${child.label}`,
                })),
              ]),
            ]}
          />
        </Field>
        {packs.map((pack, index) => (
          <Field key={pack.name}>
            <FieldLabel htmlFor={`product-create-pack-${index}`}>
              {pack.referenceUnitName || unit} per {pack.name}
            </FieldLabel>
            <Input
              id={`product-create-pack-${index}`}
              inputMode="decimal"
              disabled={busy}
              value={pack.referenceQuantity ?? pack.containsQuantity}
              onChange={(event) =>
                setPacks((current) =>
                  current.map((entry, at) =>
                    at !== index
                      ? entry
                      : {
                          ...entry,
                          ...(entry.referenceUnitName
                            ? { referenceQuantity: event.target.value }
                            : { containsQuantity: event.target.value }),
                          quantityDefault: undefined,
                        },
                  ),
                )
              }
            />
          </Field>
        ))}
        {rows.map((row, index) => (
          <fieldset
            // biome-ignore lint/suspicious/noArrayIndexKey: rows follow the saved option order
            key={index}
            className="grid gap-3 rounded-lg border px-3 py-3"
          >
            <legend className="px-1 text-sm font-medium">{label(index)}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {units.map((unitName, at) => (
                <Field key={`${at}:${unitName}`}>
                  <FieldLabel htmlFor={`product-create-${index}-${at}`}>
                    Price per {unitName || "unit"}
                  </FieldLabel>
                  <MoneyInput
                    id={`product-create-${index}-${at}`}
                    currencyCode={currencyCode}
                    value={row.prices[at] ?? ""}
                    disabled={busy}
                    onChange={(event) =>
                      setRow(index, {
                        prices: row.prices.map((price, other) =>
                          other === at ? event.target.value : price,
                        ),
                      })
                    }
                  />
                </Field>
              ))}
              <Field>
                <FieldLabel htmlFor={`product-create-${index}-stock`}>
                  Opening stock ({unit || "unit"})
                </FieldLabel>
                <Input
                  id={`product-create-${index}-stock`}
                  inputMode="decimal"
                  value={row.stock}
                  placeholder="Not supplied"
                  disabled={busy}
                  onChange={(event) =>
                    setRow(index, { stock: event.target.value })
                  }
                />
              </Field>
            </div>
          </fieldset>
        ))}
        <div className="grid gap-2">
          <p className="text-sm font-medium">Picture</p>
          <div className="flex items-center gap-3">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
              {photo.preview ? (
                <img
                  src={photo.preview}
                  alt={name}
                  className="size-full object-cover"
                />
              ) : keptPhoto && storeId ? (
                <CatalogPhotoPreview
                  assetId={keptPhoto}
                  storeId={storeId}
                  label={`${name} photo`}
                  compact
                />
              ) : illustration ? (
                <div className="size-full p-1.5">
                  <CatalogIllustrationPreview
                    illustrationId={illustration.id}
                    compact
                  />
                </div>
              ) : (
                <HugeiconsIcon
                  icon={Image01Icon}
                  className="size-5 text-muted-foreground"
                />
              )}
            </div>
            <div className="flex min-w-0 flex-wrap gap-2">
              <input
                ref={fileInput}
                type="file"
                accept={CATALOG_PHOTO_CONTENT_TYPES.join(",")}
                className="sr-only"
                tabIndex={-1}
                onChange={(event) => {
                  const selected = event.currentTarget.files?.[0]
                  if (selected && photo.select(selected)) setPicking(false)
                  event.currentTarget.value = ""
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || !storeId}
                onClick={() => fileInput.current?.click()}
              >
                {photo.file || keptPhoto ? "Replace photo" : "Upload photo"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                aria-expanded={picking}
                onClick={() => setPicking((open) => !open)}
              >
                {illustration && !photo.file && !keptPhoto
                  ? "Change illustration"
                  : "Choose illustration"}
              </Button>
              {photo.file || keptPhoto || illustration ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    if (photo.file) photo.select(null)
                    else if (keptPhoto) setKeptPhoto(undefined)
                    else setIllustrationId(null)
                  }}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
          {picking ? (
            <CatalogIllustrationPicker
              kind="product"
              selectedId={illustration?.id ?? null}
              disabled={busy}
              onSelect={(id) => {
                photo.select(null)
                setKeptPhoto(undefined)
                setIllustrationId(id)
                setPicking(false)
              }}
            />
          ) : null}
          {photo.error ? (
            <p role="alert" className="text-sm text-destructive">
              {photo.error}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              A photo replaces the illustration. JPG, PNG, WebP or HEIC, up to
              10 MB.
            </p>
          )}
        </div>
      </FieldGroup>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {photo.uploading ? "Uploading photo…" : "Save draft"}
        </Button>
      </div>
    </form>
  )
}
