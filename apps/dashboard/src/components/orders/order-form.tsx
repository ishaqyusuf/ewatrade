"use client"
import {
  Button,
  Checkbox,
  CheckboxField,
  ControlField,
  FieldGroup,
  FormActions,
  Input,
  SelectControl,
  SubmitButton,
} from "@ewatrade/ui"
import {
  type CatalogFreeLineDraft,
  catalogFreeLinesError,
  catalogFreeOrderLines,
} from "@ewatrade/utils/catalog-free-lines"

import { OrderCatalogFreeLines } from "./order-catalog-free-lines"
import { customerDraftFromSearch } from "./order-customer-search"
import {
  type OrderDraftLine,
  availableOrderOfferings,
  buildOrderLines,
  makeOrderDraftLine,
  orderLinesTotalMinor,
  orderMoney,
} from "./order-draft"
import { OrderItemPicker } from "./order-item-picker"
import { OrderItemRow } from "./order-item-row"

import { FormFeedback } from "@/components/forms/form-feedback"

import { createOrderFixture } from "@/components/qa/fixture-recipes"
import { QaDashboardQuickFill } from "@/components/qa/qa-quick-fill"
import { useOrderParams } from "@/hooks/use-order-params"
import { useTRPC } from "@/trpc/client"

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useMemo, useRef, useState } from "react"
import {
  OrderCustomerPicker,
  type OrderCustomerSelection,
} from "./order-customer-picker"

type StoreSummary = { currencyCode: string; id: string; name: string }
type PaymentMethod = "cash" | "bank_transfer" | "pos" | "card" | "other"

const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "pos", label: "POS" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
]

/** Catalog lines first, then typed-price lines; throws a readable message. */
function buildAllOrderLines(
  drafts: OrderDraftLine[],
  offerings: ReturnType<typeof availableOrderOfferings>,
  catalogFreeLines: CatalogFreeLineDraft[],
) {
  if (!drafts.length && !catalogFreeLines.length)
    throw new Error("Add an item, or type a price to sell without the catalog.")
  const catalogFreeError = catalogFreeLinesError(catalogFreeLines)
  if (catalogFreeError) throw new Error(catalogFreeError)
  return [
    ...(drafts.length ? buildOrderLines(drafts, offerings) : []),
    ...catalogFreeOrderLines(catalogFreeLines),
  ]
}

