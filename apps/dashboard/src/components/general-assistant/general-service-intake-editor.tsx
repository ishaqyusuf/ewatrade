"use client"
import { catalogOfferingDisplayName } from "@/components/service-work/service-utils"
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
import {
  type ServiceIntakeEditorContinuation,
  type ServiceIntakeEditorOffering,
  selectedServiceIntakeOfferings,
  serviceIntakeEditorReadState,
  serviceIntakeOfferingChoices,
} from "./service-intake-editor-options"

export type ServiceIntakeEditorProps = {
  initial: ServiceIntakeAction
  disabled: boolean
  currencyCode: string
  onSave: (value: ServiceIntakeAction) => void
  onCancel: () => void
}
export type ServiceIntakeEditorOptions = {
  offerings: ServiceIntakeEditorOffering[]
  assignees: Array<{ id: string; name: string }>
  customerName?: string
  loading?: boolean
  unavailable?: boolean
  paused?: boolean
  search?: string
  onSearchChange?: (value: string) => void
  onSearch?: () => void
  onNext?: () => void
  onFirst?: () => void
  onSelectedOfferingsChange?: (ids: string[]) => void
  onRetry?: () => void
}
export function GeneralServiceIntakeEditor(props: ServiceIntakeEditorProps) {
  const trpc = useTRPC()
  const [search, setSearch] = useState("")
  const [request, setRequest] = useState<ServiceIntakeEditorContinuation>({})
  const [selectedIds, setSelectedIds] = useState(
    props.initial.lines.map((line) => line.offeringId),
  )
  const [retained, setRetained] = useState<{
    scope: string
    offerings: ServiceIntakeEditorOffering[]
  }>({ scope: "", offerings: [] })
  const context = useQuery(
    trpc.tenant.current.queryOptions(undefined, { retry: false, staleTime: 0 }),
  )
  const contextReady = serviceIntakeEditorReadState([context]) === "ready"
  const storeId = contextReady ? context.data?.activeStore?.id : undefined
  const scope = `${context.data?.tenant.id}:${storeId}:${context.data?.membership.id}`
  const choices = useQuery(
    trpc.serviceAssistantIntake.options.queryOptions(request, {
      enabled: contextReady && Boolean(storeId),
      retry: false,
      staleTime: 0,
    }),
  )
  const customer = useQuery(
    trpc.customers.getById.queryOptions(
      { customerId: props.initial.customerId ?? "" },
      {
        enabled: contextReady && Boolean(storeId && props.initial.customerId),
        retry: false,
        staleTime: 0,
      },
    ),
  )
  const state = serviceIntakeEditorReadState([
    context,
    choices,
    ...(props.initial.customerId ? [customer] : []),
  ])
  const wrongStore = state === "ready" && choices.data?.storeId !== storeId
  const unavailable =
    state === "unavailable" || (contextReady && !storeId) || wrongStore
  const ready = state === "ready" && !unavailable
  const page: ServiceIntakeEditorOffering[] = ready
    ? (choices.data?.offerings ?? []).map((row) => ({
        id: row.offeringId,
        name: catalogOfferingDisplayName(
          row.itemName,
          row.variantName,
          row.offeringName,
        ),
        priceMinor: row.fixedPriceMinor,
        workPolicy: row.service?.workPolicy ?? "unknown",
      }))
    : []
  const offerings = ready
    ? [
        ...new Map(
          [
            ...selectedServiceIntakeOfferings(
              retained.scope === scope ? retained.offerings : [],
              selectedIds,
            ),
            ...page,
          ].map((row) => [row.id, row]),
        ).values(),
      ]
    : []
  const navigate = (next: ServiceIntakeEditorContinuation) => {
    if (!ready) return
    setRetained({
      scope,
      offerings: selectedServiceIntakeOfferings(offerings, selectedIds),
    })
    setRequest(next)
  }
  const continuation = ready ? choices.data?.continuation : null
  return (
    <GeneralServiceIntakeEditorView
      {...props}
      options={{
        offerings,
        assignees: ready ? (choices.data?.assignees ?? []) : [],
        customerName: ready ? customer.data?.name : undefined,
        loading: state === "loading" && !unavailable,
        unavailable,
        paused: state === "paused",
        search,
        onSearchChange: setSearch,
        onSearch: () => navigate({ query: search.trim() || undefined }),
        onFirst: () => navigate({ query: request.query }),
        onNext: continuation ? () => navigate(continuation) : undefined,
        onSelectedOfferingsChange: setSelectedIds,
        onRetry: () => {
          void context.refetch()
          if (contextReady && storeId) {
            void choices.refetch()
            if (props.initial.customerId) void customer.refetch()
          }
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
  const blocked =
    disabled || options.loading || options.unavailable || options.paused
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
  ) => {
    setDraft((current) => ({ ...current, [key]: value }))
    if (key === "lines")
      options.onSelectedOfferingsChange?.(
        (value as ServiceIntakeAction["lines"]).map((line) => line.offeringId),
      )
  }
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
      ) : options.unavailable || options.paused ? (
        <div role="alert">
          <p>
            {options.paused
              ? "Reconnect to load current intake choices."
              : "Current intake choices are unavailable."}
          </p>
          <Button type="button" variant="outline" onClick={options.onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
      {!options.loading && !options.unavailable && !options.paused ? (
        <fieldset disabled={Boolean(blocked)} className="grid gap-5">
          {options.onSearch ? (
            <div className="grid gap-2">
              <ControlField label="Find services">
                <Input
                  value={options.search ?? ""}
                  maxLength={160}
                  placeholder="Search by service name"
                  onChange={(event) =>
                    options.onSearchChange?.(event.target.value)
                  }
                />
              </ControlField>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={options.onSearch}
                >
                  Search
                </Button>
                <Button type="button" variant="ghost" onClick={options.onFirst}>
                  First page
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!options.onNext}
                  onClick={options.onNext}
                >
                  Next choices
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Choices are paged. Search or continue to find another service;
                selected services stay in the draft. Confirmation rechecks
                availability.
              </p>
            </div>
          ) : null}
          <FieldGroup>
            {initial.customerId ? (
              <p className="text-sm">
                Saved customer: {options.customerName ?? "Unavailable"}. Ask for
                a new draft to choose another customer.
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
                    options={serviceIntakeOfferingChoices(
                      options.offerings,
                      line.offeringId,
                    )}
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
                  ...(draft.requestedAssigneeId &&
                  !options.assignees.some(
                    (assignee) => assignee.id === draft.requestedAssigneeId,
                  )
                    ? [
                        {
                          value: draft.requestedAssigneeId,
                          label: "Selected assignee is unavailable",
                        },
                      ]
                    : []),
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
      ) : null}
      {unresolved &&
      !options.loading &&
      !options.unavailable &&
      !options.paused ? (
        <p role="alert">
          A selected service or assignee is outside these choices or
          unavailable. Search or continue to find it, or explicitly choose a
          current option before reviewing.
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
