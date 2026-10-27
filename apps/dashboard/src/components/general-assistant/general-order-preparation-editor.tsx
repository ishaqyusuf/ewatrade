"use client"
import { OpenAssistantReadRecord } from "@/components/open-assistant-read-record"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  type OrderPreparationRequest,
  orderPreparationRequestSchema,
} from "@ewatrade/assistant/general/order-preparation"
import {
  Button,
  Field,
  FieldLabel,
  Input,
  MoneyInput,
  SelectControl,
  Textarea,
} from "@ewatrade/ui"
import { useState } from "react"
import {
  OrderPaymentAccount,
  useOrderPaymentAccountChoice,
} from "../orders/order-payment-account"
import { OpenMissingCatalogItem } from "./open-missing-catalog-item"
type Action = Extract<GeneralAction, { action: "order_create" }>
export function GeneralOrderPreparationEditor({
  initial,
  currencyCode,
  disabled,
  onSave,
  onCancel,
}: {
  initial: Action
  currencyCode: string
  disabled: boolean
  onSave: (action: GeneralAction) => void
  onCancel: () => void
}) {
  const [request, setRequest] = useState<OrderPreparationRequest>(() =>
    orderPreparationRequestSchema.parse(initial.preparation),
  )
  const [error, setError] = useState<string | null>(null)
  const account = useOrderPaymentAccountChoice({
    method: request.payment?.method ?? "cash",
    enabled: !!request.payment?.method,
    suggestedAccountId: request.payment?.moneyAccountId,
  })
  const patchLine = (
    index: number,
    patch: Partial<OrderPreparationRequest["lines"][number]>,
  ) =>
    setRequest((current) => ({
      ...current,
      lines: current.lines.map((line, at) =>
        at === index ? { ...line, ...patch } : line,
      ),
    }))
  function save() {
    if (disabled) return
    const parsed = orderPreparationRequestSchema.safeParse({
      ...request,
      payment: request.payment
        ? {
            ...request.payment,
            moneyAccountId: request.payment.method
              ? account.payloadAccountId
              : undefined,
          }
        : undefined,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the draft fields.")
      return
    }
    setError(null)
    onSave({ ...initial, preparation: parsed.data })
  }
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <Field>
        <FieldLabel htmlFor="prepared-order-customer">
          Customer (optional)
        </FieldLabel>
        <Input
          id="prepared-order-customer"
          value={request.customerName ?? ""}
          disabled={disabled}
          onChange={(event) =>
            setRequest({
              ...request,
              customerName: event.target.value || undefined,
            })
          }
        />
      </Field>
      {request.lines.map((line, index) => {
        const prepared = initial.prepared?.lines[index]
        return (
          <fieldset
            // biome-ignore lint/suspicious/noArrayIndexKey: line order is fixed within this proposal revision.
            key={index}
            className="grid gap-3 rounded-lg border p-3"
          >
            <legend className="px-1 text-sm font-medium">
              Item {index + 1}
            </legend>
            <Field>
              <FieldLabel htmlFor={`order-name-${index}`}>Product</FieldLabel>
              <Input
                id={`order-name-${index}`}
                value={line.name}
                disabled={disabled}
                onChange={(event) =>
                  patchLine(index, {
                    name: event.target.value,
                    disposition: undefined,
                  })
                }
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`order-qty-${index}`}>Quantity</FieldLabel>
                <Input
                  id={`order-qty-${index}`}
                  value={line.quantity}
                  inputMode="decimal"
                  disabled={disabled}
                  onChange={(event) =>
                    patchLine(index, { quantity: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`order-unit-${index}`}>
                  Selling unit
                </FieldLabel>
                <Input
                  id={`order-unit-${index}`}
                  value={line.unitName ?? ""}
                  placeholder="Default unit"
                  disabled={disabled}
                  onChange={(event) =>
                    patchLine(index, {
                      unitName: event.target.value || undefined,
                    })
                  }
                />
              </Field>
            </div>
            {line.choices.map((choice, at) => (
              <Field key={choice.optionName}>
                <FieldLabel htmlFor={`order-choice-${index}-${at}`}>
                  {choice.optionName}
                </FieldLabel>
                <Input
                  id={`order-choice-${index}-${at}`}
                  value={choice.value}
                  disabled={disabled}
                  onChange={(event) =>
                    patchLine(index, {
                      choices: line.choices.map((entry, position) =>
                        position === at
                          ? { ...entry, value: event.target.value }
                          : entry,
                      ),
                    })
                  }
                />
              </Field>
            ))}
            {prepared?.issue ? (
              <p className="text-sm text-muted-foreground">{prepared.issue}</p>
            ) : null}
            {line.deliveredQuantity !== undefined ? (
              <p className="text-sm text-muted-foreground">
                Already delivered: {line.deliveredQuantity}{" "}
                {line.unitName ?? "items"}. Use the order fulfillment workflow
                to record a partial delivery.
              </p>
            ) : null}
            {line.disposition === "order_only" ||
            line.unitPrice !== undefined ||
            prepared?.status === "price_needed" ? (
              <Field>
                <FieldLabel htmlFor={`order-price-${index}`}>
                  Price per {line.unitName ?? "item"}
                </FieldLabel>
                <MoneyInput
                  id={`order-price-${index}`}
                  currencyCode={currencyCode}
                  value={line.unitPrice ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    patchLine(index, {
                      unitPrice: event.target.value || undefined,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {line.disposition === "order_only"
                    ? "Order-only item; no catalog entry or inventory movement."
                    : "For a fixed-price item, clear the stated price to use its saved price, or update the Catalog through its authorized form. For an order-priced item, enter the agreed price."}
                </p>
              </Field>
            ) : null}
            {prepared &&
            (prepared.status === "missing_item" ||
              prepared.status === "missing_choice") ? (
              <div className="flex flex-wrap items-start gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() =>
                    patchLine(index, { disposition: "order_only" })
                  }
                >
                  Use on this order only
                </Button>
                {prepared.catalogItemId && initial.prepared ? (
                  <OpenAssistantReadRecord
                    target={{
                      kind: "catalog_item",
                      catalogItemId: prepared.catalogItemId,
                      origin: initial.prepared.origin,
                    }}
                  />
                ) : initial.prepared ? (
                  <OpenMissingCatalogItem
                    handoff={{
                      kind: "product",
                      name: line.name,
                      origin: initial.prepared.origin,
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </fieldset>
        )
      })}
      {(request.extraCharges ?? []).map((charge, index) => (
        <Field key={charge.name}>
          <FieldLabel htmlFor={`order-extra-${index}`}>
            {charge.name}
          </FieldLabel>
          <MoneyInput
            id={`order-extra-${index}`}
            currencyCode={currencyCode}
            disabled={disabled}
            value={charge.amount ?? ""}
            onChange={(event) =>
              setRequest({
                ...request,
                extraCharges: request.extraCharges?.map((entry, at) =>
                  at === index
                    ? { ...entry, amount: event.target.value || undefined }
                    : entry,
                ),
              })
            }
          />
        </Field>
      ))}
      {request.payment ? (
        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium">
            Payment already received
          </legend>
          <SelectControl
            aria-label="Payment method"
            disabled={disabled}
            value={request.payment.method ?? ""}
            options={[
              { value: "", label: "Choose payment method" },
              { value: "cash", label: "Cash" },
              { value: "bank_transfer", label: "Bank transfer" },
              { value: "pos", label: "POS" },
              { value: "card", label: "Card" },
              { value: "other", label: "Other" },
            ]}
            onValueChange={(method) => {
              const parsed = orderPreparationRequestSchema.shape.payment
                .unwrap()
                .shape.method.safeParse(method || undefined)
              if (parsed.success)
                setRequest({
                  ...request,
                  payment: {
                    ...request.payment,
                    paid: true,
                    method: parsed.data,
                    moneyAccountId: undefined,
                  },
                })
            }}
          />
          <Field>
            <FieldLabel htmlFor="order-paid-amount">
              Amount received (blank means the reviewed total)
            </FieldLabel>
            <MoneyInput
              id="order-paid-amount"
              currencyCode={currencyCode}
              value={request.payment.amount ?? ""}
              disabled={disabled}
              onChange={(event) =>
                setRequest({
                  ...request,
                  payment: {
                    ...request.payment,
                    paid: true,
                    amount: event.target.value || undefined,
                  },
                })
              }
            />
          </Field>
          {request.payment.method ? (
            <OrderPaymentAccount choice={account} disabled={disabled} />
          ) : null}
        </fieldset>
      ) : null}
      {request.delivered &&
      !request.partialDelivery &&
      !request.stockAlreadyRecorded &&
      !request.occurredAt ? (
        <p className="text-sm text-muted-foreground">
          Delivery is included in this review. Saving deducts the selected
          quantities from this Store’s stock.
        </p>
      ) : null}
      {request.partialDelivery ||
      request.stockAlreadyRecorded ||
      request.occurredAt ? (
        <p className="text-sm text-muted-foreground">
          This draft retains the supplied delivery and date facts.{" "}
          <a className="underline" href="/orders">
            Open Orders
          </a>{" "}
          to use the dated, partial-fulfillment or original-order correction
          workflow before recording those effects.
        </p>
      ) : null}
      {initial.prepared?.issues.map((issue) => (
        <p key={issue} className="text-sm text-muted-foreground">
          {issue}
        </p>
      ))}
      <Field>
        <FieldLabel htmlFor="order-preparation-notes">
          Notes (optional)
        </FieldLabel>
        <Textarea
          id="order-preparation-notes"
          value={request.notes ?? ""}
          disabled={disabled}
          onChange={(event) =>
            setRequest({ ...request, notes: event.target.value || undefined })
          }
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        After adding a missing product or choice, save this draft to refresh its
        matches. Nothing is recorded until you confirm the updated review.
      </p>
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
