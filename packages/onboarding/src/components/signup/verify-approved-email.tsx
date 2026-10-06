"use client"

import { useState } from "react"
import type { EarlyAccessQaPreview } from "../../lib/early-access-preview"
import { EarlyAccessPreview } from "../early-access-preview"

export function VerifyApprovedEmail({
  accessToken,
  email,
}: { accessToken: string; email: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [preview, setPreview] = useState<EarlyAccessQaPreview | null>(null)
  async function send() {
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/early-access/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken }),
      })
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
    <section className="space-y-4" aria-label="Verify approved contact email">
      <h1 className="text-2xl font-semibold">Verify your email to continue.</h1>
      <p>
        Your request is approved. Confirm <strong>{email}</strong> before
        setting up your workspace.
      </p>
      <button
        type="button"
        className="signup-primary"
        disabled={busy}
        onClick={() => void send()}
      >
        {busy ? "Sending…" : "Send verification email"}
      </button>
      <output aria-live="polite">{message}</output>
      {preview ? <EarlyAccessPreview preview={preview} /> : null}
    </section>
  )
}
