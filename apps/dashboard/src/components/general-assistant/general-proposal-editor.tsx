"use client"
import {
  type GeneralAction,
  type GeneralProposal,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  MoneyInput,
  SelectControl,
  Textarea,
} from "@ewatrade/ui"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils"
import { useState } from "react"
import { GeneralOrderAmendmentEditor } from "./general-order-amendment-editor"
import { GeneralCloseoutEditor } from "./general-closeout-editor"
import { GeneralStockAdjustmentEditor } from "./general-stock-adjustment-editor"
import { GeneralStockTransferEditor } from "./general-stock-transfer-editor"
import { GeneralStockCountEditor } from "./general-stock-count-editor"
import { GeneralStockReceiptEditor } from "./general-stock-receipt-editor"
import { GeneralSaleCustomer } from "./general-sale-customer"
import { GeneralUnitEditor } from "./general-unit-editor"

const methods = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "pos", label: "POS" },
  { value: "other", label: "Other" },
] as const

export function GeneralProposalEditor(props: {
  proposal: GeneralProposal
  currencyCode: string
  disabled: boolean
  onSave: (payload: GeneralAction) => void
  onCancel: () => void
}) {
  if (props.proposal.payload.action === "order_cancel" || props.proposal.payload.action === "order_metadata_update" || props.proposal.payload.action === "order_replace") return <GeneralOrderAmendmentEditor initial={props.proposal.payload} currencyCode={props.currencyCode} disabled={props.disabled} onSave={props.onSave} onCancel={props.onCancel} />
  if (props.proposal.payload.action === "inventory_closeout_create" || props.proposal.payload.action === "inventory_closeout_finalize") return <GeneralCloseoutEditor initial={props.proposal.payload} disabled={props.disabled} onSave={props.onSave} onCancel={props.onCancel} />
  if (props.proposal.payload.action === "stock_transfer_dispatch" || props.proposal.payload.action === "stock_transfer_receive" || props.proposal.payload.action === "stock_transfer_cancel") return <GeneralStockTransferEditor initial={props.proposal.payload} disabled={props.disabled} onSave={props.onSave} onCancel={props.onCancel} />
  if (props.proposal.payload.action === "stock_adjust" || props.proposal.payload.action === "stock_correct") return <GeneralStockAdjustmentEditor initial={props.proposal.payload} disabled={props.disabled} onSave={props.onSave} onCancel={props.onCancel} />
  if (props.proposal.payload.action === "stock_count_create" || props.proposal.payload.action === "stock_count_finalize") return <GeneralStockCountEditor initial={props.proposal.payload} disabled={props.disabled} onSave={props.onSave} onCancel={props.onCancel} />
  if (props.proposal.payload.action === "stock_receive")
    return (
      <GeneralStockReceiptEditor
        initial={props.proposal.payload}
        currencyCode={props.currencyCode}
        disabled={props.disabled}
        onSave={props.onSave}
        onCancel={props.onCancel}
      />
    )
  return props.proposal.payload.action ===
    "product_unit_configuration_draft" ? (
    <GeneralUnitEditor
      initial={props.proposal.payload}
      disabled={props.disabled}
      onSave={props.onSave}
      onCancel={props.onCancel}
    />
  ) : (
    <GeneralProposalFields {...props} />
  )
}

