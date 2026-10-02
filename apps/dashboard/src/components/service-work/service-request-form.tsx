"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import {
  Button,
  Checkbox,
  CheckboxField,
  ControlField,
  FieldGroup,
  FieldLegend,
  FieldSet,
  FormActions,
  Input,
  SubmitButton,
} from "@ewatrade/ui"

import {
  flattenServiceOfferings,
  formatMoney,
} from "@/components/service-work/service-utils"
import { useTRPC } from "@/trpc/client"

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { useMemo, useState } from "react"

type StoreSummary = { currencyCode: string; id: string; name: string }

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
      <FieldGroup className="grid gap-4">
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
        <Button
          appearance="form"
          variant="outline"
          onClick={() => setPublicUrl(null)}
        >
          Create another link
        </Button>
      </FieldGroup>
    )
  }

  return (
    <FieldGroup className="grid gap-4">
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
      <ControlField label={<>Link label</>}>
        <Input
          value={formLabel}
          onChange={(event) => setFormLabel(event.target.value)}
          placeholder="Service request"
        />
      </ControlField>
      <FieldSet className="grid gap-1">
        <FieldLegend variant="label" className="mb-1 text-sm font-medium">
          Available Services
        </FieldLegend>
        {offerings.map((offering) => (
          <CheckboxField
            key={offering.id}
            label=<span>
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
          >
            <Checkbox
              checked={selectedOfferings.includes(offering.id)}
              onCheckedChange={(checked) =>
                setSelectedOfferings((current) =>
                  checked
                    ? [...current, offering.id]
                    : current.filter((id) => id !== offering.id),
                )
              }
            />
          </CheckboxField>
        ))}
      </FieldSet>
      <FormActions>
        <SubmitButton
          type="button"
          isSubmitting={createMutation.isPending}
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
        </SubmitButton>
      </FormActions>
    </FieldGroup>
  )
}
