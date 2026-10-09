"use client"
import {
  Button,
  ControlField,
  FieldGroup,
  FormActions,
  Input,
  SubmitButton,
} from "@ewatrade/ui"

import { FormFeedback } from "@/components/forms/form-feedback"

import type { RegisterServiceCommerceFormReset } from "@/components/service-commerce/form-context"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  type ServiceCommerceManualWhatsAppConnection,
  serviceCommerceManualWhatsAppConnectionSchema,
} from "@ewatrade/service-commerce"

import { type ReactElement, cloneElement, useEffect } from "react"

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
  embeddedSignupError,
  embeddedSignupLoading,
  embeddedSignupUrl,
  error,
  isPending,
  onRetryEmbeddedSignup,
  onSubmit,
  registerReset,
}: {
  embeddedSignupError: boolean
  embeddedSignupLoading: boolean
  embeddedSignupUrl: string | null
  error?: string | null
  isPending: boolean
  onRetryEmbeddedSignup: () => void
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
            className="inline-flex h-10 items-center justify-center rounded-md border border-transparent bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80"
            href={embeddedSignupUrl}
          >
            Continue with Meta
          </a>
        ) : embeddedSignupLoading ? (
          <Button appearance="form" disabled type="button">
            Checking Meta signup…
          </Button>
        ) : embeddedSignupError ? (
          <div className="grid gap-2 sm:max-w-64">
            <FormFeedback appearance="dashboard">
              Meta signup is temporarily unavailable. Manual setup remains
              available.
            </FormFeedback>
            <Button
              appearance="form"
              disabled={embeddedSignupLoading}
              onClick={onRetryEmbeddedSignup}
              type="button"
              variant="outline"
            >
              Retry Meta signup
            </Button>
          </div>
        ) : (
          <div className="grid gap-2 sm:max-w-64">
            <Button appearance="form" disabled type="button">
              Embedded signup unavailable
            </Button>
            <p className="text-xs text-muted-foreground">
              Meta signup is not configured for this workspace. Manual setup
              remains available.
            </p>
          </div>
        )}
      </div>

      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Manual setup for an approved onboarding session
        </summary>
        <form className="mt-4" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup className="min-w-0 grid gap-4 sm:grid-cols-2">
            {error ? (
              <FormFeedback appearance="dashboard">{error}</FormFeedback>
            ) : null}
            <Field
              error={form.formState.errors.businessDisplayName?.message}
              htmlFor="channel-business-name"
              label="Business display name"
            >
              <Input
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
              <Input
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
              <Input id="channel-waba-id" {...form.register("wabaId")} />
            </Field>
            <Field
              error={form.formState.errors.phoneNumberId?.message}
              htmlFor="channel-phone-number-id"
              label="Phone number ID"
            >
              <Input
                id="channel-phone-number-id"
                {...form.register("phoneNumberId")}
              />
            </Field>
            <Field
              error={form.formState.errors.displayNumber?.message}
              htmlFor="channel-display-number"
              label="Display number"
            >
              <Input
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
              <Input
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
              <Input
                autoComplete="new-password"
                id="channel-access-token"
                type="password"
                {...form.register("accessToken")}
              />
            </Field>
            <FormActions className="sm:col-span-2">
              <SubmitButton
                isSubmitting={isPending}
                disabled={isPending}
                type="submit"
              >
                {isPending ? "Saving…" : "Save candidate and test"}
              </SubmitButton>
            </FormActions>
          </FieldGroup>
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
  children: ReactElement<{ id?: string }>
  className?: string
  error?: string
  htmlFor: string
  label: string
}) {
  return (
    <ControlField label={label} error={error} className={className}>
      {cloneElement(children, { id: htmlFor })}
    </ControlField>
  )
}
