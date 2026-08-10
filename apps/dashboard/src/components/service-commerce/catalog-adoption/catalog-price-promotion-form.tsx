"use client"

import { useServiceCommerceParams } from "@/hooks/use-service-commerce-params"
import { useTRPC } from "@/trpc/client"
import type { ServiceCommerceCatalogPricePromotionFormValues } from "@ewatrade/service-commerce"
import { Button } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { useFormContext } from "react-hook-form"

type SourceKind = "commerce_inquiry" | "prescription" | "service"

export function CatalogPricePromotionForm({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const params = useServiceCommerceParams()
  const form = useFormContext<ServiceCommerceCatalogPricePromotionFormValues>()
  const [message, setMessage] = useState<string | null>(null)
  const operationId = useRef<string | null>(null)
  const source = {
    id: params.sourceId ?? "",
    kind: params.sourceKind as SourceKind,
  }
  const input = {
    expectedSourceFingerprint: "",
    quoteId: params.quoteId ?? "",
    source,
    sourceLineId: params.sourceLineId ?? "",
    storeId,
  }
  const matches = useQuery(
    trpc.serviceCommerce.catalogMatches.queryOptions(
      {
        source,
        sourceLineId: input.sourceLineId,
        storeId,
      },
      { retry: false },
    ),
  )
  const expectedSourceFingerprint =
    matches.data?.sourceLine.fingerprint ?? input.expectedSourceFingerprint
  const impactInput = { ...input, expectedSourceFingerprint }
  const impact = useQuery(
    trpc.serviceCommerce.catalogPricePromotionImpact.queryOptions(impactInput, {
      enabled: Boolean(expectedSourceFingerprint && input.quoteId),
      retry: false,
    }),
  )

  const promote = useMutation(
    trpc.serviceCommerce.promoteCatalogPrice.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey:
              trpc.serviceCommerce.catalogPricePromotionImpact.queryKey(
                impactInput,
              ),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.serviceCommerce.catalogMatches.queryKey({
              source,
              sourceLineId: input.sourceLineId,
              storeId,
            }),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.serviceCommerce.catalogPriceSuggestions.queryKey({
              offeringId: data.offeringId,
              source,
              sourceLineId: input.sourceLineId,
              storeId,
            }),
          }),
        ])
        operationId.current = null
        form.reset()
        setMessage(
          "Reusable Catalog price updated. Existing Quote and Order snapshots were not changed.",
        )
      },
    }),
  )

  if (matches.isLoading || (impact.isLoading && impact.isFetching)) {
    return <div className="h-48 animate-pulse rounded-lg bg-muted" />
  }
  if (matches.isError || impact.isError || !impact.data) {
    return (
      <section className="grid gap-3 border-t border-border pt-6">
        <h3 className="font-medium">Reusable Catalog price</h3>
        <p className="text-sm text-destructive" role="alert">
          {matches.error?.message ??
            impact.error?.message ??
            "Price-promotion impact is unavailable."}
        </p>
        <Button
          className="w-fit"
          onClick={() => {
            if (matches.isError) void matches.refetch()
            if (expectedSourceFingerprint) void impact.refetch()
          }}
          variant="outline"
        >
          Try again
        </Button>
      </section>
    )
  }

  const data = impact.data
  return (
    <form
      className="grid gap-4 border-t border-border pt-6"
      onSubmit={form.handleSubmit((values) => {
        operationId.current ??= crypto.randomUUID()
        setMessage(null)
        promote.mutate({
          affectedStoreIds: data.affectedStores.map((store) => store.id),
          clientOperationId: operationId.current,
          expectedPreviousPriceMinor: data.currentPriceMinor,
          expectedSourceFingerprint: data.sourceLine.fingerprint,
          priceMinor: data.quotePriceMinor,
          quoteVersionId: data.quoteVersionId,
          reason: values.reason,
          source,
          sourceLineId: input.sourceLineId,
          storeId,
        })
      })}
    >
      <div>
        <h3 className="font-medium">Promote quoted price</h3>
        <p className="text-sm text-muted-foreground">
          This is separate from the immutable Quote. It changes the reusable
          Tenant-wide Offering price only after confirmation.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border p-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Current Catalog price</dt>
          <dd className="font-medium">
            {data.currentPriceMinor === null
              ? "Not set"
              : formatMoney(data.currentPriceMinor, data.currencyCode)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Issued Quote price</dt>
          <dd className="font-medium">
            {formatMoney(data.quotePriceMinor, data.currencyCode)}
          </dd>
        </div>
      </dl>
      <div className="grid gap-2">
        <p className="text-sm font-medium">Affected Stores</p>
        <ul className="grid gap-1 text-sm text-muted-foreground">
          {data.affectedStores.map((store) => (
            <li key={store.id}>• {store.name}</li>
          ))}
        </ul>
      </div>
      <label className="grid gap-1 text-sm">
        Reason
        <textarea
          className="min-h-24 rounded-lg border border-border bg-background px-3 py-2"
          placeholder="Explain why this Quote price should become reusable"
          {...form.register("reason")}
        />
        {form.formState.errors.reason ? (
          <span className="text-xs text-destructive">
            {form.formState.errors.reason.message}
          </span>
        ) : null}
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          className="mt-0.5"
          type="checkbox"
          {...form.register("confirmed")}
        />
        <span>
          Confirm this exact price and every Store listed above. Historical
          Quotes and Orders will remain unchanged.
        </span>
      </label>
      {form.formState.errors.confirmed ? (
        <p className="text-xs text-destructive" role="alert">
          {form.formState.errors.confirmed.message}
        </p>
      ) : null}
      <Button
        disabled={promote.isPending || !form.formState.isValid}
        type="submit"
      >
        {promote.isPending ? "Updating…" : "Promote quoted price"}
      </Button>
      {message ? (
        <output className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          {message}
        </output>
      ) : null}
    </form>
  )
}

function formatMoney(valueMinor: number, currencyCode: string) {
  return new Intl.NumberFormat(undefined, {
    currency: currencyCode,
    style: "currency",
  }).format(valueMinor / 100)
}
