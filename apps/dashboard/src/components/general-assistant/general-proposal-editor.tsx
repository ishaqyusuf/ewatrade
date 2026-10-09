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

const methods = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "pos", label: "POS" },
  { value: "other", label: "Other" },
] as const

/** Edits create a new revision; the owner reviews the refreshed card before confirming. */
export function GeneralProposalEditor({
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
    initial.action === "product_create"
      ? minorToMajorInput(initial.priceMinor)
      : initial.action === "payment_record"
        ? minorToMajorInput(initial.amountMinor)
        : "",
  )
  const [error, setError] = useState<string | null>(null)
  const patch = (value: Record<string, unknown>) =>
    setPayload((current) => ({ ...current, ...value }) as GeneralAction)
  const field = (name: string) => `general-proposal-${proposal.id}-${name}`
  const save = () => {
    if (disabled) return
    const minor = majorToMinor(amount)
    if (
      (payload.action === "product_create" ||
        payload.action === "payment_record") &&
      minor === null
    ) {
      setError("Enter a valid amount.")
      return
    }
    const parsed = generalActionSchema.safeParse({
      ...payload,
      ...(payload.action === "product_create"
        ? { priceMinor: minor }
        : payload.action === "payment_record"
          ? { amountMinor: minor }
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
        {"name" in payload ? (
          <Field>
            <FieldLabel htmlFor={field("name")}>Name</FieldLabel>
            <Input
              id={field("name")}
              value={payload.name}
              disabled={disabled}
              onChange={(event) => patch({ name: event.target.value })}
            />
          </Field>
        ) : null}
        {payload.action === "customer_create" ? (
          <>
            <Field>
              <FieldLabel htmlFor={field("phone")}>Phone</FieldLabel>
              <Input
                id={field("phone")}
                type="tel"
                autoComplete="off"
                value={payload.phone ?? ""}
                disabled={disabled}
                onChange={(event) =>
                  patch({ phone: event.target.value.trim() || undefined })
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
                disabled={disabled}
                onChange={(event) =>
                  patch({ email: event.target.value.trim() || undefined })
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
        payload.action === "payment_record" ? (
          <Field>
            <FieldLabel htmlFor={field("amount")}>
              {payload.action === "product_create"
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
              Use the sale form to change products or the customer. Here you can
              adjust quantities and notes.
            </p>
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