/** Edits create a new revision; the owner reviews the refreshed card before confirming. */
function GeneralProposalFields({
  proposal,
  currencyCode,
  disabled,
  onSave,
  onCancel,
}: {
  proposal: GeneralProposal
  currencyCode: string
  disabled: boolean
  onSave: (payload: GeneralAction) => void
  onCancel: () => void
}) {
  const initial = proposal.payload
  const [payload, setPayload] = useState(initial)
  const [amount, setAmount] = useState(
    initial.action === "product_create" ||
      initial.action === "product_price_update"
      ? minorToMajorInput(initial.priceMinor)
      : initial.action === "payment_record"
        ? minorToMajorInput(initial.amountMinor)
        : initial.action === "order_create" && initial.initialPayment
          ? minorToMajorInput(initial.initialPayment.amountMinor)
          : "",
  )
  const [lineTotals, setLineTotals] = useState(
    initial.action === "order_create"
      ? initial.lines.map((line) =>
          line.enteredTotalMinor === undefined
            ? ""
            : minorToMajorInput(line.enteredTotalMinor),
        )
      : [],
  )
  const [error, setError] = useState<string | null>(null)
  // On an update, a cleared phone or email means remove it; on create, omit it.
  const cleared = payload.action === "customer_update" ? null : undefined
  const patch = (value: Record<string, unknown>) =>
    setPayload((current) => ({ ...current, ...value }) as GeneralAction)
  const field = (name: string) => `general-proposal-${proposal.id}-${name}`
  const save = () => {
    if (disabled) return
    const minor = majorToMinor(amount)
    if (
      (payload.action === "product_create" ||
        payload.action === "product_price_update" ||
        payload.action === "payment_record" ||
        (payload.action === "order_create" && payload.initialPayment)) &&
      minor === null
    ) {
      setError("Enter a valid amount.")
      return
    }
    const parsed = generalActionSchema.safeParse({
      ...payload,
      ...(payload.action === "order_create"
        ? {
            lines: payload.lines.map((line, index) =>
              line.enteredTotalMinor === undefined
                ? line
                : {
                    ...line,
                    enteredTotalMinor: majorToMinor(lineTotals[index] ?? ""),
                  },
            ),
          }
        : {}),
      ...(payload.action === "product_create" ||
      payload.action === "product_price_update"
        ? { priceMinor: minor }
        : payload.action === "payment_record"
          ? { amountMinor: minor }
          : payload.action === "order_create" && payload.initialPayment
            ? {
                initialPayment: {
                  ...payload.initialPayment,
                  amountMinor: minor,
                },
              }
            : {}),
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the draft fields.")
      return
    }
    setError(null)
    onSave(parsed.data)
  }
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <FieldGroup>
        {payload.action === "service_line_authorize" || payload.action === "service_line_fulfill" ? (
          <>
            <p className="text-sm text-muted-foreground">This applies to the selected service line at its full saved quantity. Review the refreshed details before confirming.</p>
            <Field>
              <FieldLabel htmlFor={field("reason")}>Reason</FieldLabel>
              <Input id={field("reason")} value={payload.reason} disabled={disabled} onChange={(event) => patch({ reason: event.target.value })} />
            </Field>
          </>
        ) : null}
        {payload.action === "product_unit_configuration_publish" ? (
          <Field>
            <p className="text-sm text-muted-foreground">
              Publish the saved unit draft shown in the review. To change units,
              save a separate unit draft first. No stock is converted by this
              action.
            </p>
            <FieldLabel htmlFor={field("transition")}>
              Existing Stock Transition ID (optional)
            </FieldLabel>
            <Input
              id={field("transition")}
              disabled={disabled}
              value={payload.stockTransitionOperationId ?? ""}
              onChange={(event) =>
                patch({
                  stockTransitionOperationId:
                    event.target.value.trim() || undefined,
                })
              }
            />
          </Field>
        ) : null}

        {payload.action === "customer_update" ? (
          <p className="text-sm text-muted-foreground">
            Only changed details are included in this draft. Untouched fields
            keep their saved values. Clear a phone or email to remove it, then
            review the changes before confirming.
          </p>
        ) : null}
        {"name" in payload ||
        payload.action === "customer_update" ||
        payload.action === "product_details_update" ? (
          <Field>
            <FieldLabel htmlFor={field("name")}>Name</FieldLabel>
            <Input
              id={field("name")}
              value={payload.name ?? ""}
              placeholder={
                payload.action === "customer_update" ||
                payload.action === "product_details_update"
                  ? "Keep current name"
                  : undefined
              }
              disabled={disabled}
              onChange={(event) =>
                patch({
                  name:
                    (payload.action === "customer_update" ||
                      payload.action === "product_details_update") &&
                    !event.target.value.trim()
                      ? undefined
                      : event.target.value,
                })
              }
            />
          </Field>
        ) : null}
        {payload.action === "customer_create" ||
        payload.action === "customer_update" ? (
          <>
            <Field>
              <FieldLabel htmlFor={field("phone")}>Phone</FieldLabel>
              <Input
                id={field("phone")}
                type="tel"
                autoComplete="off"
                value={payload.phone ?? ""}
                placeholder={
                  payload.action === "customer_update" &&
                  payload.phone === undefined
                    ? "Keep current phone"
                    : undefined
                }
                disabled={disabled}
                onChange={(event) =>
                  patch({ phone: event.target.value.trim() || cleared })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={field("email")}>Email</FieldLabel>
              <Input
                id={field("email")}
                type="email"
                autoComplete="off"
                value={payload.email ?? ""}
                placeholder={
                  payload.action === "customer_update" &&
                  payload.email === undefined
                    ? "Keep current email"
                    : undefined
                }
                disabled={disabled}
                onChange={(event) =>
                  patch({ email: event.target.value.trim() || cleared })
                }
              />
            </Field>
          </>
        ) : null}
        {payload.action === "product_details_update" ? (
          <>
            <p className="text-sm text-muted-foreground">
              Untouched fields keep their saved values. Clearing description or
              category removes it. Changes apply across Stores; past orders stay
              unchanged.
            </p>
            <Field>
              <FieldLabel htmlFor={field("description")}>
                Description
              </FieldLabel>
              <Textarea
                id={field("description")}
                value={payload.description ?? ""}
                placeholder={
                  payload.description === undefined
                    ? "Keep current description"
                    : undefined
                }
                disabled={disabled}
                onChange={(event) =>
                  patch({ description: event.target.value || null })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={field("category")}>Category</FieldLabel>
              <Input
                id={field("category")}
                value={payload.category ?? ""}
                placeholder={
                  payload.category === undefined
                    ? "Keep current category"
                    : undefined
                }
                disabled={disabled}
                onChange={(event) =>
                  patch({ category: event.target.value || null })
                }
              />
            </Field>
          </>
        ) : null}
        {payload.action === "product_identifiers_update" ? (
          <>
            <p className="text-sm text-muted-foreground">
              Changes apply only to the reviewed selling unit across Stores.
              Untouched identifiers stay unchanged; clearing an identifier
              removes it.
            </p>
            <Field>
              <FieldLabel htmlFor={field("sku")}>SKU</FieldLabel>
              <Input
                id={field("sku")}
                value={payload.sku ?? ""}
                placeholder={
                  payload.sku === undefined ? "Keep current SKU" : undefined
                }
                disabled={disabled}
                onChange={(event) => patch({ sku: event.target.value || null })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={field("barcode")}>Barcode</FieldLabel>
              <Input
                id={field("barcode")}
                value={payload.barcode ?? ""}
                placeholder={
                  payload.barcode === undefined
                    ? "Keep current barcode"
                    : undefined
                }
                disabled={disabled}
                onChange={(event) =>
                  patch({ barcode: event.target.value || null })
                }
              />
            </Field>
          </>
        ) : null}
        {payload.action === "product_create" ? (
          <Field>
            <FieldLabel htmlFor={field("unit")}>Unit</FieldLabel>
            <Input
              id={field("unit")}
              value={payload.canonicalUnitName}
              disabled={disabled}
              onChange={(event) =>
                patch({ canonicalUnitName: event.target.value })
              }
            />
          </Field>
        ) : null}
        {payload.action === "product_create" ||
        payload.action === "product_price_update" ||
        payload.action === "payment_record" ? (
          <Field>
            <FieldLabel htmlFor={field("amount")}>
              {payload.action === "product_create" ||
              payload.action === "product_price_update"
                ? "Unit price"
                : "Payment amount"}
            </FieldLabel>
            <MoneyInput
              id={field("amount")}
              currencyCode={currencyCode}
              value={amount}
              disabled={disabled}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
        ) : null}
        {payload.action === "product_price_update" ? (
          <>
            <p className="text-sm text-muted-foreground">
              This changes the selected offering in every Store that sells it.
              Other units, variants and past orders keep their prices.
            </p>
            <Field>
              <FieldLabel htmlFor={field("reason")}>Reason</FieldLabel>
              <Input
                id={field("reason")}
                value={payload.reason}
                disabled={disabled}
                onChange={(event) => patch({ reason: event.target.value })}
              />
            </Field>
          </>
        ) : null}
        {payload.action === "product_availability_update" ? (
          <Field>
            <FieldLabel htmlFor={field("availability")}>
              Selling availability
            </FieldLabel>
            <SelectControl
              id={field("availability")}
              options={[
                { value: "available", label: "Available" },
                { value: "unavailable", label: "Unavailable" },
              ]}
              value={payload.isAvailable ? "available" : "unavailable"}
              disabled={disabled}
              onValueChange={(value) =>
                patch({ isAvailable: value === "available" })
              }
            />
            <p className="text-sm text-muted-foreground">
              Applies only to the reviewed selling unit in the current Store.
              Stock and saved orders stay unchanged.
            </p>
          </Field>
        ) : null}
        {payload.action === "payment_record" ? (
          <>
            <Field>
              <FieldLabel htmlFor={field("method")}>Payment method</FieldLabel>
              <SelectControl
                id={field("method")}
                options={[...methods]}
                value={payload.method}
                disabled={disabled}
                onValueChange={(method) => patch({ method })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={field("note")}>Note</FieldLabel>
              <Input
                id={field("note")}
                value={payload.note ?? ""}
                disabled={disabled}
                onChange={(event) =>
                  patch({ note: event.target.value || undefined })
                }
              />
            </Field>
          </>
        ) : null}
        {payload.action === "order_create" ? (
          <>
            <p className="text-sm text-muted-foreground">
              Choose a saved customer and adjust quantities, notes and money
              already received. Fixed prices come from the Catalog; configured
              item totals can be edited below.
            </p>
            <GeneralSaleCustomer
              customerId={payload.customerId}
              disabled={disabled}
              onChange={(customerId) => patch({ customerId })}
            />
            <Field>
              <FieldLabel htmlFor={field("initial-payment")}>
                Payment at sale
              </FieldLabel>
              <SelectControl
                id={field("initial-payment")}
                options={[
                  { value: "none", label: "No payment received" },
                  { value: "received", label: "Record money already received" },
                ]}
                value={payload.initialPayment ? "received" : "none"}
                disabled={disabled}
                onValueChange={(value) =>
                  patch({
                    initialPayment:
                      value === "received"
                        ? { amountMinor: 0, method: "cash" }
                        : undefined,
                  })
                }
              />
            </Field>
            {payload.initialPayment ? (
              <>
                <Field>
                  <FieldLabel htmlFor={field("initial-amount")}>
                    Amount received
                  </FieldLabel>
                  <MoneyInput
                    id={field("initial-amount")}
                    currencyCode={currencyCode}
                    value={amount}
                    disabled={disabled}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={field("initial-method")}>
                    Initial payment method
                  </FieldLabel>
                  <SelectControl
                    id={field("initial-method")}
                    options={[...methods]}
                    value={payload.initialPayment.method}
                    disabled={disabled}
                    onValueChange={(method) =>
                      patch({
                        initialPayment: { ...payload.initialPayment, method },
                      })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={field("initial-note")}>
                    Payment note
                  </FieldLabel>
                  <Input
                    id={field("initial-note")}
                    value={payload.initialPayment.note ?? ""}
                    disabled={disabled}
                    maxLength={500}
                    onChange={(event) =>
                      patch({
                        initialPayment: {
                          ...payload.initialPayment,
                          note: event.target.value || undefined,
                        },
                      })
                    }
                  />
                </Field>
                <p className="text-sm text-muted-foreground">
                  Record only money already received. Saving updates the review;
                  confirmation creates the sale and payment together.
                </p>
              </>
            ) : null}
            {payload.lines.map((line, index) => (
              <Field key={`${line.offeringId}:${index}`}>
                <FieldLabel htmlFor={field(`quantity-${index}`)}>
                  Quantity · line {index + 1}
                </FieldLabel>
                <Input
                  id={field(`quantity-${index}`)}
                  inputMode="decimal"
                  value={line.quantity}
                  disabled={disabled}
                  onChange={(event) =>
                    patch({
                      lines: payload.lines.map((current, i) =>
                        i === index
                          ? { ...current, quantity: event.target.value }
                          : current,
                      ),
                    })
                  }
                />
                {line.enteredTotalMinor !== undefined ? (
                  <>
                    <FieldLabel htmlFor={field(`total-${index}`)}>
                      Item total · line {index + 1}
                    </FieldLabel>
                    <MoneyInput
                      id={field(`total-${index}`)}
                      currencyCode={currencyCode}
                      value={lineTotals[index] ?? ""}
                      disabled={disabled}
                      onChange={(event) =>
                        setLineTotals((current) =>
                          current.map((value, i) =>
                            i === index ? event.target.value : value,
                          ),
                        )
                      }
                    />
                  </>
                ) : null}
              </Field>
            ))}
            <Field>
              <FieldLabel htmlFor={field("notes")}>Notes</FieldLabel>
              <Textarea
                id={field("notes")}
                value={payload.notes ?? ""}
                disabled={disabled}
                onChange={(event) =>
                  patch({ notes: event.target.value || undefined })
                }
              />
            </Field>
          </>
        ) : null}
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
