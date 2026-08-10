"use client"

import { useServiceCommerceParams } from "@/hooks/use-service-commerce-params"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { ServiceCommerceCatalogDraftFormValues } from "@ewatrade/service-commerce"
import { Badge, Button } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { useFormContext } from "react-hook-form"

type SourceKind = "commerce_inquiry" | "prescription" | "service"

export function CatalogDraftForm({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const params = useServiceCommerceParams()
  const source = {
    id: params.sourceId ?? "",
    kind: params.sourceKind as SourceKind,
  }
  const sourceLineId = params.sourceLineId ?? ""
  const form = useFormContext<ServiceCommerceCatalogDraftFormValues>()
  const selectedOfferingId = params.offeringId
  const [message, setMessage] = useState<string | null>(null)
  const draftCommandId = useRef<string | null>(null)
  const linkCommandId = useRef<string | null>(null)

  const matches = useQuery(
    trpc.serviceCommerce.catalogMatches.queryOptions(
      { source, sourceLineId, storeId },
      { retry: false },
    ),
  )
  const selected = matches.data?.matches.find(
    (match) => match.offeringId === selectedOfferingId,
  )
  const prices = useQuery(
    trpc.serviceCommerce.catalogPriceSuggestions.queryOptions(
      {
        offeringId: selectedOfferingId ?? "",
        source,
        sourceLineId,
        storeId,
      },
      { enabled: Boolean(selectedOfferingId), retry: false },
    ),
  )

  useEffect(() => {
    const label = matches.data?.sourceLine.displayLabel
    if (!label || form.formState.isDirty) return
    form.reset({ name: label, verifiedAlias: "" })
  }, [form, matches.data?.sourceLine.displayLabel])

  const invalidate = async () => {
    const invalidations = [
      queryClient.invalidateQueries({
        queryKey: trpc.serviceCommerce.catalogMatches.queryKey({
          source,
          sourceLineId,
          storeId,
        }),
      }),
    ]
    if (selectedOfferingId) {
      invalidations.push(
        queryClient.invalidateQueries({
          queryKey: trpc.serviceCommerce.catalogPriceSuggestions.queryKey({
            offeringId: selectedOfferingId,
            source,
            sourceLineId,
            storeId,
          }),
        }),
      )
    }
    await Promise.all(invalidations)
  }

  const createDraft = useMutation(
    trpc.serviceCommerce.createCatalogDraft.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidate()
        draftCommandId.current = null
        setMessage(
          "Private Catalog draft created. Confirm availability before including it in a quotation.",
        )
      },
    }),
  )
  const linkOffering = useMutation(
    trpc.serviceCommerce.linkCatalogOffering.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidate()
        linkCommandId.current = null
        setMessage(
          "Verified request line linked. The Offering remains private unless separately activated.",
        )
      },
    }),
  )

  if (matches.isLoading) {
    return <div className="h-64 animate-pulse rounded-lg bg-muted" />
  }
  if (matches.isError || !matches.data) {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-destructive" role="alert">
          {matches.error?.message ?? "Catalog matches are unavailable."}
        </p>
        <Button
          className="w-fit"
          onClick={() => void matches.refetch()}
          variant="outline"
        >
          Try again
        </Button>
      </div>
    )
  }

  const pending = createDraft.isPending || linkOffering.isPending

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {matches.data.sourceLine.evidence.kind === "human_verified"
              ? "Human-verified source"
              : "Customer wording — verify before saving"}
          </p>
          <p className="mt-1 text-sm font-medium">
            {matches.data.sourceLine.displayLabel}
          </p>
        </div>
        {matches.data.matches.length ? (
          <div className="grid gap-2">
            {matches.data.matches.map((match) => (
              <button
                className={`grid gap-2 rounded-lg border p-3 text-left transition-colors ${
                  selectedOfferingId === match.offeringId
                    ? "border-foreground bg-muted/60"
                    : "border-border hover:bg-muted/40"
                }`}
                key={match.offeringId}
                onClick={() => {
                  void params.setParams({ offeringId: match.offeringId })
                  setMessage(null)
                  linkCommandId.current = null
                }}
                type="button"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-medium">{match.offeringName}</span>
                  <Badge variant="secondary">
                    {match.isPrivateDraft ? "Private draft" : "Existing"}
                  </Badge>
                </span>
                <span className="text-sm text-muted-foreground">
                  {match.catalogItemName} · {match.variantName} · Match{" "}
                  {Math.round(match.score * 100)}%
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No suitable Offering was found. Create a private draft below; it
            will not be published or given invented stock.
          </p>
        )}
      </section>

      {selected ? (
        <section className="grid gap-3 rounded-lg border border-border p-4">
          <div>
            <h3 className="font-medium">Confirm existing Offering</h3>
            <p className="text-sm text-muted-foreground">
              Link {selected.offeringName} only after confirming it represents
              the reviewed request. Customer wording is never saved as a
              verified Catalog alias automatically.
            </p>
          </div>
          <PriceSuggestionState
            data={prices.data}
            isError={prices.isError}
            isLoading={prices.isLoading}
            onRetry={() => void prices.refetch()}
          />
          <label className="grid gap-1 text-sm">
            Confirmed Catalog alias
            <input
              className="h-10 rounded-lg border border-border bg-background px-3"
              {...form.register("verifiedAlias")}
            />
          </label>
          <Button
            disabled={pending || !form.watch("verifiedAlias").trim()}
            onClick={() => {
              linkCommandId.current ??= crypto.randomUUID()
              linkOffering.mutate({
                clientOperationId: linkCommandId.current,
                expectedSourceFingerprint: matches.data.sourceLine.fingerprint,
                offeringId: selected.offeringId,
                source,
                sourceLineId,
                storeId,
                verifiedAlias: form.getValues("verifiedAlias"),
              })
            }}
            type="button"
          >
            Confirm link
          </Button>
        </section>
      ) : null}

      <form
        className="grid gap-3 rounded-lg border border-border p-4"
        onSubmit={form.handleSubmit((values) => {
          draftCommandId.current ??= crypto.randomUUID()
          createDraft.mutate({
            clientOperationId: draftCommandId.current,
            draftKind: matches.data.draftKind,
            expectedSourceFingerprint: matches.data.sourceLine.fingerprint,
            name: values.name,
            source,
            sourceLineId,
            storeId,
            verifiedAlias: values.verifiedAlias,
          })
        })}
      >
        <div>
          <h3 className="font-medium">Create private Catalog draft</h3>
          <p className="text-sm text-muted-foreground">
            Review the suggested name and enter a confirmed Catalog alias. Raw
            customer wording is never treated as verified Catalog truth.
          </p>
        </div>
        <label className="grid gap-1 text-sm">
          Catalog name
          <input
            className="h-10 rounded-lg border border-border bg-background px-3"
            {...form.register("name")}
          />
          {form.formState.errors.name ? (
            <span className="text-xs text-destructive">
              {form.formState.errors.name.message}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1 text-sm">
          Confirmed Catalog alias
          <input
            className="h-10 rounded-lg border border-border bg-background px-3"
            {...form.register("verifiedAlias")}
          />
        </label>
        <Button disabled={pending} type="submit">
          {createDraft.isPending ? "Creating…" : "Create private draft"}
        </Button>
      </form>

      {message ? (
        <output className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          {message}
        </output>
      ) : null}
    </div>
  )
}

function PriceSuggestionState({
  data,
  isError,
  isLoading,
  onRetry,
}: {
  data: RouterOutputs["serviceCommerce"]["catalogPriceSuggestions"] | undefined
  isError: boolean
  isLoading: boolean
  onRetry: () => void
}) {
  if (isLoading)
    return (
      <p className="text-sm text-muted-foreground">Checking price history…</p>
    )
  if (isError) {
    return (
      <Button className="w-fit" onClick={onRetry} variant="outline">
        Retry price history
      </Button>
    )
  }
  if (
    !data ||
    data.suggestion.priceMinor === null ||
    !data.suggestion.currencyCode
  ) {
    return (
      <p className="text-sm text-muted-foreground">
        No attributable Store price is available. Enter the current Quote price
        manually.
      </p>
    )
  }
  return (
    <p className="text-sm text-muted-foreground">
      Suggested from {data.suggestion.source.replaceAll("_", " ")}:{" "}
      {data.suggestion.currencyCode}{" "}
      {(data.suggestion.priceMinor / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
      })}
      . This does not change the reusable Catalog price.
    </p>
  )
}
