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
    <section className="grid gap-5">
      <div className="grid gap-3">
        <p className="text-muted-foreground">
          Sign in to Meta and pick a number your business owns.
        </p>
        {embeddedSignupUrl ? (
          <a
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/80"
            href={embeddedSignupUrl}
          >
            Continue with Meta
          </a>
        ) : embeddedSignupLoading ? (
          <Button disabled type="button">
            Checking Meta…
          </Button>
        ) : embeddedSignupError ? (
          <div className="grid gap-2">
            <FormFeedback appearance="dashboard">
              Meta sign-in isn't working right now.
            </FormFeedback>
            <Button
              disabled={embeddedSignupLoading}
              onClick={onRetryEmbeddedSignup}
              type="button"
              variant="outline"
            >
              Try again
            </Button>
          </div>
        ) : (
          <Button disabled type="button">
            Meta sign-in isn't set up yet
          </Button>
        )}
      </div>

      <details className="rounded-[10px] border border-border p-4">
        <summary className="min-h-11 cursor-pointer content-center font-medium">
          Enter the details by hand
        </summary>
        <form className="mt-4" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup className="min-w-0 grid gap-4 sm:grid-cols-2">
            {error ? (
              <FormFeedback appearance="dashboard">{error}</FormFeedback>
            ) : null}
            <Field
              error={form.formState.errors.businessDisplayName?.message}
              htmlFor="channel-business-name"
              label="Name customers see"
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
              label="Test phone (agreed to get a test message)"
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
              label="Access token"
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
                {isPending ? "Saving…" : "Save and check"}
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
