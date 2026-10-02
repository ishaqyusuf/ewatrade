"use client"
import {
  Button,
  Checkbox,
  CheckboxField,
  ControlField,
  FieldGroup,
  FormActions,
  Input,
  SubmitButton,
} from "@ewatrade/ui"

import { useDomainParams } from "@/hooks/use-domain-params"
import { useTRPC } from "@/trpc/client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useRef, useState } from "react"
import { useDomainForm } from "./domain/form-context"

type Store = { id: string; name: string }

function formatMoney(amountMinor: number, currencyCode: string) {
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    style: "currency",
  }).format(amountMinor / 100)
}

export function DomainPurchaseFlow({ store }: { store: Store }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { setParams, step } = useDomainParams()
  const form = useDomainForm()
  const [error, setError] = useState<string | null>(null)
  const checkoutKey = useRef(crypto.randomUUID())
  const profileQuery = useQuery(trpc.domains.registrantProfile.queryOptions())
  const availability = useMutation(
    trpc.domains.checkAvailability.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: (result) => {
        if (
          !result.available ||
          !result.quote ||
          result.quote.provider === "EXTERNAL"
        ) {
          setError("That domain is not available. Try another name.")
          return
        }
        form.setQuote(result.quote)
        form.setTermsAccepted(false)
        setParams({ domainMode: "buy", domainStep: "owner" })
      },
    }),
  )
  const saveProfile = useMutation(
    trpc.domains.saveRegistrantProfile.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: async (profile) => {
        form.setProfileId(profile.id)
        await queryClient.invalidateQueries({
          queryKey: trpc.domains.registrantProfile.queryKey(),
        })
        setParams({ domainMode: "buy", domainStep: "review" })
      },
    }),
  )
  const checkout = useMutation(
    trpc.domains.createCheckout.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: (order) => {
        setParams({
          domainMode: "progress",
          domainOrderId: order.id,
          domainStep: null,
        })
        if (order.checkoutUrl) window.location.assign(order.checkoutUrl)
      },
    }),
  )

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    availability.mutate({ domain: form.domain, storeId: store.id })
  }

  function saveOwner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const data = new FormData(event.currentTarget)
    saveProfile.mutate({
      addressLine1: String(data.get("addressLine1") ?? ""),
      addressLine2: String(data.get("addressLine2") ?? "") || null,
      city: String(data.get("city") ?? ""),
      companyName: String(data.get("companyName") ?? "") || null,
      consentVersion: "2026-07-24",
      countryCode: String(data.get("countryCode") ?? "NG"),
      email: String(data.get("email") ?? ""),
      firstName: String(data.get("firstName") ?? ""),
      lastName: String(data.get("lastName") ?? ""),
      phoneCountryCode: String(data.get("phoneCountryCode") ?? "234"),
      phoneNumber: String(data.get("phoneNumber") ?? ""),
      postalCode: String(data.get("postalCode") ?? "") || null,
      region: String(data.get("region") ?? ""),
    })
  }

  if (step === "owner") {
    return (
      <form onSubmit={saveOwner}>
        <FieldGroup className="min-w-0 grid gap-4">
          <div className="border border-border bg-muted/40 p-4">
            <p className="font-medium">{form.quote?.normalizedDomain}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The domain owner must match a real person or registered business.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ControlField label={<>First name</>}>
              <Input name="firstName" required />
            </ControlField>
            <ControlField label={<>Last name</>}>
              <Input name="lastName" required />
            </ControlField>
          </div>
          <ControlField label={<>Business name</>}>
            <Input name="companyName" />
          </ControlField>
          <ControlField label={<>Email</>}>
            <Input name="email" type="email" required />
          </ControlField>
          <div className="grid grid-cols-[100px_1fr] gap-3">
            <ControlField label={<>Code</>}>
              <Input defaultValue="234" name="phoneCountryCode" required />
            </ControlField>
            <ControlField label={<>Phone</>}>
              <Input name="phoneNumber" required />
            </ControlField>
          </div>
          <ControlField label={<>Address</>}>
            <Input name="addressLine1" required />
          </ControlField>
          <Input
            aria-label="Address line 2"
            name="addressLine2"
            placeholder="Address line 2 (optional)"
          />
          <div className="grid grid-cols-2 gap-3">
            <ControlField label={<>City</>}>
              <Input name="city" required />
            </ControlField>
            <ControlField label={<>State</>}>
              <Input name="region" required />
            </ControlField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ControlField label={<>Country</>}>
              <Input defaultValue="NG" name="countryCode" required />
            </ControlField>
            <ControlField label={<>Postal code</>}>
              <Input name="postalCode" />
            </ControlField>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <FormActions className="pt-2">
            <Button
              appearance="form"
              type="button"
              variant="outline"
              onClick={() =>
                setParams({ domainMode: "buy", domainStep: "search" })
              }
            >
              Back
            </Button>
            <SubmitButton
              isSubmitting={saveProfile.isPending}
              type="submit"
              disabled={saveProfile.isPending}
            >
              {saveProfile.isPending ? "Saving…" : "Continue"}
            </SubmitButton>
          </FormActions>
        </FieldGroup>
      </form>
    )
  }

  if (step === "review") {
    const profileId = form.profileId ?? profileQuery.data?.id ?? null
    return (
      <div className="grid gap-5">
        <div className="border border-border p-5">
          <p className="text-sm text-muted-foreground">Domain</p>
          <p className="mt-1 text-lg font-semibold">
            {form.quote?.normalizedDomain}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">Due today</p>
          <p className="mt-1 text-2xl font-semibold">
            {form.quote
              ? formatMoney(
                  form.quote.retailPriceMinor,
                  form.quote.retailCurrencyCode,
                )
              : "—"}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          By paying, you authorize EwaTrade to register this domain for one year
          using the saved legal owner details. Provider costs and taxes are
          included in the displayed price.
        </p>
        <CheckboxField
          label=<span>
            I am authorized by the domain owner and accept the{" "}
            <a
              className="font-medium text-primary underline underline-offset-4"
              href={
                form.quote?.provider === "GO54"
                  ? "https://go54.com/domain-registrant-agreement"
                  : "https://www.openprovider.com/company/policies"
              }
              rel="noreferrer"
              target="_blank"
            >
              registrar’s registration and privacy policies
            </a>
            , including applicable ICANN or NiRA dispute rules.
          </span>
        >
          <Checkbox
            checked={form.termsAccepted}
            onCheckedChange={(checked) => form.setTermsAccepted(checked)}
          />
        </CheckboxField>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button
          appearance="form"
          disabled={
            !form.quote ||
            !profileId ||
            !form.termsAccepted ||
            checkout.isPending
          }
          onClick={() => {
            if (!form.quote || !profileId) return
            checkout.mutate({
              idempotencyKey: checkoutKey.current,
              quoteId: form.quote.id,
              registrantProfileId: profileId,
              surface: "dashboard",
              termsVersion: "2026-07-24",
            })
          }}
        >
          {checkout.isPending ? "Opening secure checkout…" : "Pay securely"}
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={search}>
      <FieldGroup className="min-w-0 grid gap-5">
        <div>
          <ControlField label={<>Find your domain</>}>
            <Input
              placeholder="yourbusiness.com.ng"
              value={form.domain}
              onChange={(event) => form.setDomain(event.target.value)}
            />
          </ControlField>
          <p className="mt-2 text-xs text-muted-foreground">
            .com.ng is registered through GO54. .com is registered through
            Openprovider. You always see one final NGN price.
          </p>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <FormActions>
          <SubmitButton
            isSubmitting={availability.isPending}
            type="submit"
            disabled={availability.isPending}
          >
            {availability.isPending ? "Checking…" : "Check availability"}
          </SubmitButton>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
