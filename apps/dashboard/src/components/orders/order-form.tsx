"use client"
import {
  ControlField,
  FieldGroup,
  FormActions,
  Input,
  SubmitButton,
} from "@ewatrade/ui"

import { FormFeedback } from "@/components/forms/form-feedback"

import { createOrderFixture } from "@/components/qa/fixture-recipes"
import { QaDashboardQuickFill } from "@/components/qa/qa-quick-fill"
import { useOrderParams } from "@/hooks/use-order-params"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

import { getSaleOfferingDisabledReasons } from "@ewatrade/utils"
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

type CatalogItem = RouterOutputs["catalog"]["listItems"][number]
type StoreSummary = { currencyCode: string; id: string; name: string }

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    currency,
    style: "currency",
  }).format(value / 100)
}

function availableOfferings(items: CatalogItem[], storeId: string) {
  return items.flatMap((item) =>
    item.variants.flatMap((variant) =>
      variant.offerings.flatMap((offering) => {
        if (
          offering.status !== "active" ||
          offering.pricingPolicy !== "fixed" ||
          !offering.stores.some(
            (row) => row.storeId === storeId && row.isAvailable,
          )
        ) {
          return []
        }
        const inventoryUnit =
          item.product?.currentUnitConfiguration?.units.find(
            (unit) => unit.id === offering.productUnit?.inventoryUnitId,
          )
        const balance = item.product?.stockBalances.find(
          (row) =>
            row.storeId === storeId &&
            row.variantId === variant.id &&
            (inventoryUnit?.stockBehavior === "packaged_stock"
              ? row.kind === "packaged_stock" &&
                row.inventoryUnitId === offering.productUnit?.inventoryUnitId
              : row.kind === "shared_pool"),
        )
        const disabledReasons = getSaleOfferingDisabledReasons({
          fixedPriceMinor: offering.fixedPriceMinor,
          kind: offering.kind === "product_unit" ? "product_unit" : "service",
          onHandQuantity: balance?.onHandQuantity,
          reservedQuantity: balance?.reservedQuantity,
        })
        return [
          {
            balanceRevision: balance?.revision,
            configurationVersionId: item.product?.currentUnitConfiguration?.id,
            displayName:
              item.variants.length > 1
                ? `${item.name} · ${variant.name} · ${offering.name}`
                : `${item.name} · ${offering.name}`,
            disabledReason: disabledReasons.join(" · ") || undefined,
            fixedPriceMinor: offering.fixedPriceMinor,
            id: offering.id,
            kind: offering.kind,
          },
        ]
      }),
    ),
  )
}

