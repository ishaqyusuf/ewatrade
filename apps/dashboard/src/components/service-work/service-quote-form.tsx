"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import {
  ControlField,
  DateControl,
  FieldGroup,
  FieldLabel,
  FormActions,
  MoneyInput,
  SubmitButton,
  Textarea,
  Field as UiField,
} from "@ewatrade/ui"

import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useTRPC } from "@/trpc/client"

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"

type StoreSummary = { currencyCode: string; id: string; name: string }

function lineOptionDetail(offeringName: string, variantName: string) {
  return offeringName.trim().toLocaleLowerCase() ===
    variantName.trim().toLocaleLowerCase()
    ? ""
    : ` · ${variantName}`
}

export function ServiceQuoteForm({ store }: { store: StoreSummary }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { requestId } = useServiceWorkParams()
  const { data: requests } = useSuspenseQuery(
    trpc.serviceAccess.requests.queryOptions(
      { limit: 100, storeId: store.id },
      { retry: false },
    ),
  )
  const request = useMemo(
    () => requests.find((candidate) => candidate.id === requestId),
    [requestId, requests],
  )
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [expiresAt, setExpiresAt] = useState("")
  const [agreedScope, setAgreedScope] = useState("")
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!request) return
    setAgreedScope(request.details ?? "")
    setPrices(
      Object.fromEntries(
        request.lines.map((line) => [
          line.offeringId,
          String((line.fixedPriceMinor ?? 0) / 100),
        ]),
      ),
    )
  }, [request])

  const quoteMutation = useMutation(
    trpc.serviceAccess.issueQuote.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: async (result) => {
        const storefront =
          process.env.NEXT_PUBLIC_STOREFRONT_URL?.replace(/\/$/, "") ?? ""
        setPublicUrl(
          result.token ? `${storefront}/service-quote/${result.token}` : null,
        )
        await queryClient.invalidateQueries({
          queryKey: trpc.serviceAccess.requests.queryKey(),
        })
      },
    }),
  )

  if (!request) {
    return (
      <p className="text-sm text-muted-foreground">
        The selected Request is no longer available.
      </p>
    )
  }

  function issueQuote() {
    if (!request) return

    const lines = request.lines.map((line) => {
      const value = Number(prices[line.offeringId])
      return {
        offeringId: line.offeringId,
        quantity: line.quantity,
        unitPriceMinor: Math.round(value * 100),
      }
    })
    if (
      lines.some(
        (line) =>
          !Number.isFinite(line.unitPriceMinor) || line.unitPriceMinor < 0,
      )
    ) {
      setError("Enter a valid price for every quoted line.")
      return
    }
    quoteMutation.mutate({
      clientQuoteId: `request-${request.id}`,
      clientVersionId: crypto.randomUUID(),
      customerNote: agreedScope.trim() || undefined,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      lines,
      requestId: request.id,
      storeId: store.id,
    })
  }

  if (publicUrl) {
    return (
      <div className="border border-primary/20 bg-primary/10 px-4 py-3 text-sm">
        <p className="font-medium">Quote link ready</p>
        <a
          className="mt-2 block break-all text-primary underline"
          href={publicUrl}
          rel="noreferrer"
          target="_blank"
        >
          {publicUrl}
        </a>
      </div>
    )
  }

  return (
    <FieldGroup className="grid gap-4">
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
      {request.lines.map((line) => (
        <div className="grid gap-3 border-b border-border pb-4" key={line.id}>
          <div>
            <p className="font-medium">{line.offeringName}</p>
            <p className="text-sm text-muted-foreground">
              Quantity {line.quantity}
              {lineOptionDetail(line.offeringName, line.variantName)}
            </p>
          </div>
          <UiField className="gap-1.5">
            <FieldLabel htmlFor={`service-quote-price-${line.id}`}>
              Unit price
            </FieldLabel>
            <MoneyInput
              id={`service-quote-price-${line.id}`}
              currencyCode={store.currencyCode}
              inputMode="decimal"
              value={prices[line.offeringId] ?? ""}
              onChange={(event) =>
                setPrices((current) => ({
                  ...current,
                  [line.offeringId]: event.target.value,
                }))
              }
            />
          </UiField>
        </div>
      ))}
      <ControlField
        label="Agreed service scope"
        description="Review the customer's request and confirm what this price covers. This scope is saved with this quote version and shown before acceptance."
      >
        <Textarea
          value={agreedScope}
          onChange={(event) => setAgreedScope(event.target.value)}
          maxLength={4_000}
          rows={6}
          placeholder="Work included, exclusions, supplies, location and visit window"
        />
      </ControlField>
      <ControlField
        label={
          <>
            Expires{" "}
            <span className="font-normal text-muted-foreground">Optional</span>
          </>
        }
      >
        <DateControl
          type="datetime-local"
          value={expiresAt}
          onValueChange={(value) => setExpiresAt(value)}
        />
      </ControlField>
      <FormActions>
        <SubmitButton
          type="button"
          isSubmitting={quoteMutation.isPending}
          className="rounded-none"
          disabled={quoteMutation.isPending}
          onClick={issueQuote}
        >
          {quoteMutation.isPending ? "Issuing…" : "Issue quote"}
        </SubmitButton>
      </FormActions>
    </FieldGroup>
  )
}
