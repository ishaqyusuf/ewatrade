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

import {
  createCustomerFixture,
  createServiceFixture,
} from "@/components/qa/fixture-recipes"
import { QaDashboardQuickFill } from "@/components/qa/qa-quick-fill"
import {
  flattenServiceOfferings,
  formatMoney,
} from "@/components/service-work/service-utils"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useTRPC } from "@/trpc/client"

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

const fieldClass =
  "h-10 w-full scroll-mt-24 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
const areaClass = `${fieldClass} min-h-24 py-2`

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
  const [lines, setLines] = useState<IntakeLine[]>([])
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [requestedAt, setRequestedAt] = useState("")
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

  function submit() {
    setError(null)
    if (
      lines.length === 0 ||
      lines.some((line) => !line.offeringId || !line.quantity.trim())
    ) {
      setError("Select at least one Service and enter its quantity.")
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
      requestedAt: requestedAt ? new Date(requestedAt) : undefined,
      schemaVersion: 1,
      serviceLevel: express ? "express" : "standard",
      storeId: store.id,
    })
  }

  return (
    <FieldGroup className="grid gap-5">
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
      <QaDashboardQuickFill
        canUndo={canUndoQuickFill}
        formId="dashboard.service.intake"
        isDirty={
          lines.length > 0 ||
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
            setError(
              "Add an eligible fixed-price Service before filling this draft.",
            )
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
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Items</h3>
          <Button
            appearance="form"
            type="button"
            variant="outline"
            size="sm"
            disabled={offerings.length === 0}
            onClick={() =>
              setLines((current) => [
                ...current,
                { offeringId: offerings[0]?.id ?? "", quantity: "1" },
              ])
            }
          >
            Add item
          </Button>
        </div>
        {lines.map((line, index) => (
          <div
            key={`${index}-${line.offeringId}`}
            className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_88px_auto]"
          >
            <SelectControl
              aria-label={`Service item ${index + 1}`}
              value={line.offeringId}
              onValueChange={(value) =>
                setLines((current) =>
                  current.map((entry, entryIndex) =>
                    entryIndex === index
                      ? { ...entry, offeringId: value }
                      : entry,
                  ),
                )
              }
              options={[
                { value: "", label: <>Choose Service</> },
                ...(offerings.map((offering) => ({
                  value: offering.id,
                  label: (
                    <>
                      {offering.displayName} ·{" "}
                      {formatMoney(
                        offering.fixedPriceMinor,
                        offering.currencyCode,
                      )}
                    </>
                  ),
                })) ?? []),
              ]}
            />
            <Input
              aria-label={`Quantity ${index + 1}`}
              inputMode="decimal"
              value={line.quantity}
              onChange={(event) =>
                setLines((current) =>
                  current.map((entry, entryIndex) =>
                    entryIndex === index
                      ? { ...entry, quantity: event.target.value }
                      : entry,
                  ),
                )
              }
            />
            <Button
              appearance="form"
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setLines((current) =>
                  current.filter((_, entryIndex) => entryIndex !== index),
                )
              }
            >
              Remove
            </Button>
          </div>
        ))}
        {lines.length === 0 ? (
          <p className="rounded-lg bg-muted px-3 py-4 text-sm text-muted-foreground">
            Add fixed-price Services. Quote-required work starts from a Request.
          </p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <ControlField
          label={
            <>
              Customer name{" "}
              <span className="font-normal text-muted-foreground">
                Optional
              </span>
            </>
          }
        >
          <Input
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
          />
        </ControlField>
        <ControlField
          label={
            <>
              Email{" "}
              <span className="font-normal text-muted-foreground">
                Optional
              </span>
            </>
          }
        >
          <Input
            onChange={(event) => setCustomerEmail(event.target.value)}
            type="email"
            value={customerEmail}
          />
        </ControlField>
        <ControlField
          label={
            <>
              Phone{" "}
              <span className="font-normal text-muted-foreground">
                Optional
              </span>
            </>
          }
        >
          <Input
            inputMode="tel"
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value)}
          />
        </ControlField>
      </div>
      {settingsQuery.data.expressEnabled ? (
        <CheckboxField
          label=<span>
            <span className="block font-medium">
              {settingsQuery.data.expressLabel}
            </span>
            <span className="text-muted-foreground">
              {settingsQuery.data.expressSurchargeType === "fixed"
                ? formatMoney(
                    settingsQuery.data.expressSurchargeValue,
                    store.currencyCode,
                  )
                : `${settingsQuery.data.expressSurchargeValue / 100}% surcharge`}
            </span>
          </span>
        >
          <Checkbox
            checked={express}
            onCheckedChange={(checked) => setExpress(checked)}
          />
        </CheckboxField>
      ) : null}
      <section className="grid gap-3 border-b border-border pb-5">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatMoney(subtotalMinor, store.currencyCode)}</span>
        </div>
        {serviceChargeMinor > 0 ? (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Express</span>
            <span>{formatMoney(serviceChargeMinor, store.currencyCode)}</span>
          </div>
        ) : null}
        <div className="flex justify-between font-medium">
          <span>Total</span>
          <span>{formatMoney(totalMinor, store.currencyCode)}</span>
        </div>
      </section>
      <button
        type="button"
        className="w-fit text-left text-sm font-medium text-primary"
        onClick={() => setShowDetails((value) => !value)}
      >
        {showDetails ? "Hide details" : "Add timing, instructions, or priority"}
      </button>
      {showDetails ? (
        <div className="grid gap-4 border-t border-border pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <ControlField label={<>Customer requested</>}>
              <DateControl
                type="datetime-local"
                value={requestedAt}
                onValueChange={(value) => setRequestedAt(value)}
              />
            </ControlField>
            <ControlField label={<>Promised delivery</>}>
              <DateControl
                type="datetime-local"
                value={dueAt}
                onValueChange={(value) => setDueAt(value)}
              />
            </ControlField>
          </div>
          <ControlField label={<>Instructions</>}>
            <Textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </ControlField>
          <ControlField label={<>Condition at intake</>}>
            <Textarea
              value={conditionNote}
              onChange={(event) => setConditionNote(event.target.value)}
            />
          </ControlField>
          <CheckboxField label={<>Mark urgent</>}>
            <Checkbox
              checked={urgent}
              onCheckedChange={(checked) => setUrgent(checked)}
            />
          </CheckboxField>
          {canManage ? (
            <ControlField label={<>Assign to</>}>
              <SelectControl
                value={assigneeId}
                onValueChange={(value) => setAssigneeId(value)}
                options={[
                  { value: "", label: <>Leave unassigned</> },
                  ...(assigneesQuery.data?.map((person) => ({
                    value: person.id,
                    label: person.name,
                  })) ?? []),
                ]}
              />
            </ControlField>
          ) : null}
        </div>
      ) : null}
      <section className="grid gap-4 border-t border-border pt-5">
        <div>
          <h3 className="font-medium">Payment</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Leave the amount empty to collect the full balance on delivery.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <UiField className="gap-1.5">
            <FieldLabel htmlFor={`service-intake-payment-${store.id}`}>
              Amount paid now ({store.currencyCode})
            </FieldLabel>
            <MoneyInput
              id={`service-intake-payment-${store.id}`}
              currencyCode={store.currencyCode}
              inputMode="decimal"
              value={amountPaid}
              onChange={(event) => setAmountPaid(event.target.value)}
            />
          </UiField>
          <ControlField label={<>Method</>}>
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
        <Input
          placeholder="Payment reference (optional)"
          value={paymentReference}
          onChange={(event) => setPaymentReference(event.target.value)}
        />
      </section>
      <ControlField label={<>Customer updates</>}>
        <SelectControl
          value={notificationChannel}
          onValueChange={(value) =>
            setNotificationChannel(value as typeof notificationChannel)
          }
          options={[
            { value: "", label: <>No automatic updates</> },
            { value: "sms", label: <>SMS</> },
            { value: "whatsapp", label: <>WhatsApp</> },
          ]}
        />
      </ControlField>
      <FormActions>
        <SubmitButton
          type="button"
          isSubmitting={intakeMutation.isPending}
          disabled={intakeMutation.isPending || lines.length === 0}
          onClick={submit}
        >
          {intakeMutation.isPending ? "Creating…" : "Create service order"}
        </SubmitButton>
      </FormActions>
    </FieldGroup>
  )
}
