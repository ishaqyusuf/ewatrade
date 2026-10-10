"use client"
import { useTRPC } from "@/trpc/client"
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
  SelectControl,
  Textarea,
} from "@ewatrade/ui"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { useId, useState } from "react"
import { GeneralSaleCustomer } from "./general-sale-customer"
type Action = Extract<
  GeneralAction,
  { action: "order_cancel" | "order_metadata_update" | "order_replace" }
>
const modes = [
  { value: "keep", label: "Keep unchanged" },
  { value: "set", label: "Change" },
  { value: "clear", label: "Clear" },
]
const mode = (value: unknown) =>
  value === undefined ? "keep" : value === null ? "clear" : "set"
export function GeneralOrderAmendmentEditor({
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
  const trpc = useTRPC()
  const order = useQuery(
    trpc.orders.get.queryOptions(
      { orderId: initial.orderId },
      { retry: false },
    ),
  )
  const [payload, setPayload] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [amounts, setAmounts] = useState(
    initial.action === "order_replace"
      ? initial.changes.map((line) =>
          line.unitPriceMinor !== undefined
            ? minorToMajorInput(line.unitPriceMinor)
            : line.enteredTotalMinor !== undefined
              ? minorToMajorInput(line.enteredTotalMinor)
              : "",
        )
      : [],
  )
  const [due, setDue] = useState(
    initial.action === "order_metadata_update" && initial.patch.deliveryDueAt
      ? format(new Date(initial.patch.deliveryDueAt), "yyyy-MM-dd'T'HH:mm")
      : "",
  )
  const id = useId()
  const pending = disabled || order.isPending || !order.data
  const setField = (
    key: "customerId" | "notes" | "deliveryDueAt",
    value: string | null | undefined,
  ) => {
    if (payload.action === "order_metadata_update")
      setPayload({ ...payload, patch: { ...payload.patch, [key]: value } })
  }
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        let candidate: unknown = payload
        if (
          payload.action === "order_metadata_update" &&
          typeof payload.patch.deliveryDueAt === "string"
        ) {
          const date = new Date(due)
          if (!Number.isFinite(date.getTime())) {
            setError("Choose a valid delivery date and time.")
            return
          }
          candidate = {
            ...payload,
            patch: { ...payload.patch, deliveryDueAt: date.toISOString() },
          }
        }
        if (payload.action === "order_replace") {
          if (
            amounts.some(
              (value) => value.trim() !== "" && majorToMinor(value) === null,
            )
          ) {
            setError("Enter a valid price.")
            return
          }
          candidate = {
            ...payload,
            changes: payload.changes.map((line, index) => {
              const source = order.data?.lines.find(
                (row) => row.id === line.orderLineId,
              )
              const total = source?.snapshot?.pricingPolicy === "order_total"
              const amount = amounts[index]?.trim()
                ? majorToMinor(amounts[index] ?? "")
                : undefined
              return {
                orderLineId: line.orderLineId,
                quantity: line.quantity?.trim() || undefined,
                ...(total
                  ? { enteredTotalMinor: amount }
                  : { unitPriceMinor: amount }),
              }
            }),
          }
        }
        const parsed = generalActionSchema.safeParse(candidate)
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the changes.")
          return
        }
        setError(null)
        onSave(parsed.data)
      }}
    >
      <p className="text-sm text-muted-foreground">
        {order.data ? `Order ${order.data.orderNumber}` : "Loading order…"}.
        Save these edits, then review the refreshed proposal before confirming.
      </p>
      {order.isError ? (
        <p role="alert">
          Order unavailable.{" "}
          <Button
            type="button"
            variant="ghost"
            onClick={() => void order.refetch()}
          >
            Retry
          </Button>
        </p>
      ) : null}
      <FieldGroup>
        {payload.action === "order_metadata_update" ? (
          <>
            <Field>
              <FieldLabel htmlFor={`${id}-customer-mode`}>Customer</FieldLabel>
              <SelectControl
                id={`${id}-customer-mode`}
                value={mode(payload.patch.customerId)}
                options={modes}
                disabled={pending}
                onValueChange={(value) =>
                  setField(
                    "customerId",
                    value === "keep"
                      ? undefined
                      : value === "clear"
                        ? null
                        : (order.data?.customerId ?? ""),
                  )
                }
              />
              {mode(payload.patch.customerId) === "set" ? (
                <GeneralSaleCustomer
                  customerId={payload.patch.customerId ?? undefined}
                  disabled={pending}
                  onChange={(value) => setField("customerId", value ?? "")}
                />
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-due-mode`}>Delivery date</FieldLabel>
              <SelectControl
                id={`${id}-due-mode`}
                value={mode(payload.patch.deliveryDueAt)}
                options={modes}
                disabled={pending}
                onValueChange={(value) =>
                  setField(
                    "deliveryDueAt",
                    value === "keep"
                      ? undefined
                      : value === "clear"
                        ? null
                        : "",
                  )
                }
              />
              {mode(payload.patch.deliveryDueAt) === "set" ? (
                <Input
                  aria-label="New delivery date"
                  type="datetime-local"
                  value={due}
                  disabled={pending}
                  onChange={(event) => setDue(event.target.value)}
                />
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-notes-mode`}>Notes</FieldLabel>
              <SelectControl
                id={`${id}-notes-mode`}
                value={mode(payload.patch.notes)}
                options={modes}
                disabled={pending}
                onValueChange={(value) =>
                  setField(
                    "notes",
                    value === "keep"
                      ? undefined
                      : value === "clear"
                        ? null
                        : (order.data?.notes ?? ""),
                  )
                }
              />
              {mode(payload.patch.notes) === "set" ? (
                <Textarea
                  aria-label="New order notes"
                  value={payload.patch.notes ?? ""}
                  maxLength={2000}
                  disabled={pending}
                  onChange={(event) => setField("notes", event.target.value)}
                />
              ) : null}
            </Field>
          </>
        ) : null}
        {payload.action === "order_replace"
          ? payload.changes.map((line, index) => {
              const source = order.data?.lines.find(
                (row) => row.id === line.orderLineId,
              )
              return (
                <div
                  key={line.orderLineId}
                  className="grid gap-3 border border-border p-3"
                >
                  <p className="text-sm font-medium">
                    {source?.snapshot?.catalogItemName ?? `Item ${index + 1}`} ·{" "}
                    {source?.snapshot?.offeringName ?? ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Original quantity {source?.quantity ?? "…"}. Leave a field
                    blank to retain its original value.
                  </p>
                  <Field>
                    <FieldLabel htmlFor={`${id}-quantity-${index}`}>
                      Replacement quantity
                    </FieldLabel>
                    <Input
                      id={`${id}-quantity-${index}`}
                      inputMode="decimal"
                      value={line.quantity ?? ""}
                      disabled={pending}
                      onChange={(event) =>
                        setPayload({
                          ...payload,
                          changes: payload.changes.map((row, position) =>
                            position === index
                              ? {
                                  ...row,
                                  quantity: event.target.value || undefined,
                                }
                              : row,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${id}-price-${index}`}>
                      {source?.snapshot?.pricingPolicy === "order_total"
                        ? "Replacement item total"
                        : "Replacement unit price"}{" "}
                      ({currencyCode})
                    </FieldLabel>
                    <MoneyInput
                      currencyCode={currencyCode}
                      id={`${id}-price-${index}`}
                      value={amounts[index] ?? ""}
                      disabled={pending}
                      onChange={(event) =>
                        setAmounts(
                          amounts.map((value, position) =>
                            position === index ? event.target.value : value,
                          ),
                        )
                      }
                    />
                  </Field>
                </div>
              )
            })
          : null}
        {payload.action === "order_cancel" ? (
          <p className="text-sm">
            Cancellation releases remaining reserved stock. It does not record a
            refund.
          </p>
        ) : null}
        <Field>
          <FieldLabel htmlFor={`${id}-reason`}>Reason</FieldLabel>
          <Textarea
            id={`${id}-reason`}
            value={payload.reason}
            maxLength={500}
            disabled={pending}
            onChange={(event) =>
              setPayload({ ...payload, reason: event.target.value })
            }
          />
        </Field>
      </FieldGroup>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          Save draft
        </Button>
      </div>
    </form>
  )
}
