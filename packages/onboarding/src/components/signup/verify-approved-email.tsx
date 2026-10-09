"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"

import { useState } from "react"
import type { EarlyAccessQaPreview } from "../../lib/early-access-preview"
import { EarlyAccessPreview } from "../early-access-preview"

export function VerifyApprovedEmail({
  accessToken,
  email,
  initialPreview = null,
}: {
  accessToken: string
  email: string
  initialPreview?: EarlyAccessQaPreview | null
}) {
  const workflow = useDashboardWorkflow()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [preview, setPreview] = useState<EarlyAccessQaPreview | null>(
    initialPreview,
  )
  async function send() {
    setBusy(true)
    setMessage("")
    try {
      const response = await workflow.fetch(
        "verify_email",
        "/api/early-access/verification",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        },
      )
      const result = (await response.json()) as {
        message?: string
        qaPreview?: EarlyAccessQaPreview
      }
      if (!response.ok)
        throw new Error(
          result.message ?? "The verification email could not be sent.",
        )
      setMessage(result.message ?? "Check your email to continue.")
      setPreview(result.qaPreview ?? null)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The verification email could not be sent. Try again.",
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-4" aria-label="Confirm your email">
      <h1 className="text-2xl font-semibold">Check your email.</h1>
      <p>
        We sent a confirmation link to <strong>{email}</strong>. Open it to
        continue setting up your business. This page updates once you confirm.
      </p>
      <button
        type="button"
        className="signup-primary"
        disabled={busy}
        onClick={() => void send()}
      >
        {busy ? "Sending…" : "Resend the link"}
      </button>
      <output aria-live="polite">{message}</output>
      {preview ? <EarlyAccessPreview preview={preview} /> : null}
    </section>
  )
}
