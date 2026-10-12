"use client"
import { flattenServiceOfferings } from "@/components/service-work/service-utils"
import { useTRPC } from "@/trpc/client"
import {
  type ServiceIntakeAction,
  serviceIntakeAction,
} from "@ewatrade/assistant/general/service-intake"
import {
  Button,
  ControlField,
  FieldGroup,
  Input,
  SelectControl,
  Textarea,
} from "@ewatrade/ui"
import { parseFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { preserveReviewedTimestamp } from "./posting-date"

export type ServiceIntakeEditorProps = {
  initial: ServiceIntakeAction
  disabled: boolean
  currencyCode: string
  onSave: (value: ServiceIntakeAction) => void
  onCancel: () => void
}
export type ServiceIntakeEditorOptions = {
  offerings: Array<{
    id: string
    name: string
    priceMinor: number | null
    workPolicy: string
  }>
  assignees: Array<{ id: string; name: string }>
  customerName?: string
  loading?: boolean
  unavailable?: boolean
  onRetry?: () => void
}
export function GeneralServiceIntakeEditor(props: ServiceIntakeEditorProps) {
  const trpc = useTRPC()
  const context = useQuery(
    trpc.tenant.current.queryOptions(undefined, { retry: false, staleTime: 0 }),
  )
  const storeId = context.data?.activeStore?.id
  const items = useQuery(
    trpc.catalog.listItems.queryOptions(
      { kind: "service" },
      { retry: false, staleTime: 0 },
    ),
  )
  const staff = useQuery(
    trpc.services.assignees.queryOptions(undefined, {
      retry: false,
      staleTime: 0,
    }),
  )
  const customer = useQuery(
    trpc.customers.getById.queryOptions(
      { customerId: props.initial.customerId ?? "" },
      {
        enabled: Boolean(props.initial.customerId),
        retry: false,
        staleTime: 0,
      },
    ),
  )
  return (
    <GeneralServiceIntakeEditorView
      {...props}
      options={{
        offerings: flattenServiceOfferings(items.data ?? [], storeId ?? "")
          .filter((o) => o.pricingPolicy === "fixed")
          .map((o) => ({
            id: o.id,
            name: o.displayName,
            priceMinor: o.fixedPriceMinor,
            workPolicy: o.serviceWorkPolicy?.workPolicy ?? "unknown",
          })),
        assignees: staff.data ?? [],
        customerName: customer.data?.name,
        loading:
          context.isFetching ||
          items.isFetching ||
          staff.isFetching ||
          Boolean(props.initial.customerId && customer.isFetching),
        unavailable:
          context.isError ||
          (!context.isPending && !storeId) ||
          items.isError ||
          staff.isError ||
          Boolean(props.initial.customerId && customer.isError),
        onRetry: () => {
          void context.refetch()
          void items.refetch()
          void staff.refetch()
          if (props.initial.customerId) void customer.refetch()
        },
      }}
    />
  )
}
const displayDate = (value?: string) =>
  value ? new Date(value).toISOString().slice(0, 19) : ""
function savedDate(value: string, original?: string) {
  if (!value) return undefined
  const date = new Date(`${value}Z`)
  if (!Number.isFinite(date.getTime()))
    throw Error("Choose a valid UTC date and time.")
  return original
    ? preserveReviewedTimestamp(date, original)
    : date.toISOString()
}
/** Rendering is shared by the real editor and the provider-free source preview. */
export function GeneralServiceIntakeEditorView({
  initial,
  disabled,
  currencyCode,
  onSave,
  onCancel,
  options,
}: ServiceIntakeEditorProps & { options: ServiceIntakeEditorOptions }) {
  const [draft, setDraft] = useState(initial)
  const [rowKeys, setRowKeys] = useState(
    initial.lines.map((_, index) => `initial-${index}`),
  )
  const [payment, setPayment] = useState(
    initial.initialPaymentMinor
      ? (initial.initialPaymentMinor / 100).toFixed(2)
      : "",
  )
  const [due, setDue] = useState(displayDate(initial.dueCommitmentAt))
  const [requested, setRequested] = useState(displayDate(initial.requestedAt))
  const [error, setError] = useState<string | null>(null)
  const blocked = disabled || options.loading || options.unavailable
  const unresolved =
    draft.lines.some(
      (line) => !options.offerings.some((o) => o.id === line.offeringId),
    ) ||
    Boolean(
      draft.requestedAssigneeId &&
        !options.assignees.some((a) => a.id === draft.requestedAssigneeId),
    )
  const patch = <K extends keyof ServiceIntakeAction>(
    key: K,
    value: ServiceIntakeAction[K],
  ) => setDraft((current) => ({ ...current, [key]: value }))
  const text = (
    key:
      | "customerName"
      | "customerPhone"
      | "customerEmail"
      | "instructions"
      | "conditionNote"
      | "initialPaymentReference",
    value: string,
  ) => patch(key, value.trim() ? value : undefined)
  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (blocked || unresolved) return
        try {
          const value = serviceIntakeAction.parse({
            ...draft,
            dueCommitmentAt: savedDate(due, initial.dueCommitmentAt),
            requestedAt: savedDate(requested, initial.requestedAt),
            initialPaymentMinor: payment.trim()
              ? Number(parseFinanceMoney(payment))
              : undefined,
            initialPaymentMethod: payment.trim()
              ? (draft.initialPaymentMethod ?? "cash")
              : undefined,
            initialPaymentReference: payment.trim()
              ? draft.initialPaymentReference
              : undefined,
          })
          setError(null)
          onSave(value)
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : "Check the intake details.",
          )
        }
      }}
    >
      <p className="text-sm text-muted-foreground">
        Save these details to rebuild the server review. Confirmation creates an
        Intake and Order; tracked services also create queued work.
      </p>
      {options.loading ? (
        <output aria-live="polite">
          Loading current services, customer and assignees…
        </output>
      ) : options.unavailable ? (
        <div role="alert">
          <p>Current intake choices are unavailable.</p>
          <Button type="button" variant="outline" onClick={options.onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
      <fieldset disabled={Boolean(blocked)} className="grid gap-5">
        <FieldGroup>
          {initial.customerId ? (
            <p className="text-sm">
              Saved customer: {options.customerName ?? "Unavailable"}. Ask for a
              new draft to choose another customer.
            </p>
          ) : (
            <>
              <ControlField label="Customer name (optional)">
                <Input
                  value={draft.customerName ?? ""}
                  maxLength={160}
                  onChange={(e) => text("customerName", e.target.value)}
                />
              </ControlField>
              <ControlField label="Phone (optional)">
                <Input
                  value={draft.customerPhone ?? ""}
                  maxLength={40}
                  onChange={(e) => text("customerPhone", e.target.value)}
                />
              </ControlField>
              <ControlField label="Email (optional)">
                <Input
                  type="email"
                  value={draft.customerEmail ?? ""}
                  maxLength={320}
                  onChange={(e) => text("customerEmail", e.target.value)}
                />
              </ControlField>
            </>
          )}
          {draft.lines.map((line, index) => (
            <div key={rowKeys[index]} className="grid gap-3 border-t pt-4">
              <ControlField label={`Service ${index + 1}`}>
                <SelectControl
                  value={line.offeringId}
                  options={options.offerings.map((o) => ({
                    value: o.id,
                    label: `${o.name} · ${o.workPolicy.toLowerCase().replaceAll("_", " ")}`,
                  }))}
                  onValueChange={(value) =>
                    patch(
                      "lines",
                      draft.lines.map((row, i) =>
                        i === index ? { ...row, offeringId: value } : row,
                      ),
                    )
                  }
                />
              </ControlField>
              <ControlField label="Exact quantity">
                <Input
                  value={line.quantity}
                  inputMode="decimal"
                  maxLength={40}
                  onChange={(e) =>
                    patch(
                      "lines",
                      draft.lines.map((row, i) =>
                        i === index
                          ? { ...row, quantity: e.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </ControlField>
              {draft.lines.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setRowKeys(rowKeys.filter((_, i) => i !== index))
                    patch(
                      "lines",
                      draft.lines.filter((_, i) => i !== index),
                    )
                  }}
                >
                  Remove service
                </Button>
              ) : null}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={draft.lines.length >= 100 || !options.offerings.length}
            onClick={() => {
              const offering = options.offerings[0]
              if (!offering) return
              setRowKeys([...rowKeys, crypto.randomUUID()])
              patch("lines", [
                ...draft.lines,
                { offeringId: offering.id, quantity: "1" },
              ])
            }}
          >
            Add service
          </Button>
          <ControlField label="Instructions (optional)">
            <Textarea
              value={draft.instructions ?? ""}
              maxLength={4_000}
              onChange={(e) => text("instructions", e.target.value)}
            />
          </ControlField>
          <ControlField label="Condition note (optional)">
            <Textarea
              value={draft.conditionNote ?? ""}
              maxLength={2_000}
              onChange={(e) => text("conditionNote", e.target.value)}
            />
          </ControlField>
          <ControlField label="Assignee">
            <SelectControl
              value={draft.requestedAssigneeId ?? "unassigned"}
              options={[
                { value: "unassigned", label: "Unassigned" },
                ...options.assignees.map((a) => ({
                  value: a.id,
                  label: a.name,
                })),
              ]}
              onValueChange={(value) =>
                patch(
                  "requestedAssigneeId",
                  value === "unassigned" ? undefined : value,
                )
              }
            />
          </ControlField>
          <ControlField label="Promised date and time (UTC, optional)">
            <Input
              type="datetime-local"
              step={1}
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </ControlField>
          <ControlField label="Requested date and time (UTC, optional)">
            <Input
              type="datetime-local"
              step={1}
              value={requested}
              onChange={(e) => setRequested(e.target.value)}
            />
          </ControlField>
          <ControlField label="Service level">
            <SelectControl
              value={draft.serviceLevel ?? "standard"}
              options={[
                { value: "standard", label: "Standard" },
                { value: "express", label: "Express (Store settings apply)" },
              ]}
              onValueChange={(value) =>
                patch("serviceLevel", value as "standard" | "express")
              }
            />
          </ControlField>
          <ControlField label="Priority">
            <SelectControl
              value={draft.priority ?? "normal"}
              options={[
                { value: "normal", label: "Normal" },
                { value: "urgent", label: "Urgent" },
              ]}
              onValueChange={(value) =>
                patch("priority", value as "normal" | "urgent")
              }
            />
          </ControlField>
          <ControlField
            label={`Initial recorded payment (${currencyCode}, optional)`}
          >
            <Input
              inputMode="decimal"
              value={payment}
              maxLength={16}
              onChange={(e) => setPayment(e.target.value)}
            />
          </ControlField>
          {payment.trim() ? (
            <>
              <ControlField label="Payment method">
                <SelectControl
                  value={draft.initialPaymentMethod ?? "cash"}
                  options={[
                    { value: "cash", label: "Cash" },
                    { value: "bank_transfer", label: "Bank transfer" },
                    { value: "card", label: "Card" },
                    { value: "pos", label: "POS" },
                    { value: "other", label: "Other" },
                  ]}
                  onValueChange={(value) =>
                    patch(
                      "initialPaymentMethod",
                      value as ServiceIntakeAction["initialPaymentMethod"],
                    )
                  }
                />
              </ControlField>
              <ControlField label="Payment reference (optional)">
                <Input
                  value={draft.initialPaymentReference ?? ""}
                  maxLength={160}
                  onChange={(e) =>
                    text("initialPaymentReference", e.target.value)
                  }
                />
              </ControlField>
            </>
          ) : null}
        </FieldGroup>
        <p className="text-xs text-muted-foreground">
          Finance-backed receiving accounts and automatic customer reminders
          require the owning Order or Service form. No provider charge or
          message is made here.
        </p>
      </fieldset>
      {unresolved && !options.loading ? (
        <p role="alert">
          A saved service or assignee is unavailable. Choose a current option
          before reviewing.
        </p>
      ) : null}
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
        <Button type="submit" disabled={Boolean(blocked || unresolved)}>
          Save and review
        </Button>
      </div>
    </form>
  )
}
