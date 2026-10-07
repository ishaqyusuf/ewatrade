"use client"

import { useTRPC } from "@/trpc/client"
import { Button, Checkbox, CheckboxField, Input } from "@ewatrade/ui"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useId, useState } from "react"

export type SetupPrerequisiteState = {
  termsRequired: boolean
  financeBookMissing: boolean
}

/**
 * Business prerequisites the confirmed records will hit, shown before adding.
 * Both reuse the app's existing commands: legal acceptance and Finance setup.
 */
export function SetupPrerequisites({
  prerequisites,
  onTermsAccepted,
  onFinanceReady,
}: {
  /** Optional so an older API without the field never breaks the list. */
  prerequisites?: SetupPrerequisiteState
  onTermsAccepted: () => void
  onFinanceReady: () => void
}) {
  if (!prerequisites?.termsRequired && !prerequisites?.financeBookMissing)
    return null
  return (
    <div className="grid gap-3 border-b border-border px-4 py-3">
      {prerequisites.termsRequired ? (
        <TermsPrompt onAccepted={onTermsAccepted} />
      ) : null}
      {prerequisites.financeBookMissing ? (
        <FinancePrompt onReady={onFinanceReady} />
      ) : null}
    </div>
  )
}

function PromptCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={title}
      className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3"
    >
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {children}
    </section>
  )
}

function TermsPrompt({ onAccepted }: { onAccepted: () => void }) {
  const trpc = useTRPC()
  const status = useQuery(
    trpc.accountPrivacy.legalStatus.queryOptions(undefined, { retry: false }),
  )
  const accept = useMutation(
    trpc.accountPrivacy.acceptLegalDocuments.mutationOptions(),
  )
  const [agreed, setAgreed] = useState(false)
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const legalOrigin =
    process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"
  const version = status.data?.effective ? status.data.version : null

  return (
    <PromptCard title="Accept the EwaTrade Terms">
      {status.isPending ? (
        <p className="text-xs text-muted-foreground">Checking the Terms…</p>
      ) : version ? (
        <>
          <p className="text-xs text-muted-foreground">
            Products and services can only be added after you accept the current
            Terms (version {version}). Customers can still be added.
          </p>
          <div className="flex flex-wrap gap-3 text-xs">
            <a
              className="underline"
              href={`${legalOrigin}/terms`}
              rel="noopener noreferrer"
              target="_blank"
            >
              Read Terms of Service
            </a>
            <a
              className="underline"
              href={`${legalOrigin}/privacy`}
              rel="noopener noreferrer"
              target="_blank"
            >
              Read Privacy Notice
            </a>
          </div>
          <CheckboxField label={<>I agree to the current EwaTrade Terms.</>}>
            <Checkbox
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked)}
            />
          </CheckboxField>
          <CheckboxField label={<>I acknowledge the Privacy Notice.</>}>
            <Checkbox
              checked={privacyAcknowledged}
              onCheckedChange={(checked) => setPrivacyAcknowledged(checked)}
            />
          </CheckboxField>
          <Button
            type="button"
            size="sm"
            className="justify-self-start"
            disabled={!agreed || !privacyAcknowledged || accept.isPending}
            onClick={async () => {
              setError(null)
              try {
                await accept.mutateAsync({
                  version,
                  surface: "web",
                  acceptedTerms: true,
                  acknowledgedPrivacyNotice: true,
                })
                await status.refetch()
                onAccepted()
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "The Terms could not be accepted.",
                )
              }
            }}
          >
            {accept.isPending ? "Recording…" : "Agree and continue"}
          </Button>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Adding products and services is paused until the EwaTrade Terms are
          approved and effective. Customers can still be added.
        </p>
      )}
      {status.isError || error ? (
        <p role="alert" className="text-xs text-destructive">
          {error ?? "Terms status is unavailable. Try again shortly."}
        </p>
      ) : null}
    </PromptCard>
  )
}

function FinancePrompt({ onReady }: { onReady: () => void }) {
  const trpc = useTRPC()
  const id = useId()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const setup = useMutation(
    trpc.finance.setup.mutationOptions({ onSuccess: onReady }),
  )
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today

  return (
    <PromptCard title="Set up Finance for your balances">
      <p className="text-xs text-muted-foreground">
        Your cash and bank accounts, and what customers owe you or what you hold
        for them, are kept in your business books. Choose when your books start;
        anything waiting is added right after. Older sales and payments are not
        imported.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <label
            htmlFor={`${id}-start`}
            className="text-xs text-muted-foreground"
          >
            Books start on
          </label>
          <Input
            id={`${id}-start`}
            type="date"
            max={today}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-44"
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!valid || setup.isPending}
          onClick={() =>
            setup.mutate({ startsAt: new Date(`${date}T00:00:00.000Z`) })
          }
        >
          {setup.isPending ? "Setting up…" : "Set up Finance"}
        </Button>
      </div>
      {setup.error ? (
        <p role="alert" className="text-xs text-destructive">
          {setup.error.message}
        </p>
      ) : null}
    </PromptCard>
  )
}
