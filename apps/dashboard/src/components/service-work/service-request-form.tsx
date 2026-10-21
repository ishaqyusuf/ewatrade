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
  toast,
} from "@ewatrade/ui"
import { Copy01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { SheetSection } from "@/components/service-work/choice-buttons"
import {
  flattenServiceOfferings,
  formatPrice,
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
  const { data: links } = useSuspenseQuery(
    trpc.serviceAccess.requestForms.queryOptions(
      { storeId: store.id },
      { retry: false },
    ),
  )
  const [formLabel, setFormLabel] = useState("")
  const [selectedOfferings, setSelectedOfferings] = useState<string[]>([])
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    label?: string
    services?: string
  }>({})
  const createMutation = useMutation(
    trpc.serviceAccess.createRequestForm.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: async (result) => {
        const storefront =
          process.env.NEXT_PUBLIC_STOREFRONT_URL?.replace(/\/$/, "") ?? ""
        setPublicUrl(`${storefront}/service-request/${result.token}`)
        setFormLabel("")
        setSelectedOfferings([])
        await queryClient.invalidateQueries({
          queryKey: trpc.serviceAccess.requestForms.queryKey(),
        })
      },
    }),
  )

  function submit() {
    setError(null)
    const next = {
      label: formLabel.trim() ? undefined : "Give the link a name.",
      services:
        selectedOfferings.length > 0 ? undefined : "Pick at least one service.",
    }
    setFieldErrors(next)
    if (next.label || next.services) return
    createMutation.mutate({
      label: formLabel.trim(),
      offeringIds: selectedOfferings,
      storeId: store.id,
    })
  }

  const yourLinks =
    links.length > 0 ? (
      <SheetSection title="Your links">
        <ul className="grid border border-border">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex items-start justify-between gap-3 border-t border-border px-3 py-2.5 first:border-t-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{link.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {link.offerings.map((offering) => offering.name).join(", ")}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {link.requestCount === 1
                  ? "1 request"
                  : `${link.requestCount} requests`}
                {link.status !== "ACTIVE" ? " · Off" : ""}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          For safety a link is shown only once, when you make it. Make a new one
          if you lost it.
        </p>
      </SheetSection>
    ) : null

  if (publicUrl) {
    return (
      <FieldGroup className="grid gap-5">
        <FormFeedback appearance="dashboard" variant="default">
          Link ready. Share it on WhatsApp, your status or a flyer.
        </FormFeedback>
        <div className="flex items-center gap-3 border border-border px-3 py-2.5">
          <a
            className="min-w-0 flex-1 text-sm break-all text-primary underline"
            href={publicUrl}
            rel="noreferrer"
            target="_blank"
          >
            {publicUrl}
          </a>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              void navigator.clipboard.writeText(publicUrl).then(
                () => toast("Link copied."),
                () => toast("Select the link above to copy it."),
              )
            }
          >
            <HugeiconsIcon icon={Copy01Icon} data-icon="inline-start" />
            Copy link
          </Button>
        </div>
        <FormActions>
          <Button variant="outline" onClick={() => setPublicUrl(null)}>
            Make another link
          </Button>
        </FormActions>
        {yourLinks}
      </FieldGroup>
    )
  }

  return (
    <FieldGroup className="grid gap-5">
      {yourLinks}
      <SheetSection title="New link">
        {error ? (
          <FormFeedback appearance="dashboard">{error}</FormFeedback>
        ) : null}
        <ControlField
          label="Link name"
          description="Customers see this at the top of the page."
          error={fieldErrors.label}
        >
          <Input
            value={formLabel}
            aria-invalid={Boolean(fieldErrors.label)}
            onChange={(event) => {
              setFormLabel(event.target.value)
              setFieldErrors((current) => ({ ...current, label: undefined }))
            }}
            placeholder="e.g. Book a farm service"
          />
        </ControlField>
        <FieldSet className="grid gap-1">
          <FieldLegend variant="label" className="mb-1 text-sm font-medium">
            Services customers can ask for
          </FieldLegend>
          {offerings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No services yet. Add one in Catalog first.
            </p>
          ) : null}
          {offerings.map((offering) => (
            <CheckboxField
              key={offering.id}
              label={
                <span>
                  <span className="block font-medium">
                    {offering.displayName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {offering.pricingPolicy === "quote_required"
                      ? "Price after quote"
                      : formatPrice(
                          offering.fixedPriceMinor,
                          offering.currencyCode,
                        )}
                  </span>
                </span>
              }
            >
              <Checkbox
                checked={selectedOfferings.includes(offering.id)}
                onCheckedChange={(checked) => {
                  setFieldErrors((current) => ({
                    ...current,
                    services: undefined,
                  }))
                  setSelectedOfferings((current) =>
                    checked
                      ? [...current, offering.id]
                      : current.filter((id) => id !== offering.id),
                  )
                }}
              />
            </CheckboxField>
          ))}
          {fieldErrors.services ? (
            <p role="alert" className="text-sm text-destructive">
              {fieldErrors.services}
            </p>
          ) : null}
        </FieldSet>
        <FormActions>
          <SubmitButton
            type="button"
            isSubmitting={createMutation.isPending}
            disabled={createMutation.isPending}
            onClick={submit}
          >
            {createMutation.isPending ? "Creating…" : "Create link"}
          </SubmitButton>
        </FormActions>
      </SheetSection>
    </FieldGroup>
  )
}
