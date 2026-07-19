"use client"

import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"

type StoreSummary = { currencyCode: string; id: string; name: string }

const fieldClass =
  "h-10 w-full scroll-mt-24 border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

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
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!request) return
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
    <div className="grid gap-4">
      {error ? (
        <p
          role="alert"
          className="border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
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
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Unit price</span>
            <input
              className={fieldClass}
              inputMode="decimal"
              value={prices[line.offeringId] ?? ""}
              onChange={(event) =>
                setPrices((current) => ({
                  ...current,
                  [line.offeringId]: event.target.value,
                }))
              }
            />
          </label>
        </div>
      ))}
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">
          Expires{" "}
          <span className="font-normal text-muted-foreground">Optional</span>
        </span>
        <input
          type="datetime-local"
          className={fieldClass}
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
        />
      </label>
      <Button
        className="rounded-none"
        disabled={quoteMutation.isPending}
        onClick={issueQuote}
      >
        {quoteMutation.isPending ? "Issuing…" : "Issue quote"}
      </Button>
    </div>
  )
}