export function OrderForm({ store }: { store: StoreSummary }) {
  const router = useRouter()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { setParams } = useOrderParams()
  const { data: items } = useSuspenseQuery(
    trpc.catalog.listItems.queryOptions({}, { retry: false }),
  )
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [customerName, setCustomerName] = useState("")
  const [selectedCustomer, setSelectedCustomer] =
    useState<OrderCustomerSelection | null>(null)
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [showCustomer, setShowCustomer] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const quickFillSnapshot = useRef<{
    selectedCustomer: OrderCustomerSelection | null
    customerEmail: string
    customerName: string
    customerPhone: string
    quantities: Record<string, string>
    showCustomer: boolean
  } | null>(null)
  const [canUndoQuickFill, setCanUndoQuickFill] = useState(false)
  const offerings = useMemo(
    () => availableOfferings(items, store.id),
    [items, store.id],
  )
  const createMutation = useMutation(
    trpc.orders.create.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: async () => {
        await Promise.all([
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
        setParams({ orderSheet: null })
        router.refresh()
      },
    }),
  )

  function submit() {
    const lines = offerings.flatMap((offering) => {
      const quantity = quantities[offering.id]?.trim()
      if (
        !quantity ||
        offering.disabledReason ||
        offering.fixedPriceMinor === null
      )
        return []
      return [
        {
          expectedBalanceRevision:
            offering.kind === "product_unit"
              ? offering.balanceRevision
              : undefined,
          expectedConfigurationVersionId:
            offering.kind === "product_unit"
              ? offering.configurationVersionId
              : undefined,
          expectedFixedPriceMinor: offering.fixedPriceMinor,
          offeringId: offering.id,
          quantity,
        },
      ]
    })
    if (lines.length === 0) {
      setError("Choose at least one item and enter a quantity.")
      return
    }
    if (
      lines.some(
        (line) =>
          line.expectedConfigurationVersionId === undefined &&
          offerings.find((offering) => offering.id === line.offeringId)
            ?.kind === "product_unit",
      )
    ) {
      setError("A selected Product is missing its current unit configuration.")
      return
    }
    createMutation.mutate({
      clientOrderId: crypto.randomUUID(),
      customerId: selectedCustomer?.id,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      customerEmail: customerEmail.trim() || undefined,
      lines,
      schemaVersion: 1,
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
        formId="dashboard.order.create"
        isDirty={
          Boolean(customerEmail || customerName || customerPhone) ||
          Object.keys(quantities).length > 0
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
            quantities,
            showCustomer,
          }
          const fixture = createOrderFixture(context, sequence)
          setSelectedCustomer(null)
          setQuantities({ [offering.id]: "1" })
          setCustomerEmail(fixture.customerEmail)
          setCustomerName(fixture.customerName)
          setCustomerPhone(fixture.customerPhone)
          setShowCustomer(true)
          setCanUndoQuickFill(true)
          setError(null)
        }}
        onUndo={() => {
          if (!quickFillSnapshot.current) return
          setSelectedCustomer(quickFillSnapshot.current.selectedCustomer)
          setCustomerEmail(quickFillSnapshot.current.customerEmail)
          setCustomerName(quickFillSnapshot.current.customerName)
          setCustomerPhone(quickFillSnapshot.current.customerPhone)
          setQuantities(quickFillSnapshot.current.quantities)
          setShowCustomer(quickFillSnapshot.current.showCustomer)
          quickFillSnapshot.current = null
          setCanUndoQuickFill(false)
        }}
      />
      <div className="grid gap-2">
        {offerings.map((offering) => (
          <ControlField
            className="grid grid-cols-[minmax(0,1fr)_90px] items-center gap-3 border-b border-border py-3 [&>[data-slot=field-label]]:flex-col [&>[data-slot=field-label]]:items-start"
            key={offering.id}
            label={
              <>
                <span className="block text-sm font-medium">
                  {offering.displayName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {offering.fixedPriceMinor === null
                    ? "Price not set"
                    : money(offering.fixedPriceMinor, store.currencyCode)}
                </span>
                {offering.disabledReason ? (
                  <span className="block text-xs font-medium text-destructive">
                    {offering.disabledReason}
                  </span>
                ) : null}
              </>
            }
          >
            <Input
              aria-label={`${offering.displayName} quantity`}
              disabled={Boolean(offering.disabledReason)}
              inputMode="decimal"
              placeholder="Qty"
              value={quantities[offering.id] ?? ""}
              onChange={(event) =>
                setQuantities((current) => ({
                  ...current,
                  [offering.id]: event.target.value,
                }))
              }
            />
          </ControlField>
        ))}
      </div>
      <button
        type="button"
        className="w-fit text-sm font-medium text-primary"
        onClick={() => setShowCustomer((current) => !current)}
      >
        {showCustomer ? "Hide customer details" : "Add customer details"}
      </button>
      {showCustomer ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <OrderCustomerPicker
              selected={selectedCustomer}
              onSelect={(customer) => {
                setSelectedCustomer(customer)
                setCustomerName(customer?.name ?? "")
                setCustomerEmail(customer?.email ?? "")
                setCustomerPhone(customer?.phone ?? "")
              }}
            />
          </div>
          <ControlField label={<>Customer name</>}>
            <Input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
            />
          </ControlField>
          <ControlField label={<>Email</>}>
            <Input
              onChange={(event) => setCustomerEmail(event.target.value)}
              type="email"
              value={customerEmail}
            />
          </ControlField>
          <ControlField label={<>Phone</>}>
            <Input
              inputMode="tel"
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
            />
          </ControlField>
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
