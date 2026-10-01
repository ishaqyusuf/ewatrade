"use client"

import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"
import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { z } from "zod"

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
})
const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the six-digit code"),
})

type EmailValues = z.infer<typeof emailSchema>
type CodeValues = z.infer<typeof codeSchema>

export function ExternalDeletionRequestForm() {
  const trpc = useTRPC()
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null)
  const emailForm = useZodForm<EmailValues>(emailSchema, {
    defaultValues: { email: "" },
  })
  const codeForm = useZodForm<CodeValues>(codeSchema, {
    defaultValues: { code: "" },
  })
  const send = useMutation(
    trpc.accountPrivacy.requestExternalCode.mutationOptions({
      onSuccess: (_, variables) => {
        setVerifiedEmail(variables.email.trim().toLowerCase())
      },
    }),
  )
  const submit = useMutation(
    trpc.accountPrivacy.submitExternalRequest.mutationOptions(),
  )
  const inputClasses =
    "w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:ring-2 focus:ring-primary"
  const buttonClasses =
    "min-h-11 rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50"

  return (
    <section
      aria-labelledby="deletion-request-title"
      className="space-y-5 border-t border-border pt-8"
    >
      <h2 id="deletion-request-title" className="text-xl font-semibold">
        Request account deletion
      </h2>
      <p className="leading-7 text-muted-foreground">
        If you cannot sign in, verify the email address you used for EwaTrade.
        We will track the request and review any business records that require
        separate handling. Submitting a request does not mean deletion is
        complete.
      </p>
      {submit.data ? (
        <output className="block rounded-lg border border-border bg-muted p-4 leading-6">
          Request received. Reference: <strong>{submit.data.id}</strong>.
          Status: {submit.data.status.toLowerCase().replaceAll("_", " ")}. Keep
          this reference for follow-up.
        </output>
      ) : !verifiedEmail ? (
        <form
          className="space-y-4"
          onSubmit={emailForm.handleSubmit((values) => send.mutate(values))}
        >
          <label htmlFor="deletion-email" className="block font-medium">
            Account email
          </label>
          <input
            id="deletion-email"
            autoComplete="email"
            type="email"
            className={inputClasses}
            aria-invalid={Boolean(emailForm.formState.errors.email)}
            aria-describedby={
              emailForm.formState.errors.email
                ? "deletion-email-error"
                : undefined
            }
            {...emailForm.register("email")}
          />
          {emailForm.formState.errors.email ? (
            <p
              id="deletion-email-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {emailForm.formState.errors.email.message}
            </p>
          ) : null}
          {send.error ? (
            <p role="alert" className="text-sm text-destructive">
              {send.error.message}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={send.isPending}
            className={buttonClasses}
          >
            {send.isPending ? "Sending code…" : "Email verification code"}
          </button>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={codeForm.handleSubmit((values) =>
            submit.mutate({ email: verifiedEmail, ...values }),
          )}
        >
          <output className="block text-sm text-muted-foreground">
            If an email can be sent, a six-digit code was sent to{" "}
            {verifiedEmail}. It expires in 10 minutes.
          </output>
          <label htmlFor="deletion-code" className="block font-medium">
            Verification code
          </label>
          <input
            id="deletion-code"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            className={inputClasses}
            aria-invalid={Boolean(codeForm.formState.errors.code)}
            aria-describedby={
              codeForm.formState.errors.code ? "deletion-code-error" : undefined
            }
            {...codeForm.register("code")}
          />
          {codeForm.formState.errors.code ? (
            <p
              id="deletion-code-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {codeForm.formState.errors.code.message}
            </p>
          ) : null}
          {submit.error ? (
            <p role="alert" className="text-sm text-destructive">
              {submit.error.message}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={submit.isPending}
              className={buttonClasses}
            >
              {submit.isPending ? "Submitting…" : "Submit verified request"}
            </button>
            <button
              type="button"
              className="min-h-11 px-4 underline"
              onClick={() => {
                setVerifiedEmail(null)
                codeForm.reset()
              }}
            >
              Use another email
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
