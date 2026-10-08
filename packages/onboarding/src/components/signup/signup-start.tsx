"use client"

import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"
import {
  Button,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
} from "@ewatrade/ui"
import { useState } from "react"
import { useZodForm } from "../../hooks/use-zod-form"
import {
  type DirectSignupInput,
  type DirectSignupStartResponse,
  directSignupSchema,
} from "../../lib/direct-signup-schema"

type SignupStartValues = Omit<DirectSignupInput, "businessProfileKey">

// First signup screen: collect who is signing up, then hand over to the
// verified setup session the rest of the flow already uses.
export function SignupStart({
  businessProfileKey,
  loginUrl,
  onStarted,
}: {
  businessProfileKey?: string
  loginUrl: string
  onStarted: (response: DirectSignupStartResponse) => void
}) {
  const workflow = useDashboardWorkflow()
  const [submitError, setSubmitError] = useState("")
  const form = useZodForm<SignupStartValues>(
    directSignupSchema.omit({ businessProfileKey: true }),
    {
      defaultValues: { fullName: "", email: "", businessName: "", phone: "" },
    },
  )
  const errors = form.formState.errors

  async function start(values: SignupStartValues) {
    setSubmitError("")
    try {
      const response = await workflow.fetch(
        "signup_start",
        "/api/signup/start",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...values,
            ...(businessProfileKey ? { businessProfileKey } : {}),
          }),
        },
      )
      const body = (await response.json().catch(() => null)) as
        | (DirectSignupStartResponse & { message?: string })
        | { message?: string }
        | null
      if (!response.ok || !body || !("accessToken" in body))
        throw new Error(
          body?.message ?? "Signup could not be started. Try again.",
        )
      onStarted(body)
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Signup could not be started. Try again.",
      )
    }
  }

  return (
    <div>
      <div className="signup-heading">
        <p className="signup-entry">Create your store</p>
        <h1>
          Start your next
          <br />
          chapter.
        </h1>
        <p className="signup-intro">
          Start free. We’ll email you a link to confirm it’s you, then you can
          set up your business.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(start)} noValidate>
        <FieldGroup className="signup-fields">
          <Field data-invalid={Boolean(errors.fullName)}>
            <FieldLabel htmlFor="signup-start-name">Your full name</FieldLabel>
            <Input
              id="signup-start-name"
              aria-invalid={Boolean(errors.fullName)}
              {...form.register("fullName")}
              autoComplete="name"
              className="signup-input mt-1.5"
              placeholder="Ada Nwosu"
            />
            {errors.fullName && (
              <FieldError>{errors.fullName.message}</FieldError>
            )}
          </Field>
          <Field data-invalid={Boolean(errors.businessName)}>
            <FieldLabel htmlFor="signup-start-business">
              Business name
            </FieldLabel>
            <Input
              id="signup-start-business"
              aria-invalid={Boolean(errors.businessName)}
              {...form.register("businessName")}
              autoComplete="organization"
              className="signup-input mt-1.5"
              placeholder="Ada’s Farm Fresh"
            />
            {errors.businessName && (
              <FieldError>{errors.businessName.message}</FieldError>
            )}
          </Field>
          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="signup-start-email">Email address</FieldLabel>
            <Input
              id="signup-start-email"
              aria-invalid={Boolean(errors.email)}
              {...form.register("email")}
              type="email"
              autoComplete="email"
              className="signup-input mt-1.5"
              placeholder="ada@business.com"
            />
            {errors.email && <FieldError>{errors.email.message}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="signup-start-phone">
              Phone (optional)
            </FieldLabel>
            <Input
              id="signup-start-phone"
              {...form.register("phone")}
              type="tel"
              autoComplete="tel"
              className="signup-input mt-1.5"
              placeholder="0803 000 0000"
            />
          </Field>
          {submitError ? (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          ) : null}
          <div className="signup-actions">
            <a className="signup-secondary" href={loginUrl}>
              I already have an account
            </a>
            <Button
              type="submit"
              size="lg"
              className="signup-primary"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Starting…" : "Continue"}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </div>
  )
}
