"use client"

import {
  OrderPaymentAccount,
  useOrderPaymentAccountChoice,
} from "@/components/orders/order-payment-account"
import { invalidateServiceJobLists } from "@/components/service-work/invalidate-service-job-lists"
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

import { OpenMissingCatalogItem } from "@/components/general-assistant/open-missing-catalog-item"
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
import { setServiceIntakeDraft } from "@/hooks/use-service-intake-draft"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useTRPC } from "@/trpc/client"
import {
  type ServiceJobDraft,
  serviceNameKey,
} from "@ewatrade/assistant/general/contracts"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useMemo, useRef, useState } from "react"

import { ServiceInlinePicker } from "./service-inline-picker"
import {
  type IntakeLine,
  quoteAmountMinor,
  serviceCartSummary,
} from "./service-intake-model"

type StoreSummary = { currencyCode: string; id: string; name: string }

export function ServiceIntakeForm({
  canManage,
  store,
  initialDraft,
}: {
  canManage: boolean
  store: StoreSummary
  initialDraft?: ServiceJobDraft
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
        (offering) =>
          offering.pricingPolicy === "fixed" ||
          offering.pricingPolicy === "quote_required",
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
  const [draftLines, setLines] = useState<IntakeLine[]>(
    initialDraft?.lines.map((line) => ({
      offeringId: line.offeringId ?? "",
      quantity: line.quantity,
      ...(!line.offeringId
        ? { missingName: line.name, missingPrice: line.unitPriceMinor }
        : {}),
    })) ?? [],
  )
  // A service added from the draft card or form becomes available after normal catalog invalidation.
  const lines = draftLines.map((line) => {
    if (line.offeringId || !line.missingName) return line
    const key = serviceNameKey(line.missingName)
    const matches = offerings.filter((entry) => {
      const name = serviceNameKey(entry.displayName)
      return (
        name === key || name.startsWith(`${key} `) || name.endsWith(` ${key}`)
      )
    })
    return matches.length === 1
      ? { ...line, offeringId: matches[0]?.id ?? "" }
      : line
  })
  const [customer, setCustomer] = useState<OrderCustomerSelection | null>(
    initialDraft?.customer?.id ? initialDraft.customer : null,
  )
  const [newCustomer, setNewCustomer] = useState(
    Boolean(initialDraft?.customer && !initialDraft.customer.id),
  )
  const [customerName, setCustomerName] = useState(
    initialDraft?.customer?.name ?? "",
  )
  const [customerPhone, setCustomerPhone] = useState(
    initialDraft?.customer?.phone ?? "",
  )
  const [customerEmail, setCustomerEmail] = useState(
    initialDraft?.customer?.email ?? "",
  )
  const [dueAt, setDueAt] = useState("")
  const [instructions, setInstructions] = useState(
    [initialDraft?.notes, ...(initialDraft?.assumptions ?? [])]
      .filter(Boolean)
      .join("\n"),
  )
  const [conditionNote, setConditionNote] = useState("")
  const [urgent, setUrgent] = useState(false)
  const [express, setExpress] = useState(false)
  const [amountPaid, setAmountPaid] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<
    "bank_transfer" | "card" | "cash" | "other" | "pos"
  >("cash")
  const [paymentReference, setPaymentReference] = useState("")
  const paysNow = Boolean(amountPaid.trim()) && Number(amountPaid) > 0
  const account = useOrderPaymentAccountChoice({
    method: paymentMethod,
    enabled: paysNow,
  })
  const [notificationChannel, setNotificationChannel] = useState<
    "" | "sms" | "whatsapp"
  >(initialDraft ? "" : (settingsQuery.data.defaultNotificationChannel ?? ""))
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
  const [review, setReview] = useState(false)
  const [quoteScope, setQuoteScope] = useState(initialDraft?.notes ?? "")
  const [quoteResult, setQuoteResult] = useState<{
    requestId: string
    url: string | null
    state: string
  } | null>(null)
  const command = useRef({
    intakeId: crypto.randomUUID(),
    quoteId: crypto.randomUUID(),
    versionId: crypto.randomUUID(),
  })
  const submitting = useRef(false)
  const summary = serviceCartSummary(lines, offerings)
  const staffQuote = useMutation(
    trpc.serviceAccess.createStaffQuote.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: async (result) => {
        setServiceIntakeDraft(null)
        setQuoteResult({
          requestId: result.requestId,
          state: result.releaseState,
          url: result.token
            ? `${process.env.NEXT_PUBLIC_STOREFRONT_URL?.replace(/\/$/, "") ?? ""}/service-quote/${result.token}`
            : null,
        })
        await queryClient.invalidateQueries({
          queryKey: trpc.serviceAccess.requests.pathKey(),
        })
      },
      onSettled: () => {
        submitting.current = false
      },
    }),
  )

  const intakeMutation = useMutation(
    trpc.services.createAndConfirmIntake.mutationOptions({
      onSettled: () => {
        submitting.current = false
      },
      onError: (failure) => setError(failure.message),
      onSuccess: async () => {
        setServiceIntakeDraft(null)
        await Promise.all([
          invalidateServiceJobLists(queryClient, trpc),
          ...(initialDraft?.sourceAnswerId
            ? [
                queryClient.invalidateQueries(
                  trpc.services.assistantJobCard.pathFilter(),
                ),
              ]
            : []),
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
  const subtotalMinor = summary.totalMinor
  const serviceChargeMinor =
    !summary.needsQuote && express && settingsQuery.data.expressEnabled
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
    if (submitting.current) return
    if (!lines.length) {
      setError("Add at least one service.")
      return
    }
    if (summary.error) {
      setError(summary.error)
      return
    }
    if (summary.unknown) {
      setError("Enter an amount for each quote-required service.")
      return
    }
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
      !summary.needsQuote &&
      Math.round(Number(amountPaid || 0) * 100) > totalMinor
    ) {
      setError("The amount paid cannot exceed the order total.")
      return
    }
    if (paysNow && account.book && account.problem) {
      setError(account.problem)
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
    if (summary.needsQuote) {
      if (!canManage) {
        setError("A manager must prepare this quote.")
        return
      }
      if (!(customer?.name || customerName.trim())) {
        setError("Choose or enter the customer receiving this quote.")
        return
      }
      if (!quoteScope.trim()) {
        setError("Describe the agreed service scope.")
        return
      }
    }
    if (!review) {
      setReview(true)
      return
    }
    submitting.current = true
    if (summary.needsQuote) {
      staffQuote.mutate({
        clientQuoteId: command.current.quoteId,
        clientVersionId: command.current.versionId,
        storeId: store.id,
        customerId: customer?.id,
        customerName: customer?.name || customerName.trim() || undefined,
        customerPhone: customer?.phone || customerPhone.trim() || undefined,
        customerEmail: customer?.email || customerEmail.trim() || undefined,
        saveNewCustomer:
          newCustomer && !customer?.id && Boolean(customerName.trim()),
        customerNote: quoteScope.trim(),
        lines: lines.map((line) => {
          const choice = offerings.find(
            (choice) => choice.id === line.offeringId,
          )
          return {
            offeringId: line.offeringId,
            quantity: line.quantity,
            unitPriceMinor:
              choice?.pricingPolicy === "fixed"
                ? (choice.fixedPriceMinor ?? 0)
                : (quoteAmountMinor(line.quoteAmount) ?? 0),
          }
        }),
      })
      return
    }
    intakeMutation.mutate({
      clientIntakeId: command.current.intakeId,
      sourceAnswerId: initialDraft?.sourceAnswerId,
      sourceMessageId: initialDraft?.sourceMessageId,
      customerId: customer?.id,
      saveNewCustomer:
        newCustomer && !customer?.id && Boolean(customerName.trim()),
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
      initialPaymentMoneyAccountId: paysNow
        ? account.payloadAccountId
        : undefined,
      initialPaymentReference: paymentReference.trim() || undefined,
      lines: lines.map(({ offeringId, quantity }) => ({
        offeringId,
        quantity,
      })),
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

  const pending = intakeMutation.isPending || staffQuote.isPending
  if (quoteResult)
    return (
      <div className="grid gap-4">
        <p className="text-sm font-medium">
          {quoteResult.state === "released"
            ? "Quote ready to share"
            : "Quote awaiting release approval"}
        </p>
        <p className="text-sm text-muted-foreground">
          The customer accepts the released quote before an order and tracked
          work are created. Nothing is sent automatically.
        </p>
        {quoteResult.url ? (
          <>
            <Input readOnly aria-label="Quote link" value={quoteResult.url} />
            <a
              className="text-sm text-primary underline"
              href={quoteResult.url}
              target="_blank"
              rel="noreferrer"
            >
              Open customer quote
            </a>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Open the saved request to review the current quote or release
            status.
          </p>
        )}
        <Button
          type="button"
          onClick={() =>
            void setParams({
              serviceTab: "requests",
              requestId: quoteResult.requestId,
              jobStep: null,
              serviceSheet: "customer_request",
            })
          }
        >
          View saved request
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void setParams(null)}
        >
          Close
        </Button>
      </div>
    )
  if (review)
    return (
      <div className="grid gap-5">
        <Button
          type="button"
          variant="ghost"
          className="w-fit"
          disabled={pending}
          onClick={() => setReview(false)}
        >
          Back to services
        </Button>
        {error ? (
          <FormFeedback appearance="dashboard">{error}</FormFeedback>
        ) : null}
        <h3 className="font-medium">
          {summary.needsQuote ? "Review quote" : "Review order"}
        </h3>
        <p className="text-sm">
          Customer: {customer?.name || customerName || "Walk-in"}
        </p>
        <div className="divide-y divide-border border-y border-border">
          {lines.map((line) => {
            const choice = offerings.find(
              (choice) => choice.id === line.offeringId,
            )
            const price =
              choice?.pricingPolicy === "fixed"
                ? choice.fixedPriceMinor
                : quoteAmountMinor(line.quoteAmount)
            return (
              <div
                key={line.offeringId}
                className="flex justify-between gap-4 py-3 text-sm"
              >
                <span>
                  {choice?.displayName ?? "Unavailable service"} ×{" "}
                  {line.quantity}
                </span>
                <span>{formatPrice(price, store.currencyCode)} each</span>
              </div>
            )
          })}
        </div>
        <p className="font-medium">
          Total {formatPrice(totalMinor, store.currencyCode)}
        </p>
        {summary.needsQuote ? (
          <>
            <p className="whitespace-pre-wrap text-sm">{quoteScope}</p>
            <p className="text-sm text-muted-foreground">
              The proposed amounts apply to this quote. Customer acceptance
              creates the order and work.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {lines.some(
              (line) =>
                offerings.find((choice) => choice.id === line.offeringId)
                  ?.serviceWorkPolicy?.workPolicy === "TRACKED",
            )
              ? "Confirmation creates an order with tracked service work."
              : "Charge-only services create an order without a service job."}{" "}
            Payment received: {formatPrice(paidMinor, store.currencyCode)}.
          </p>
        )}
        <SubmitButton
          type="button"
          isSubmitting={pending}
          disabled={pending}
          onClick={submit}
        >
          {summary.needsQuote ? "Create quote link" : "Create order"}
        </SubmitButton>
      </div>
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
          const offering = offerings.find(
            (choice) => choice.pricingPolicy === "fixed",
          )
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
      <SheetSection title="Services and quantities">
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <ServiceInlinePicker
            offerings={offerings}
            lines={lines}
            onChange={setLines}
            canQuote={canManage}
          />
          <div className="grid min-w-0 gap-4">
            {lines.length ? (
              <div
                className="grid gap-3 border border-border p-4"
                aria-label="Selected services"
              >
                <h3 className="text-sm font-medium">
                  In this order · {lines.length}
                </h3>
                {lines.map((line, index) => {
                  const choice = offerings.find(
                    (choice) => choice.id === line.offeringId,
                  )
                  return (
                    <div
                      key={line.offeringId || `missing-${index}`}
                      className="grid gap-2 border-t border-border pt-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm">
                          {choice?.displayName ||
                            line.missingName ||
                            "Choose a service"}{" "}
                          × {line.quantity}
                        </p>
                        <Button
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                          aria-label={`Remove ${choice?.displayName || line.missingName}`}
                          onClick={() =>
                            setLines((current) =>
                              current.filter(
                                (_, position) => position !== index,
                              ),
                            )
                          }
                        >
                          <HugeiconsIcon
                            icon={Cancel01Icon}
                            aria-hidden="true"
                          />
                        </Button>
                      </div>
                      {choice?.pricingPolicy === "quote_required" ? (
                        <ControlField
                          label={`Quote per unit: ${choice.displayName}`}
                          description="For this job only. The catalog stays quote-required."
                        >
                          <MoneyInput
                            currencyCode={store.currencyCode}
                            value={line.quoteAmount ?? ""}
                            onChange={(event) =>
                              updateLine(index, {
                                quoteAmount: event.target.value,
                              })
                            }
                          />
                        </ControlField>
                      ) : null}
                      {!choice && line.missingName && initialDraft ? (
                        <OpenMissingCatalogItem
                          handoff={{
                            kind: "service",
                            name: line.missingName,
                            origin: initialDraft.origin,
                          }}
                          priceMinor={line.missingPrice}
                          onAdded={(choice) =>
                            updateLine(index, { offeringId: choice.offeringId })
                          }
                        />
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="grid gap-2 border border-dashed border-border p-4 text-sm text-muted-foreground">
                <h3 className="font-medium text-foreground">In this order</h3>
                <p>
                  Add services from the list. Quantities and any quote amounts
                  appear here.
                </p>
              </div>
            )}
            {summary.needsQuote ? (
              <ControlField
                label="Agreed service scope"
                description="What is included, the visit or work required, and any exclusions."
              >
                <Textarea
                  value={quoteScope}
                  onChange={(event) => setQuoteScope(event.target.value)}
                  maxLength={4000}
                />
              </ControlField>
            ) : null}
          </div>
        </div>
      </SheetSection>
      <SheetSection title="Customer" optional={!summary.needsQuote}>
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
              Added to Customers when you save this job.{" "}
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
              {summary.needsQuote
                ? "Choose a customer for this quote."
                : "Leave empty for a walk-in customer."}
            </p>
          </div>
        )}
      </SheetSection>
      {!summary.needsQuote ? (
        <details className="grid gap-4 border-t border-border pt-4">
          <summary className="cursor-pointer text-sm font-medium">
            Due date, team, notes and payment
          </summary>
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
            {paysNow ? <OrderPaymentAccount choice={account} /> : null}
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
        </details>
      ) : (
        <p className="text-sm text-muted-foreground">
          Due date, assignment and payments can be recorded on the job after
          quote acceptance.
        </p>
      )}
      <FormActions>
        <p className="mr-auto text-sm text-muted-foreground">
          {totalMinor > 0 || summary.unknown > 0 ? (
            <>
              {summary.unknown
                ? "Known subtotal"
                : summary.needsQuote
                  ? "Proposed quote"
                  : "Total"}{" "}
              <span className="font-medium text-foreground">
                {formatPrice(totalMinor, store.currencyCode)}
              </span>
              {summary.needsQuote
                ? " · Awaiting customer acceptance"
                : paidMinor > 0
                  ? ` · Still to pay ${formatPrice(Math.max(0, totalMinor - paidMinor), store.currencyCode)}`
                  : " · Paid later"}
            </>
          ) : null}
        </p>
        {summary.unknown ? (
          <p className="text-sm text-muted-foreground">
            {summary.unknown} quote amount still needed
          </p>
        ) : null}
        <SubmitButton
          type="button"
          isSubmitting={pending}
          disabled={pending || lines.length === 0}
          onClick={submit}
        >
          {summary.needsQuote ? "Review quote" : "Review order"}
        </SubmitButton>
      </FormActions>
    </FieldGroup>
  )
}
