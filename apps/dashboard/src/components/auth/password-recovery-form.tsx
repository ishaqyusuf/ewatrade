"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FormActions,
  Input,
  SubmitButton,
} from "@ewatrade/ui"
import { useEffect, useRef, useState } from "react"
import { AuthShell } from "./auth-shell"

export function PasswordRecoveryForm({ mode }: { mode: "request" | "reset" }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [token, setToken] = useState<string | null>(null)
  const [ready, setReady] = useState(mode === "request")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [invalidLink, setInvalidLink] = useState(false)
  const readLink = useRef(false)

  useEffect(() => {
    if (mode !== "reset") return
    function readToken() {
      const value = new URLSearchParams(window.location.hash.slice(1)).get(
        "token",
      )
      setToken(value)
      setInvalidLink(!value || value.length > 256)
      setReady(true)
      setMessage(null)
      setError(null)
      setPassword("")
      setConfirmation("")
      // Keep the secret in component memory only, never analytics or storage.
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname,
      )
    }
    if (!readLink.current) {
      readLink.current = true
      readToken()
    }
    window.addEventListener("hashchange", readToken)
    return () => window.removeEventListener("hashchange", readToken)
  }, [mode])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    setError(null)
    if (mode === "reset" && password !== confirmation) {
      setError("Passwords do not match.")
      return
    }
    setLoading(true)
    try {
      const response = await fetch(
        `/api/auth/${mode === "request" ? "request-password-reset" : "reset-password"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "request"
              ? { email: email.trim().toLowerCase() }
              : { token, newPassword: password },
          ),
        },
      )
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (result.code === "INVALID_TOKEN") setInvalidLink(true)
        setError(result.error ?? "Something went wrong. Please try again.")
        return
      }
      setMessage(
        mode === "request"
          ? result.message
          : "Your password has been reset. Sign in with your new password.",
      )
      setPassword("")
      setConfirmation("")
      setToken(null)
    } catch {
      setError("Network error. Please check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title={
        mode === "request" ? "Forgot your password?" : "Choose a new password"
      }
      description={
        mode === "request"
          ? "Enter your account email and we’ll send you a reset link."
          : "Use 8–128 characters for your new password."
      }
      asideTitle="Back to your business."
      asideDescription="Recover access to your EwaTrade workspace securely."
      brandHref={
        process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"
      }
      footer={
        <p className="mt-6 text-center text-sm">
          <a
            href="/login"
            className="font-medium underline-offset-2 hover:underline"
          >
            Back to sign in
          </a>
        </p>
      }
    >
      {message ? (
        <FormFeedback appearance="dashboard" variant="default">
          {message}
        </FormFeedback>
      ) : invalidLink ? (
        <div className="space-y-4">
          <FormFeedback appearance="dashboard">
            This reset link is missing, expired or already used. Open the link
            in your email again, or request a new one.
          </FormFeedback>
          <a href="/forgot-password" className="text-sm font-medium underline">
            Request a new reset link
          </a>
        </div>
      ) : (
        <form onSubmit={submit}>
          <FieldGroup className="gap-5">
            {mode === "request" ? (
              <Field>
                <FieldLabel htmlFor="recovery-email">Email address</FieldLabel>
                <Input
                  id="recovery-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  disabled={loading}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </Field>
            ) : (
              <>
                <Field>
                  <FieldLabel htmlFor="new-password">New password</FieldLabel>
                  <Input
                    id="new-password"
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                    disabled={loading || !ready}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirm-password">
                    Confirm new password
                  </FieldLabel>
                  <Input
                    id="confirm-password"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                    disabled={loading || !ready}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </Field>
              </>
            )}
            {error && (
              <FormFeedback appearance="dashboard">{error}</FormFeedback>
            )}
            <FormActions>
              <SubmitButton
                type="submit"
                isSubmitting={loading}
                disabled={loading || !ready}
                className="w-full"
              >
                {loading
                  ? "Please wait…"
                  : mode === "request"
                    ? "Send reset link"
                    : "Reset password"}
              </SubmitButton>
            </FormActions>
          </FieldGroup>
        </form>
      )}
    </AuthShell>
  )
}
