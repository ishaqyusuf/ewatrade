"use client"

import { useDomainParams } from "@/hooks/use-domain-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useRef, useState } from "react"
import { useDomainForm } from "./domain/form-context"

type Store = { id: string; name: string }

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

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
      <form className="grid gap-4" onSubmit={saveOwner}>
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="font-medium">{form.quote?.normalizedDomain}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The domain owner must match a real person or registered business.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-sm">
            First name
            <input className={inputClass} name="firstName" required />
          </label>
          <label className="grid gap-1.5 text-sm">
            Last name
            <input className={inputClass} name="lastName" required />
          </label>
        </div>
        <label className="grid gap-1.5 text-sm">
          Business name
          <input className={inputClass} name="companyName" />
        </label>
        <label className="grid gap-1.5 text-sm">
          Email
          <input className={inputClass} name="email" type="email" required />
        </label>
        <div className="grid grid-cols-[100px_1fr] gap-3">
          <label className="grid gap-1.5 text-sm">
            Code
            <input
              className={inputClass}
              defaultValue="234"
              name="phoneCountryCode"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            Phone
            <input className={inputClass} name="phoneNumber" required />
          </label>
        </div>
        <label className="grid gap-1.5 text-sm">
          Address
          <input className={inputClass} name="addressLine1" required />
        </label>
        <input
          aria-label="Address line 2"
          className={inputClass}
          name="addressLine2"
          placeholder="Address line 2 (optional)"
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-sm">
            City
            <input className={inputClass} name="city" required />
          </label>
          <label className="grid gap-1.5 text-sm">
            State
            <input className={inputClass} name="region" required />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-sm">
            Country
            <input
              className={inputClass}
              defaultValue="NG"
              name="countryCode"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            Postal code
            <input className={inputClass} name="postalCode" />
          </label>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setParams({ domainMode: "buy", domainStep: "search" })
            }
          >
            Back
          </Button>
          <Button type="submit" disabled={saveProfile.isPending}>
            {saveProfile.isPending ? "Saving…" : "Continue"}
          </Button>
        </div>
      </form>
    )
  }

  if (step === "review") {
    const profileId = form.profileId ?? profileQuery.data?.id ?? null
    return (
      <div className="grid gap-5">
        <div className="rounded-xl border border-border p-5">
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
        <label className="flex items-start gap-3 rounded-lg border border-border p-4 text-sm">
          <input
            checked={form.termsAccepted}
            className="mt-0.5 size-4 rounded border-border"
            type="checkbox"
            onChange={(event) => form.setTermsAccepted(event.target.checked)}
          />
          <span>
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
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button
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
    <form className="grid gap-5" onSubmit={search}>
      <div>
        <label className="grid gap-1.5 text-sm font-medium">
          Find your domain
          <input
            className={inputClass}
            placeholder="yourbusiness.com.ng"
            value={form.domain}
            onChange={(event) => form.setDomain(event.target.value)}
          />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          .com.ng is registered through GO54. .com is registered through
          Openprovider. You always see one final NGN price.
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={availability.isPending}>
        {availability.isPending ? "Checking…" : "Check availability"}
      </Button>
    </form>
  )
}