export function OrderForm({
  store,
  customerDirectory = true,
}: { store: StoreSummary; customerDirectory?: boolean }) {
  const router = useRouter()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { setParams } = useOrderParams()
  const { data: items } = useSuspenseQuery(
    trpc.catalog.listItems.queryOptions({}, { retry: false }),
  )
  const [drafts, setDrafts] = useState<OrderDraftLine[]>([])
  const [catalogFreeLines, setCatalogFreeLines] = useState<
    CatalogFreeLineDraft[]
  >([])
  const [fulfillNow, setFulfillNow] = useState(false)
  const [paidInFull, setPaidInFull] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")
  const [customerName, setCustomerName] = useState("")
  const [selectedCustomer, setSelectedCustomer] =
    useState<OrderCustomerSelection | null>(null)
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [showCustomer, setShowCustomer] = useState(false)
  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const [customerSearch, setCustomerSearch] = useState("")
  const [error, setError] = useState<string | null>(null)
  const quickFillSnapshot = useRef<{
    selectedCustomer: OrderCustomerSelection | null
    customerEmail: string
    customerName: string
    customerPhone: string
    drafts: OrderDraftLine[]
    showCustomer: boolean
    creatingCustomer: boolean
    customerSearch: string
  } | null>(null)
  const submission = useRef<{ payload: string; id: string } | null>(null)
  const [canUndoQuickFill, setCanUndoQuickFill] = useState(false)
  const offerings = useMemo(
    () => availableOrderOfferings(items, store.id),
    [items, store.id],
  )
  const totalMinor = useMemo(() => {
    try {
      return orderLinesTotalMinor(
        buildAllOrderLines(drafts, offerings, catalogFreeLines),
      )
    } catch {
      return null
    }
  }, [catalogFreeLines, drafts, offerings])
  const createMutation = useMutation(
    trpc.orders.create.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            refetchType: "none",
            queryKey: trpc.orders.list.queryKey(),
          }),
          queryClient.invalidateQueries({
            refetchType: "none",
            queryKey: trpc.orders.listPage.pathKey(),
          }),
          queryClient.invalidateQueries({
            refetchType: "none",
            queryKey: trpc.customers.listPage.pathKey(),
          }),
          queryClient.invalidateQueries({
            refetchType: "none",
            queryKey: trpc.catalog.pathKey(),
          }),
          queryClient.invalidateQueries({
            refetchType: "none",
            queryKey: trpc.inventory.pathKey(),
          }),
          queryClient.invalidateQueries({
            refetchType: "none",
            queryKey: trpc.orders.reportSummary.queryKey(),
          }),
          queryClient.invalidateQueries({
            refetchType: "none",
            queryKey: trpc.tenant.featureAvailability.queryKey(),
          }),
        ])
        setParams({ orderSheet: null })
        router.refresh()
      },
    }),
  )

  function submit() {
    setError(null)
    if (creatingCustomer && !customerName.trim()) {
      setError("Enter a name for the new customer.")
      return
    }
    let lines: ReturnType<typeof buildAllOrderLines>
    try {
      lines = buildAllOrderLines(drafts, offerings, catalogFreeLines)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Check the selected items.",
      )
      return
    }
    const paidMinor = paidInFull ? orderLinesTotalMinor(lines) : null
    if (paidInFull && !paidMinor) {
      setError("The total could not be worked out to mark this order paid.")
      return
    }
    const payload = {
      fulfillNow: fulfillNow || undefined,
      paidInFull: paidMinor
        ? { amountMinor: paidMinor, method: paymentMethod }
        : null,
      customerId: selectedCustomer?.id,
      customerMode: creatingCustomer
        ? ("create" as const)
        : ("contact_only" as const),
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      customerEmail: customerEmail.trim() || undefined,
      lines,
      schemaVersion: 1 as const,
      storeId: store.id,
    }
    const digest = JSON.stringify(payload)
    if (submission.current?.payload !== digest)
      submission.current = { payload: digest, id: crypto.randomUUID() }
    const { paidInFull: paid, ...order } = payload
    createMutation.mutate({
      ...order,
      clientOrderId: submission.current.id,
      initialPayment: paid
        ? {
            ...paid,
            clientPaymentId: `${submission.current.id}:payment`,
          }
        : undefined,
    })
  }

  return (
    <FieldGroup className="grid gap-5">
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
      <QaDashboardQuickFill
        canUndo={canUndoQuickFill}
        formId="dashboard.order.create"
        isDirty={
          Boolean(customerEmail || customerName || customerPhone) ||
          drafts.length > 0 ||
          catalogFreeLines.length > 0
        }
        onFill={(context, sequence) => {
          const offering = offerings.find(
            (candidate) => !candidate.disabledReason,
          )
          if (!offering) {
            setError(
              "Add an eligible Product or Service before filling this draft.",
            )
            return
          }
          quickFillSnapshot.current = {
            selectedCustomer,
            customerEmail,
            customerName,
            customerPhone,
            drafts,
            showCustomer,
            creatingCustomer,
            customerSearch,
          }
          const fixture = createOrderFixture(context, sequence)
          setSelectedCustomer(null)
          const item = items.find((row) => row.id === offering.catalogItemId)
          if (!item) return
          setDrafts([makeOrderDraftLine(item, offering)])
          setCustomerEmail(fixture.customerEmail)
          setCustomerName(fixture.customerName)
          setCustomerPhone(fixture.customerPhone)
          setShowCustomer(true)
          setCreatingCustomer(true)
          setCustomerSearch("")
          setCanUndoQuickFill(true)
          setError(null)
        }}
        onUndo={() => {
          if (!quickFillSnapshot.current) return
          setSelectedCustomer(quickFillSnapshot.current.selectedCustomer)
          setCustomerEmail(quickFillSnapshot.current.customerEmail)
          setCustomerName(quickFillSnapshot.current.customerName)
          setCustomerPhone(quickFillSnapshot.current.customerPhone)
          setDrafts(quickFillSnapshot.current.drafts)
          setShowCustomer(quickFillSnapshot.current.showCustomer)
          setCreatingCustomer(quickFillSnapshot.current.creatingCustomer)
          setCustomerSearch(quickFillSnapshot.current.customerSearch)
          quickFillSnapshot.current = null
          setCanUndoQuickFill(false)
        }}
      />
      <OrderItemPicker
        items={items}
        offerings={offerings}
        disabled={createMutation.isPending || drafts.length >= 100}
        onSelect={(item) => {
          const choices = offerings.filter(
            (row) => row.catalogItemId === item.id,
          )
          const offering = choices.find((row) => !row.disabledReason)
          if (!offering) return
          setDrafts((current) => [
            ...current,
            makeOrderDraftLine(item, offering),
          ])
          setError(null)
        }}
      />
      {!drafts.length && !catalogFreeLines.length ? (
        <p className="text-sm text-muted-foreground">
          Search the catalog to add an item, or type a price to record the sale
          without the catalog.
        </p>
      ) : null}
      <div className="grid gap-3">
        {drafts.map((line, index) => {
          const item = items.find((row) => row.id === line.catalogItemId)
          return item ? (
            <OrderItemRow
              key={line.id}
              item={item}
              line={line}
              index={index}
              offerings={offerings}
              currencyCode={store.currencyCode}
              disabled={createMutation.isPending}
              onChange={(next) =>
                setDrafts((current) =>
                  current.map((row) => (row.id === line.id ? next : row)),
                )
              }
              onRemove={() =>
                setDrafts((current) =>
                  current.filter((row) => row.id !== line.id),
                )
              }
            />
          ) : (
            <FormFeedback key={line.id} appearance="dashboard">
              An item is no longer available. Close and reopen this order.
            </FormFeedback>
          )
        })}
      </div>
      <OrderCatalogFreeLines
        lines={catalogFreeLines}
        currencyCode={store.currencyCode}
        disabled={createMutation.isPending}
        onChange={(next) => {
          setCatalogFreeLines(next)
          setError(null)
        }}
      />
      {totalMinor !== null ? (
        <div className="flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">Order total</span>
          <span className="text-base font-semibold tabular-nums">
            {orderMoney(totalMinor, store.currencyCode)}
          </span>
        </div>
      ) : null}
      <div className="grid gap-3">
        <CheckboxField
          label="Mark as fulfilled now"
          description="Items were handed over or the work is done."
        >
          <Checkbox
            checked={fulfillNow}
            disabled={createMutation.isPending}
            onCheckedChange={(checked) => setFulfillNow(checked === true)}
          />
        </CheckboxField>
        <CheckboxField
          label="Paid in full"
          description="Records the full order total as received."
        >
          <Checkbox
            checked={paidInFull}
            disabled={createMutation.isPending}
            onCheckedChange={(checked) => setPaidInFull(checked === true)}
          />
        </CheckboxField>
        {paidInFull ? (
          <ControlField label="Payment method" className="sm:max-w-xs">
            <SelectControl<PaymentMethod>
              aria-label="Payment method"
              disabled={createMutation.isPending}
              options={PAYMENT_METHOD_OPTIONS}
              value={paymentMethod}
              onValueChange={setPaymentMethod}
            />
          </ControlField>
        ) : null}
      </div>
      <button
        type="button"
        className="w-fit text-sm font-medium text-primary"
        onClick={() => setShowCustomer((current) => !current)}
      >
        {showCustomer ? "Hide customer details" : "Add customer details"}
      </button>
      {showCustomer ? (
        <div className="grid gap-3">
          {creatingCustomer ? (
            <div className="grid gap-3 border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">New customer</h3>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={createMutation.isPending}
                  onClick={() => {
                    setCreatingCustomer(false)
                    setCustomerName("")
                    setCustomerPhone("")
                    setCustomerEmail("")
                  }}
                >
                  Search customers
                </Button>
              </div>
              <ControlField label={<>Customer name</>}>
                <Input
                  maxLength={160}
                  required
                  autoFocus
                  disabled={createMutation.isPending}
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                />
              </ControlField>
              <ControlField label={<>Phone number</>}>
                <Input
                  type="tel"
                  autoComplete="tel"
                  maxLength={40}
                  disabled={createMutation.isPending}
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                />
              </ControlField>
            </div>
          ) : (
            <OrderCustomerPicker
              selected={selectedCustomer}
              initialSearch={customerSearch}
              customerDirectory={customerDirectory}
              storeId={store.id}
              disabled={createMutation.isPending}
              onCreate={(search) => {
                const draft = customerDraftFromSearch(search)
                setSelectedCustomer(null)
                setCustomerSearch(search)
                setCustomerName(draft.name)
                setCustomerPhone(draft.phone)
                setCustomerEmail("")
                setCreatingCustomer(true)
                setError(null)
              }}
              onSelect={(customer) => {
                setCustomerSearch("")
                setSelectedCustomer(customer)
                setCustomerName(customer?.name ?? "")
                setCustomerEmail(customer?.email ?? "")
                setCustomerPhone(customer?.phone ?? "")
                setError(null)
              }}
            />
          )}
        </div>
      ) : null}
      <FormActions>
        <SubmitButton
          type="button"
          isSubmitting={createMutation.isPending}
          disabled={createMutation.isPending}
          onClick={submit}
        >
          {createMutation.isPending ? "Confirming…" : "Confirm order"}
        </SubmitButton>
      </FormActions>
    </FieldGroup>
  )
}
