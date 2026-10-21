"use client"
import {
  Button,
  Checkbox,
  CheckboxField,
  ControlField,
  DateControl,
  FieldGroup,
  FieldLabel,
  FormActions,
  Input,
  MoneyInput,
  SelectControl,
  SubmitButton,
  Textarea,
  Field as UiField,
} from "@ewatrade/ui"

import { FormFeedback } from "@/components/forms/form-feedback"
import { OrderCustomerPicker } from "@/components/orders/order-customer-picker"
import {
  type OrderCustomerSelection,
  customerDraftFromSearch,
} from "@/components/orders/order-customer-search"

import {
  createCustomerFixture,
  createServiceFixture,
} from "@/components/qa/fixture-recipes"
import { QaDashboardQuickFill } from "@/components/qa/qa-quick-fill"
import {
  ChoiceButtons,
  SheetSection,
} from "@/components/service-work/choice-buttons"
import {
  flattenServiceOfferings,
  formatPrice,
} from "@/components/service-work/service-utils"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useTRPC } from "@/trpc/client"
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useMemo, useRef, useState } from "react"

type StoreSummary = { currencyCode: string; id: string; name: string }
type IntakeLine = { offeringId: string; quantity: string }

export function ServiceIntakeForm({
  canManage,
  store,
}: {
  canManage: boolean
  store: StoreSummary
}) {
  const router = useRouter()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { setParams } = useServiceWorkParams()
  const { data: items } = useSuspenseQuery(
    trpc.catalog.listItems.queryOptions({ kind: "service" }, { retry: false }),
  )
  const offerings = useMemo(
    () =>
      flattenServiceOfferings(items, store.id).filter(
        (offering) => offering.pricingPolicy === "fixed",
      ),
    [items, store.id],
  )
  const settingsQuery = useSuspenseQuery(
    trpc.services.getSettings.queryOptions(
      { storeId: store.id },
      { retry: false },
    ),
  )
  const assigneesQuery = useQuery(
    trpc.services.assignees.queryOptions(undefined, {
      enabled: canManage,
      retry: false,
    }),
  )
  const [lines, setLines] = useState<IntakeLine[]>([
    { offeringId: "", quantity: "" },
  ])
  const [customer, setCustomer] = useState<OrderCustomerSelection | null>(null)
  const [newCustomer, setNewCustomer] = useState(false)
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [dueAt, setDueAt] = useState("")
  const [instructions, setInstructions] = useState("")
  const [conditionNote, setConditionNote] = useState("")
  const [urgent, setUrgent] = useState(false)
  const [express, setExpress] = useState(false)
  const [amountPaid, setAmountPaid] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<
    "bank_transfer" | "card" | "cash" | "other" | "pos"
  >("cash")
  const [paymentReference, setPaymentReference] = useState("")
  const [notificationChannel, setNotificationChannel] = useState<
    "" | "sms" | "whatsapp"
  >(settingsQuery.data.defaultNotificationChannel ?? "")
  const [assigneeId, setAssigneeId] = useState("")
  const [showDetails, setShowDetails] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const quickFillSnapshot = useRef<{
    customerEmail: string
    customerName: string
    customerPhone: string
    dueAt: string
    instructions: string
    lines: IntakeLine[]
  } | null>(null)
  const [canUndoQuickFill, setCanUndoQuickFill] = useState(false)
  const intakeMutation = useMutation(
    trpc.services.createAndConfirmIntake.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.services.queue.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.services.queuePage.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.orders.list.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.orders.listPage.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.orders.reportSummary.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.tenant.featureAvailability.queryKey(),
          }),
        ])
        setParams(null)
        router.refresh()
      },
    }),
  )
  const subtotalMinor = lines.reduce((total, line) => {
    const offering = offerings.find((entry) => entry.id === line.offeringId)
    const quantity = Number(line.quantity)
    return offering &&
      offering.fixedPriceMinor !== null &&
      Number.isFinite(quantity)
      ? total + offering.fixedPriceMinor * quantity
      : total
  }, 0)
  const serviceChargeMinor =
    express && settingsQuery.data.expressEnabled
      ? settingsQuery.data.expressSurchargeType === "fixed"
        ? settingsQuery.data.expressSurchargeValue
        : Math.round(
            (subtotalMinor * settingsQuery.data.expressSurchargeValue) / 10_000,
          )
      : 0
  const totalMinor = subtotalMinor + serviceChargeMinor
  const updateLine = (index: number, patch: Partial<IntakeLine>) =>
    setLines((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    )

  function submit() {
    setError(null)
    if (lines.some((line) => !line.offeringId)) {
      setError("Choose a service for each line, or remove the empty line.")
      return
    }
    if (
      lines.some((line) => {
        const quantity = Number(line.quantity)
        return (
          !line.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0
        )
      })
    ) {
      setError("Enter how many for each service, like 1 or 300.")
      return
    }
    if (
      amountPaid.trim() &&
      (!Number.isFinite(Number(amountPaid)) || Number(amountPaid) < 0)
    ) {
      setError("Enter the amount paid now like 5000, or leave it empty.")
      return
    }
    if (
      newCustomer &&
      !customer &&
      !customerName.trim() &&
      !customerPhone.trim()
    ) {
      setError(
        "Enter the new customer’s name or phone, or search saved customers.",
      )
      return
    }
    intakeMutation.mutate({
      clientIntakeId: crypto.randomUUID(),
      conditionNote: conditionNote.trim() || undefined,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      customerEmail: customerEmail.trim() || undefined,
      dueCommitmentAt: dueAt ? new Date(dueAt) : undefined,
      instructions: instructions.trim() || undefined,
      initialPaymentMethod:
        amountPaid.trim() && Number(amountPaid) > 0 ? paymentMethod : undefined,
      initialPaymentMinor: amountPaid.trim()
        ? Math.round(Number(amountPaid) * 100)
        : 0,
      initialPaymentReference: paymentReference.trim() || undefined,
      lines,
      notificationChannel: notificationChannel || undefined,
      priority: urgent ? "urgent" : "normal",
      requestedAssigneeId: assigneeId || undefined,
      schemaVersion: 1,
      serviceLevel: express ? "express" : "standard",
      storeId: store.id,
    })
  }

  const paidMinor = amountPaid.trim() ? Math.round(Number(amountPaid) * 100) : 0
  const optional = (
    <span className="font-normal text-muted-foreground">Optional</span>
  )

  return (
    <FieldGroup className="grid gap-5">
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
      <QaDashboardQuickFill
        canUndo={canUndoQuickFill}
        formId="dashboard.service.intake"
        isDirty={
          lines.some((line) => line.offeringId) ||
          Boolean(
            customerEmail ||
              customerName ||
              customerPhone ||
              dueAt ||
              instructions,
          )
        }
        onFill={(context, sequence) => {
          const offering = offerings[0]
          if (!offering) {
            setError("Add a service with a fixed price before filling this.")
            return
          }
          quickFillSnapshot.current = {
            customerEmail,
            customerName,
            customerPhone,
            dueAt,
            instructions,
            lines,
          }
          const service = createServiceFixture(context, sequence)
          const customer = createCustomerFixture(context, sequence)
          setLines([{ offeringId: offering.id, quantity: "1" }])
          setCustomer(null)
          setNewCustomer(true)
          setCustomerEmail(customer.email)
          setCustomerName(service.customerName)
          setCustomerPhone(service.customerPhone)
          setDueAt(service.dueAt.toISOString().slice(0, 16))
          setInstructions(service.description)
          setNotificationChannel("")
          setShowDetails(true)
          setCanUndoQuickFill(true)
          setError(null)
        }}
        onUndo={() => {
          if (!quickFillSnapshot.current) return
          setCustomerEmail(quickFillSnapshot.current.customerEmail)
          setCustomerName(quickFillSnapshot.current.customerName)
          setCustomerPhone(quickFillSnapshot.current.customerPhone)
          setDueAt(quickFillSnapshot.current.dueAt)
          setInstructions(quickFillSnapshot.current.instructions)
          setLines(quickFillSnapshot.current.lines)
          quickFillSnapshot.current = null
          setCanUndoQuickFill(false)
        }}
      />
      <SheetSection title="What work?">
        {lines.map((line, index) => {
          const offering = offerings.find(
            (entry) => entry.id === line.offeringId,
          )
          const quantity = Number(line.quantity)
          const amount =
            offering?.fixedPriceMinor != null &&
            Number.isFinite(quantity) &&
            quantity > 0
              ? offering.fixedPriceMinor * quantity
              : null
          return (
            <div
              key={`line-${index + 1}`}
              className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_110px_100px_auto] sm:items-center"
            >
              <SelectControl
                aria-label={`Service ${index + 1}`}
                value={line.offeringId}
                onValueChange={(value) =>
                  updateLine(index, { offeringId: value })
                }
                options={[
                  { value: "", label: <>Choose a service</> },
                  ...offerings.map((entry) => ({
                    value: entry.id,
                    label: (
                      <>
                        {entry.displayName} ·{" "}
                        {formatPrice(entry.fixedPriceMinor, entry.currencyCode)}
                      </>
                    ),
                  })),
                ]}
              />
              <Input
                aria-label={`How many, service ${index + 1}`}
                inputMode="decimal"
                placeholder="How many"
                value={line.quantity}
                onChange={(event) =>
                  updateLine(index, { quantity: event.target.value })
                }
              />
              <span className="text-right text-sm font-medium tabular-nums max-sm:col-start-1 max-sm:row-start-2 max-sm:text-left">
                {amount === null
                  ? "—"
                  : formatPrice(amount, store.currencyCode)}
              </span>
              {lines.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove service ${index + 1}`}
                  onClick={() =>
                    setLines((current) =>
                      current.filter((_, entryIndex) => entryIndex !== index),
                    )
                  }
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                </Button>
              ) : (
                <span className="hidden sm:block sm:w-8" />
              )}
            </div>
          )
        })}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 text-primary"
            disabled={offerings.length === 0}
            onClick={() =>
              setLines((current) => [
                ...current,
                { offeringId: "", quantity: "" },
              ])
            }
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            Add another service
          </Button>
          <p className="text-xs text-muted-foreground">
            {offerings.length === 0
              ? "No services with a fixed price yet. Add one in Catalog."
              : "Services that need a price first start from Customer requests."}
          </p>
        </div>
      </SheetSection>
      <SheetSection title="Customer" optional>
        {customer ? (
          <div className="flex items-center justify-between gap-3 border border-border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {customer.name || customer.phone}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[customer.phone, customer.email].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCustomer(null)}
            >
              Change customer
            </Button>
          </div>
        ) : newCustomer ? (
          <div className="grid gap-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <ControlField label="Name">
                <Input
                  value={customerName}
                  placeholder="e.g. Ngozi Eze"
                  onChange={(event) => setCustomerName(event.target.value)}
                />
              </ControlField>
              <ControlField label={<>Phone {optional}</>}>
                <Input
                  inputMode="tel"
                  value={customerPhone}
                  placeholder="0803 000 0000"
                  onChange={(event) => setCustomerPhone(event.target.value)}
                />
              </ControlField>
            </div>
            <p className="text-xs text-muted-foreground">
              New customer.{" "}
              <button
                type="button"
                className="font-medium text-primary"
                onClick={() => {
                  setNewCustomer(false)
                  setCustomerName("")
                  setCustomerPhone("")
                  setCustomerEmail("")
                }}
              >
                Search saved customers instead
              </button>
            </p>
          </div>
        ) : (
          <div className="grid gap-1.5">
            <OrderCustomerPicker
              selected={null}
              customerDirectory
              storeId={store.id}
              onSelect={(selection) => {
                setCustomer(selection)
                setCustomerName(selection?.name ?? "")
                setCustomerPhone(selection?.phone ?? "")
                setCustomerEmail(selection?.email ?? "")
              }}
              onCreate={(search) => {
                const draft = customerDraftFromSearch(search)
                setCustomerName(draft.name)
                setCustomerPhone(draft.phone)
                setCustomerEmail("")
                setNewCustomer(true)
              }}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty for a walk-in customer.
            </p>
          </div>
        )}
      </SheetSection>
      <SheetSection title="When and who">
        <div className="grid gap-3 sm:grid-cols-2">
          <ControlField
            label={<>Due {optional}</>}
            description="When you told the customer it will be done."
          >
            <DateControl
              type="datetime-local"
              value={dueAt}
              onValueChange={(value) => setDueAt(value)}
            />
          </ControlField>
          {canManage ? (
            <ControlField label={<>Who will do it {optional}</>}>
              <SelectControl
                value={assigneeId}
                onValueChange={(value) => setAssigneeId(value)}
                options={[
                  { value: "", label: <>Not assigned yet</> },
                  ...(assigneesQuery.data?.map((person) => ({
                    value: person.id,
                    label: person.name,
                  })) ?? []),
                ]}
              />
            </ControlField>
          ) : null}
        </div>
        <CheckboxField
          label={
            <span>
              <span className="block font-medium">Urgent</span>
              <span className="text-muted-foreground">
                Shows first in the list
              </span>
            </span>
          }
        >
          <Checkbox
            checked={urgent}
            onCheckedChange={(checked) => setUrgent(checked)}
          />
        </CheckboxField>
        {settingsQuery.data.expressEnabled ? (
          <CheckboxField
            label={
              <span>
                <span className="block font-medium">
                  {settingsQuery.data.expressLabel}
                </span>
                <span className="text-muted-foreground">
                  {settingsQuery.data.expressSurchargeType === "fixed"
                    ? `${formatPrice(
                        settingsQuery.data.expressSurchargeValue,
                        store.currencyCode,
                      )} extra`
                    : `${settingsQuery.data.expressSurchargeValue / 100}% extra`}
                </span>
              </span>
            }
          >
            <Checkbox
              checked={express}
              onCheckedChange={(checked) => setExpress(checked)}
            />
          </CheckboxField>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit text-primary"
          aria-expanded={showDetails}
          onClick={() => setShowDetails((value) => !value)}
        >
          {showDetails ? "Hide notes" : "Add notes for the team"}
        </Button>
        {showDetails ? (
          <div className="grid gap-3">
            <ControlField label={<>What to do {optional}</>}>
              <Textarea
                value={instructions}
                placeholder="e.g. Vaccinate the layer pen first"
                onChange={(event) => setInstructions(event.target.value)}
              />
            </ControlField>
            <ControlField label={<>How it came in {optional}</>}>
              <Textarea
                value={conditionNote}
                placeholder="e.g. 3 birds look weak"
                onChange={(event) => setConditionNote(event.target.value)}
              />
            </ControlField>
          </div>
        ) : null}
      </SheetSection>
      <SheetSection title="Payment now">
        <div className="grid gap-3 sm:grid-cols-2">
          <UiField className="gap-1.5">
            <FieldLabel htmlFor={`service-intake-payment-${store.id}`}>
              Amount paid now {optional}
            </FieldLabel>
            <MoneyInput
              id={`service-intake-payment-${store.id}`}
              currencyCode={store.currencyCode}
              inputMode="decimal"
              value={amountPaid}
              onChange={(event) => setAmountPaid(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {totalMinor > 0
                ? `Total ${formatPrice(totalMinor, store.currencyCode)}. Leave empty if they pay later.`
                : "Leave empty if they pay later."}
            </p>
          </UiField>
          <ControlField label="Paid by">
            <SelectControl
              value={paymentMethod}
              onValueChange={(value) =>
                setPaymentMethod(value as typeof paymentMethod)
              }
              options={[
                { value: "cash", label: <>Cash</> },
                { value: "bank_transfer", label: <>Bank transfer</> },
                { value: "pos", label: <>POS</> },
                { value: "card", label: <>Card</> },
                { value: "other", label: <>Other</> },
              ]}
            />
          </ControlField>
        </div>
        {amountPaid.trim() ? (
          <ControlField label={<>Reference {optional}</>}>
            <Input
              placeholder="e.g. bank transfer ID"
              value={paymentReference}
              onChange={(event) => setPaymentReference(event.target.value)}
            />
          </ControlField>
        ) : null}
        <ControlField label="Send the customer updates by">
          <ChoiceButtons
            label="Send the customer updates by"
            value={notificationChannel || "none"}
            onChange={(value) =>
              setNotificationChannel(value === "none" ? "" : value)
            }
            options={[
              { value: "whatsapp", label: "WhatsApp" },
              { value: "sms", label: "SMS" },
              { value: "none", label: "Don’t send" },
            ]}
          />
        </ControlField>
      </SheetSection>
      <FormActions>
        <p className="mr-auto text-sm text-muted-foreground">
          {totalMinor > 0 ? (
            <>
              Total{" "}
              <span className="font-medium text-foreground">
                {formatPrice(totalMinor, store.currencyCode)}
              </span>
              {paidMinor > 0
                ? ` · Still to pay ${formatPrice(Math.max(0, totalMinor - paidMinor), store.currencyCode)}`
                : " · Paid later"}
            </>
          ) : null}
        </p>
        <SubmitButton
          type="button"
          isSubmitting={intakeMutation.isPending}
          disabled={intakeMutation.isPending}
          onClick={submit}
        >
          {intakeMutation.isPending ? "Creating…" : "Create job"}
        </SubmitButton>
      </FormActions>
    </FieldGroup>
  )
}
