"use client"

import { useOrderParams } from "@/hooks/use-order-params"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button } from "@ewatrade/ui"
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

type CatalogItem = RouterOutputs["catalog"]["listItems"][number]
type StoreSummary = { currencyCode: string; id: string; name: string }

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

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
        const balance = item.product?.stockBalances.find(
          (row) =>
            row.variantId === variant.id &&
            (offering.productUnit?.inventoryUnitId === row.inventoryUnitId ||
              row.kind === "shared_pool"),
        )
        return [
          {
            balanceRevision: balance?.revision,
            configurationVersionId: item.product?.currentUnitConfiguration?.id,
            displayName:
              item.variants.length > 1
                ? `${item.name} · ${variant.name} · ${offering.name}`
                : `${item.name} · ${offering.name}`,
            fixedPriceMinor: offering.fixedPriceMinor ?? 0,
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
  const [customerPhone, setCustomerPhone] = useState("")
  const [showCustomer, setShowCustomer] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
            queryKey: trpc.tenant.featureAvailability.queryKey(),
          }),
        ])
        setParams(null)
        router.refresh()
      },
    }),
  )

  function submit() {
    const lines = offerings.flatMap((offering) => {
      const quantity = quantities[offering.id]?.trim()
      if (!quantity) return []
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
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      lines,
      schemaVersion: 1,
      storeId: store.id,
    })
  }

  return (
    <div className="grid gap-5">
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <div className="grid gap-2">
        {offerings.map((offering) => (
          <label
            className="grid grid-cols-[1fr_90px] items-center gap-3 border-b border-border py-3"
            key={offering.id}
          >
            <span>
              <span className="block text-sm font-medium">
                {offering.displayName}
              </span>
              <span className="text-xs text-muted-foreground">
                {money(offering.fixedPriceMinor, store.currencyCode)}
              </span>
            </span>
            <input
              aria-label={`${offering.displayName} quantity`}
              className={inputClass}
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
          </label>
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
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Customer name</span>
            <input
              className={inputClass}
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Phone</span>
            <input
              className={inputClass}
              inputMode="tel"
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      <Button disabled={createMutation.isPending} onClick={submit}>
        {createMutation.isPending ? "Confirming…" : "Confirm order"}
      </Button>
    </div>
  )
}
