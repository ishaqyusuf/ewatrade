"use client"
import {
  Button,
  ControlField,
  FieldGroup,
  FormActions,
  Input,
  SubmitButton,
} from "@ewatrade/ui"

import { customerDraftFromSearch } from "./order-customer-search"
import {
  type OrderDraftLine,
  availableOrderOfferings,
  buildOrderLines,
  makeOrderDraftLine,
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
    let lines: ReturnType<typeof buildOrderLines>
    try {
      lines = buildOrderLines(drafts, offerings)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Check the selected items.",
      )
      return
    }
    const payload = {
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
    createMutation.mutate({ ...payload, clientOrderId: submission.current.id })
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
          drafts.length > 0
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
      {!drafts.length ? (
        <p className="text-sm text-muted-foreground">
          Search the catalog to add your first item.
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
