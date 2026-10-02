"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { Button, Checkbox, CheckboxField } from "@ewatrade/ui"

import { useTRPC } from "@/trpc/client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"

export function ConversationAccountTerms({
  onAllowedChange,
}: {
  onAllowedChange: (allowed: boolean) => void
}) {
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

  useEffect(() => {
    onAllowedChange(
      status.data?.effective === true && status.data.accepted === true,
    )
  }, [onAllowedChange, status.data?.effective, status.data?.accepted])

  if (status.data?.effective && status.data.accepted) return null

  return (
    <section
      className="grid gap-3 rounded-none border border-border bg-muted/30 p-4"
      aria-label="Terms required before posting"
    >
      <h3 className="font-medium">Before you reply</h3>
      {status.data?.effective && status.data.version ? (
        <>
          <p className="text-sm text-muted-foreground">
            Review and accept the effective Terms (version {status.data.version}
            ) before posting. You can still read, report, or restrict this
            conversation.
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
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
            disabled={!agreed || !privacyAcknowledged || accept.isPending}
            onClick={async () => {
              setError(null)
              try {
                await accept.mutateAsync({
                  version: status.data.version as string,
                  surface: "web",
                  acceptedTerms: true,
                  acknowledgedPrivacyNotice: true,
                })
                await status.refetch()
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Terms could not be accepted.",
                )
              }
            }}
            type="button"
            appearance="form"
          >
            {accept.isPending ? "Recording…" : "Agree and continue"}
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Posting is paused until the EwaTrade Terms are approved and effective.
          You can still read or report this conversation.
        </p>
      )}
      {status.isError || error ? (
        <FormFeedback appearance="dashboard">
          {error ?? "Terms status is unavailable."}
        </FormFeedback>
      ) : null}
    </section>
  )
}
