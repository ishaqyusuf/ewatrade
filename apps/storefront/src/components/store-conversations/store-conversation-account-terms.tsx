"use client"

import { useCallback, useEffect, useState } from "react"

type TermsStatus = {
  accepted: boolean
  effective: boolean
  effectiveDate: string | null
  version: string | null
}

export function StoreConversationAccountTerms({
  onAllowedChange,
}: {
  onAllowedChange: (allowed: boolean) => void
}) {
  const [status, setStatus] = useState<TermsStatus | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const legalOrigin = (
    process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"
  ).replace(/\/$/, "")

  const refresh = useCallback(async () => {
    const response = await fetch("/api/store-conversations/account/terms", {
      cache: "no-store",
    })
    if (!response.ok) throw new Error("Terms status is unavailable.")
    setStatus((await response.json()) as TermsStatus)
  }, [])

  useEffect(() => {
    void refresh().catch((cause) =>
      setError(
        cause instanceof Error ? cause.message : "Terms status is unavailable.",
      ),
    )
  }, [refresh])

  useEffect(() => {
    onAllowedChange(status?.effective === true && status.accepted === true)
  }, [onAllowedChange, status?.accepted, status?.effective])

  if (status?.effective && status.accepted) return null

  return (
    <aside
      className="mx-auto mb-3 grid max-w-3xl gap-3 rounded-2xl border border-border bg-card p-4"
      aria-label="Terms required before posting"
    >
      <h2 className="font-semibold">Before you post</h2>
      {status?.effective && status.version ? (
        <>
          <p className="text-sm text-muted-foreground">
            Review the effective Terms (version {status.version}) before sending
            a message. You can still read, report, or block this conversation.
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
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              type="checkbox"
            />
            I agree to the current EwaTrade Terms.
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              checked={privacyAcknowledged}
              onChange={(event) => setPrivacyAcknowledged(event.target.checked)}
              type="checkbox"
            />
            I acknowledge the Privacy Notice.
          </label>
          <button
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            disabled={!agreed || !privacyAcknowledged || pending}
            onClick={async () => {
              setPending(true)
              setError(null)
              try {
                const response = await fetch(
                  "/api/store-conversations/account/terms",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      acceptedTerms: true,
                      acknowledgedPrivacyNotice: true,
                      version: status.version,
                    }),
                  },
                )
                if (!response.ok)
                  throw new Error(
                    "Terms acceptance could not be recorded. Reload and try again.",
                  )
                await refresh()
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Terms acceptance failed.",
                )
              } finally {
                setPending(false)
              }
            }}
            type="button"
          >
            {pending ? "Recording…" : "Agree and continue"}
          </button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Posting is paused until the EwaTrade Terms are approved and effective.
          You can still read, report, or block this conversation.
        </p>
      )}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </aside>
  )
}
