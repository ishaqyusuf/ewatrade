"use client"

import { useEffect, useState } from "react"

type GuestTermsStatus = {
  accepted: boolean
  effective: boolean
  effectiveDate: string | null
  version: string | null
}

const legalOrigin =
  process.env.NODE_ENV === "production"
    ? "https://www.ewatrade.com"
    : "https://ewatrade.localhost"

export function StoreConversationGuestTerms({
  onAllowedChange,
}: {
  onAllowedChange: (allowed: boolean) => void
}) {
  const [status, setStatus] = useState<GuestTermsStatus | null>(null)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    onAllowedChange(false)
    setStatus(null)
    setChecked(false)
    void fetch("/api/store-conversations/guest-terms", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Terms status is unavailable.")
        return (await response.json()) as GuestTermsStatus
      })
      .then((next) => {
        setStatus(next)
        onAllowedChange(next.accepted)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(
          cause instanceof Error
            ? cause.message
            : "Terms status is unavailable.",
        )
      })
    return () => controller.abort()
  }, [onAllowedChange])

  const accept = async () => {
    if (!checked || !status?.effective || !status.version || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/store-conversations/guest-terms", {
        body: JSON.stringify({ acceptedTerms: true, version: status.version }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
      const body = (await response.json()) as { message?: string }
      if (!response.ok)
        throw new Error(body.message ?? "Terms could not be accepted.")
      setStatus({ ...status, accepted: true })
      onAllowedChange(true)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Terms could not be accepted.",
      )
    } finally {
      setBusy(false)
    }
  }

  if (status?.accepted) return null
  return (
    <section
      aria-label="Terms required before messaging"
      className="mx-auto mb-3 grid max-w-3xl gap-3 rounded-2xl border border-border bg-card p-4 text-sm"
    >
      <h2 className="font-semibold">Before you post</h2>
      {!status ? (
        <p className="text-muted-foreground">Checking the current Terms…</p>
      ) : status.effective && status.version ? (
        <>
          <p className="text-muted-foreground">
            Review the EwaTrade Terms (version {status.version}, effective{" "}
            {status.effectiveDate}) before sending a message or attachment.
          </p>
          <a
            className="font-medium text-primary underline"
            href={`${legalOrigin}/terms`}
            rel="noreferrer"
            target="_blank"
          >
            Read Terms of Service
          </a>
          <label className="flex items-start gap-3">
            <input
              checked={checked}
              className="mt-1"
              onChange={(event) => setChecked(event.target.checked)}
              type="checkbox"
            />
            <span>I agree to the current EwaTrade Terms of Service.</span>
          </label>
          <button
            className="min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
            disabled={!checked || busy}
            onClick={() => void accept()}
            type="button"
          >
            {busy ? "Recording…" : "Agree and continue"}
          </button>
        </>
      ) : (
        <p className="text-muted-foreground">
          Posting is paused until the EwaTrade Terms are approved and effective.
          You can still read, report, or block this conversation.
        </p>
      )}
      {error ? (
        <p aria-live="polite" className="text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}
