"use client"

import {
  flattenServiceOfferings,
  formatMoney,
} from "@/components/service-work/service-utils"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { useMemo, useState } from "react"

type StoreSummary = { currencyCode: string; id: string; name: string }

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

export function ServiceRequestForm({ store }: { store: StoreSummary }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { data: items } = useSuspenseQuery(
    trpc.catalog.listItems.queryOptions({ kind: "service" }, { retry: false }),
  )
  const offerings = useMemo(
    () => flattenServiceOfferings(items, store.id),
    [items, store.id],
  )
  const [formLabel, setFormLabel] = useState("")
  const [selectedOfferings, setSelectedOfferings] = useState<string[]>([])
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const createMutation = useMutation(
    trpc.serviceAccess.createRequestForm.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: async (result) => {
        const storefront =
          process.env.NEXT_PUBLIC_STOREFRONT_URL?.replace(/\/$/, "") ?? ""
        setPublicUrl(`${storefront}/service-request/${result.token}`)
        await queryClient.invalidateQueries({
          queryKey: trpc.serviceAccess.requestForms.queryKey(),
        })
      },
    }),
  )

  if (publicUrl) {
    return (
      <div className="grid gap-4">
        <div className="rounded-lg bg-primary/10 px-4 py-3 text-sm">
          <p className="font-medium">Customer request link ready</p>
          <a
            className="mt-2 block break-all text-primary underline"
            href={publicUrl}
            rel="noreferrer"
            target="_blank"
          >
            {publicUrl}
          </a>
        </div>
        <Button variant="outline" onClick={() => setPublicUrl(null)}>
          Create another link
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Link label</span>
        <input
          className={fieldClass}
          value={formLabel}
          onChange={(event) => setFormLabel(event.target.value)}
          placeholder="Service request"
        />
      </label>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-sm font-medium">Available Services</legend>
        {offerings.map((offering) => (
          <label
            className="flex items-start gap-3 border-b border-border py-3 text-sm"
            key={offering.id}
          >
            <input
              type="checkbox"
              checked={selectedOfferings.includes(offering.id)}
              onChange={(event) =>
                setSelectedOfferings((current) =>
                  event.target.checked
                    ? [...current, offering.id]
                    : current.filter((id) => id !== offering.id),
                )
              }
            />
            <span>
              <span className="block font-medium">{offering.displayName}</span>
              <span className="text-xs text-muted-foreground">
                {offering.pricingPolicy === "quote_required"
                  ? "Quote required"
                  : formatMoney(
                      offering.fixedPriceMinor,
                      offering.currencyCode,
                    )}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <Button
        disabled={
          !formLabel.trim() ||
          selectedOfferings.length === 0 ||
          createMutation.isPending
        }
        onClick={() =>
          createMutation.mutate({
            label: formLabel.trim(),
            offeringIds: selectedOfferings,
            storeId: store.id,
          })
        }
      >
        {createMutation.isPending ? "Creating…" : "Create request link"}
      </Button>
    </div>
  )
}
