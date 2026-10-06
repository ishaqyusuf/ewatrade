"use client"

import {
  Button,
  ControlField,
  Input,
  SelectControl,
  Textarea,
} from "@ewatrade/ui"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  type OrderCatalogItem,
  type OrderDraftLine,
  type OrderOffering,
  changeOrderOption,
  orderMoney,
} from "./order-draft"

export function OrderItemRow({
  item,
  line,
  index,
  offerings,
  currencyCode,
  disabled,
  onChange,
  onRemove,
}: {
  item: OrderCatalogItem
  line: OrderDraftLine
  index: number
  offerings: OrderOffering[]
  currencyCode: string
  disabled: boolean
  onChange: (line: OrderDraftLine) => void
  onRemove: () => void
}) {
  const itemOfferings = offerings.filter((row) => row.catalogItemId === item.id)
  const choices = itemOfferings.filter(
    (row) => row.variantId === line.variantId,
  )
  const offering = choices.find((row) => row.id === line.offeringId)
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 space-y-3 border border-border p-4"
    >
      <legend className="sr-only">
        {item.name} item {index + 1}
      </legend>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{item.name}</h3>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${item.name} item ${index + 1}`}
          onClick={onRemove}
          disabled={disabled}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {item.optionGroups.map((group) => (
          <ControlField key={group.id} label={group.name}>
            <SelectControl
              aria-label={`${item.name} item ${index + 1} ${group.name}`}
              value={line.selections[group.id] ?? ""}
              disabled={disabled}
              onValueChange={(value) =>
                onChange(
                  changeOrderOption(item, offerings, line, group.id, value),
                )
              }
              options={group.values
                .filter((value) =>
                  item.variants.some(
                    (variant) =>
                      itemOfferings.some(
                        (row) => row.variantId === variant.id,
                      ) &&
                      variant.selections.some(
                        (selection) =>
                          selection.groupId === group.id &&
                          selection.valueId === value.id,
                      ),
                  ),
                )
                .map((value) => ({
                  value: value.id,
                  label: value.label,
                  disabled: !item.variants.some(
                    (variant) =>
                      variant.selections.some(
                        (selection) =>
                          selection.groupId === group.id &&
                          selection.valueId === value.id,
                      ) &&
                      itemOfferings.some(
                        (row) =>
                          row.variantId === variant.id && !row.disabledReason,
                      ),
                  ),
                }))}
            />
          </ControlField>
        ))}
        {!item.optionGroups.length &&
        item.variants.filter((variant) =>
          itemOfferings.some((row) => row.variantId === variant.id),
        ).length > 1 ? (
          <ControlField label={<>Option</>}>
            <SelectControl
              aria-label={`${item.name} item ${index + 1} option`}
              value={line.variantId}
              disabled={disabled}
              options={item.variants
                .filter((variant) =>
                  itemOfferings.some((row) => row.variantId === variant.id),
                )
                .map((variant) => ({
                  value: variant.id,
                  label: variant.name,
                  disabled: !itemOfferings.some(
                    (row) =>
                      row.variantId === variant.id && !row.disabledReason,
                  ),
                }))}
              onValueChange={(variantId) => {
                const rows = itemOfferings.filter(
                  (row) => row.variantId === variantId,
                )
                onChange({
                  ...line,
                  totalPrice: "",
                  note: "",
                  variantId,
                  offeringId:
                    (rows.find((row) => !row.disabledReason) ?? rows[0])?.id ??
                    "",
                })
              }}
            />
          </ControlField>
        ) : null}
        <ControlField
          label={item.kind === "product" ? "Selling unit" : "Service choice"}
        >
          <SelectControl
            aria-label={`${item.name} item ${index + 1} selling unit`}
            value={line.offeringId}
            placeholder="Choose a unit"
            disabled={disabled || !choices.length}
            onValueChange={(offeringId) =>
              onChange({ ...line, offeringId, totalPrice: "", note: "" })
            }
            options={choices.map((row) => ({
              value: row.id,
              label: row.unitName,
              disabled: Boolean(row.disabledReason),
              description:
                row.disabledReason ??
                (row.pricingPolicy === "order_total"
                  ? "Enter price during order"
                  : row.fixedPriceMinor === null
                    ? "Price not set"
                    : orderMoney(row.fixedPriceMinor, currencyCode)),
            }))}
          />
        </ControlField>
        <ControlField label={<>Quantity</>}>
          <Input
            aria-label={`${item.name} item ${index + 1} quantity`}
            inputMode="decimal"
            placeholder="Qty"
            value={line.quantity}
            onChange={(event) =>
              onChange({ ...line, quantity: event.target.value })
            }
            disabled={disabled}
          />
        </ControlField>
      </div>
      {offering?.pricingPolicy === "order_total" ? (
        <ControlField
          label={`Total price for this item (${currencyCode})`}
          description="Enter the total for the whole item. It will not be multiplied by quantity."
        >
          <Input
            aria-label={`${item.name} item ${index + 1} total price`}
            inputMode="decimal"
            placeholder="Total for the selected quantity"
            value={line.totalPrice}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...line, totalPrice: event.target.value })
            }
          />
        </ControlField>
      ) : null}
      <ControlField label="Item note (optional)">
        <Textarea
          aria-label={`${item.name} item ${index + 1} note`}
          placeholder={
            offering?.pricingPolicy === "order_total"
              ? "e.g. 10 kg after dressing at NGN 3,000/kg"
              : "Add a note for this item"
          }
          value={line.note}
          maxLength={2_000}
          disabled={disabled}
          onChange={(event) => onChange({ ...line, note: event.target.value })}
        />
      </ControlField>
      {offering?.fixedPriceMinor !== null &&
      offering?.fixedPriceMinor !== undefined ? (
        <p className="text-sm text-muted-foreground">
          {orderMoney(offering.fixedPriceMinor, currencyCode)} per{" "}
          {offering.unitName}
        </p>
      ) : null}
      {!offering || offering.disabledReason ? (
        <output className="block text-sm text-destructive">
          {offering?.disabledReason ??
            "This option combination is unavailable. Choose different options."}
        </output>
      ) : null}
    </fieldset>
  )
}
