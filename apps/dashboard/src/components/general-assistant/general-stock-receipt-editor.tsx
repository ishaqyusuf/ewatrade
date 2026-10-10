"use client"
import { StockCategoriesInput } from "@/components/inventory/stock-categories-input"
import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  MoneyInput,
  Textarea,
} from "@ewatrade/ui"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils"
import {
  type StockCategoryDraft,
  collectStockCategoryDraft,
} from "@ewatrade/utils/inventory-categories"
import { format } from "date-fns"
import { useState } from "react"
type Action = Extract<GeneralAction, { action: "stock_receive" }>
export function GeneralStockReceiptEditor({
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
  const [quantity, setQuantity] = useState(initial.enteredQuantity)
  const [source, setSource] = useState(initial.source)
  const [reason, setReason] = useState(initial.reason)
  const [supplier, setSupplier] = useState(initial.supplierName ?? "")
  const [cost, setCost] = useState(
    initial.unitCostMinor === undefined
      ? ""
      : minorToMajorInput(initial.unitCostMinor),
  )
  const [effective, setEffective] = useState(
    format(new Date(initial.effectiveAt ?? Date.now()), "yyyy-MM-dd'T'HH:mm"),
  )
  const [categories, setCategories] = useState<StockCategoryDraft[]>(
    initial.categories ?? [],
  )
  const [categoryInput, setCategoryInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  function save() {
    if (disabled) return
    try {
      const date = new Date(effective)
      if (!effective || !Number.isFinite(date.getTime()))
        throw Error("Choose an effective date and time.")
      const unitCostMinor = cost.trim() ? majorToMinor(cost) : undefined
      if (unitCostMinor === null)
        throw Error("Enter a valid unit cost or leave it blank when unknown.")
      const selected =
        categories.length || categoryInput.trim()
          ? collectStockCategoryDraft(categories, categoryInput).map(
              ({ name }) => ({ name }),
            )
          : undefined
      const parsed = generalActionSchema.safeParse({
        ...initial,
        enteredQuantity: quantity,
        source,
        reason,
        supplierName: supplier.trim() || undefined,
        unitCostMinor,
        categories: selected,
        effectiveAt: date.toISOString(),
      })
      if (!parsed.success)
        throw Error(
          parsed.error.issues[0]?.message ?? "Check the receipt fields.",
        )
      setError(null)
      onSave(parsed.data)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Check the receipt fields.",
      )
    }
  }
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <p className="text-sm text-muted-foreground">
        Uses the stock source and unit shown in the review. Save changes to
        review the conversion and new balance again.
      </p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="receipt-quantity">Quantity received</FieldLabel>
          <Input
            id="receipt-quantity"
            inputMode="decimal"
            value={quantity}
            disabled={disabled}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="receipt-effective">
            Effective date and time
          </FieldLabel>
          <Input
            id="receipt-effective"
            type="datetime-local"
            value={effective}
            disabled={disabled}
            onChange={(event) => setEffective(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="receipt-source">
            Source or delivery reference
          </FieldLabel>
          <Input
            id="receipt-source"
            value={source}
            maxLength={80}
            disabled={disabled}
            onChange={(event) => setSource(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="receipt-supplier">
            Supplier name (optional)
          </FieldLabel>
          <Input
            id="receipt-supplier"
            value={supplier}
            maxLength={160}
            disabled={disabled}
            onChange={(event) => setSupplier(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Saved as receipt text. Supplier accounts, purchases and payments are
            separate.
          </p>
        </Field>
        <StockCategoriesInput
          value={categories}
          input={categoryInput}
          onChange={setCategories}
          onInputChange={setCategoryInput}
          disabled={disabled}
        />
        <Field>
          <FieldLabel htmlFor="receipt-reason">Reason</FieldLabel>
          <Textarea
            id="receipt-reason"
            value={reason}
            maxLength={500}
            disabled={disabled}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="receipt-cost">
            Reported cost per entered unit (optional)
          </FieldLabel>
          <MoneyInput
            id="receipt-cost"
            currencyCode={currencyCode}
            value={cost}
            disabled={disabled}
            onChange={(event) => setCost(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Leave blank when unknown. This records a cost snapshot, not a
            purchase or payment.
          </p>
        </Field>
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
        <Button type="submit" disabled={disabled}>
          Save draft
        </Button>
      </div>
    </form>
  )
}
