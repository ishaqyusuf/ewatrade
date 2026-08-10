"use client"

import type { RegisterServiceCommerceFormReset } from "@/components/service-commerce/form-context"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  type ServiceCommerceManualWhatsAppConnection,
  serviceCommerceManualWhatsAppConnectionSchema,
} from "@ewatrade/service-commerce"
import { Button } from "@ewatrade/ui"
import { useEffect } from "react"

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

const defaults: ServiceCommerceManualWhatsAppConnection = {
  accessToken: "",
  billingOwner: "",
  businessDisplayName: "",
  displayNumber: "",
  phoneNumberId: "",
  testRecipient: "",
  wabaId: "",
}

export function ConnectionForm({
  embeddedSignupUrl,
  error,
  isPending,
  onSubmit,
  registerReset,
}: {
  embeddedSignupUrl: string | null
  error?: string | null
  isPending: boolean
  onSubmit: (values: ServiceCommerceManualWhatsAppConnection) => void
  registerReset?: RegisterServiceCommerceFormReset
}) {
  const form = useZodForm<ServiceCommerceManualWhatsAppConnection>(
    serviceCommerceManualWhatsAppConnectionSchema,
    { defaultValues: defaults },
  )
  useEffect(
    () => registerReset?.(() => form.reset(defaults)),
    [form, registerReset],
  )

  return (
    <section className="grid gap-5 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Setup
          </p>
          <h2 className="font-semibold">Connect WhatsApp</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Authorize a business-owned number. EwaTrade uses one verified Meta
            application while every sender, credential and billing owner stays
            isolated to this business.
          </p>
        </div>
        {embeddedSignupUrl ? (
          <a
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            href={embeddedSignupUrl}
          >
            Continue with Meta
          </a>
        ) : (
          <Button disabled type="button">
            Embedded signup unavailable
          </Button>
        )}
      </div>

      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Manual setup for an approved onboarding session
        </summary>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          {error ? (
            <p
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <Field
            error={form.formState.errors.businessDisplayName?.message}
            htmlFor="channel-business-name"
            label="Business display name"
          >
            <input
              className={fieldClass}
              id="channel-business-name"
              placeholder="Main customer line"
              {...form.register("businessDisplayName")}
            />
          </Field>
          <Field
            error={form.formState.errors.billingOwner?.message}
            htmlFor="channel-billing-owner"
            label="Billing owner"
          >
            <input
              className={fieldClass}
              id="channel-billing-owner"
              placeholder="Business"
              {...form.register("billingOwner")}
            />
          </Field>
          <Field
            error={form.formState.errors.wabaId?.message}
            htmlFor="channel-waba-id"
            label="WhatsApp Business Account ID"
          >
            <input
              className={fieldClass}
              id="channel-waba-id"
              {...form.register("wabaId")}
            />
          </Field>
          <Field
            error={form.formState.errors.phoneNumberId?.message}
            htmlFor="channel-phone-number-id"
            label="Phone number ID"
          >
            <input
              className={fieldClass}
              id="channel-phone-number-id"
              {...form.register("phoneNumberId")}
            />
          </Field>
          <Field
            error={form.formState.errors.displayNumber?.message}
            htmlFor="channel-display-number"
            label="Display number"
          >
            <input
              className={fieldClass}
              id="channel-display-number"
              placeholder="+234…"
              {...form.register("displayNumber")}
            />
          </Field>
          <Field
            error={form.formState.errors.testRecipient?.message}
            htmlFor="channel-test-recipient"
            label="Consented test recipient"
          >
            <input
              className={fieldClass}
              id="channel-test-recipient"
              placeholder="+234…"
              {...form.register("testRecipient")}
            />
          </Field>
          <Field
            className="sm:col-span-2"
            error={form.formState.errors.accessToken?.message}
            htmlFor="channel-access-token"
            label="Temporary access token"
          >
            <input
              autoComplete="off"
              className={fieldClass}
              id="channel-access-token"
              type="password"
              {...form.register("accessToken")}
            />
          </Field>
          <div className="sm:col-span-2">
            <Button disabled={isPending} type="submit">
              {isPending ? "Saving…" : "Save candidate and test"}
            </Button>
          </div>
        </form>
      </details>
    </section>
  )
}

function Field({
  children,
  className = "",
  error,
  htmlFor,
  label,
}: {
  children: React.ReactNode
  className?: string
  error?: string
  htmlFor: string
  label: string
}) {
  return (
    <label className={`grid gap-1.5 text-sm ${className}`} htmlFor={htmlFor}>
      <span className="font-medium">{label}</span>
      {children}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </label>
  )
}
