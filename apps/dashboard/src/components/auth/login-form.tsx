"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"
import {
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  SubmitButton,
} from "@ewatrade/ui"
import { AuthLink, AuthShell } from "./auth-shell"

import { getLoginDestination } from "@/lib/login-navigation"

import { ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { type ReactNode, useState } from "react"

export function LoginForm({
  next,
  initialError,
  marketingUrl,
  accountEntry,
}: {
  next?: string
  initialError?: string
  marketingUrl: string
  accountEntry?: {
    label?: string
    emailField: ReactNode
    canSignIn: boolean
    signIn(): Promise<void>
  }
}) {
  const workflow = useDashboardWorkflow()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [method, setMethod] = useState<"password" | "code">("password")
  const [codeEmail, setCodeEmail] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [previewQaCode, setPreviewQaCode] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    initialError === "no_tenant"
      ? "This account has no business yet. Create your store, or ask your business owner for an invite."
      : null,
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (accountEntry) {
        await accountEntry.signIn()
        return
      }
      if (method === "code" && codeEmail !== email) {
        await sendCode()
        return
      }
      const res = await workflow.fetch(
        "login",
        method === "code" ? "/api/auth/login-code" : "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            method === "code"
              ? {
                  action: "verify",
                  email,
                  code,
                  next: getLoginDestination(next),
                }
              : { email, password, next: getLoginDestination(next) },
          ),
        },
      )

      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(
          (body as { error?: string }).error ??
            "Sign in failed. Please try again.",
        )
        return
      }

      window.location.assign(getLoginDestination(next))
    } catch (cause) {
      setError(
        accountEntry && cause instanceof Error
          ? cause.message
          : "Network error. Please check your connection.",
      )
    } finally {
      setLoading(false)
    }
  }

  async function sendCode() {
    setNotice(null)
    const res = await fetch("/api/auth/login-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request", email }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      previewQaCode?: string
    }
    if (!res.ok) {
      setError(body.error ?? "We could not send a code. Please try again.")
      return
    }
    setCode("")
    setCodeEmail(email)
    setPreviewQaCode(body.previewQaCode ?? null)
    setNotice(
      body.previewQaCode
        ? `Use ${body.previewQaCode}. It works for 10 minutes.`
        : `Code sent to ${email}. It works for 10 minutes.`,
    )
  }

  async function resendCode() {
    setLoading(true)
    setError(null)
    try {
      await sendCode()
    } catch {
      setError("Network error. Please check your connection.")
    } finally {
      setLoading(false)
    }
  }

  function switchMethod(nextMethod: "password" | "code") {
    setMethod(nextMethod)
    setError(null)
    setNotice(null)
    setCode("")
    setCodeEmail(null)
    setPreviewQaCode(null)
  }

  const awaitingCode = !accountEntry && method === "code" && codeEmail === email

  return (
    <AuthShell
      title="Sign in"
      brandHref={marketingUrl}
      footer={
        <p>
          New to ẸwáTrade? <AuthLink href="/signup">Create your store</AuthLink>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="min-w-0">
        <FieldGroup className="min-w-0 gap-5">
          <Field>
            <FieldLabel htmlFor="email">
              {accountEntry?.label ?? "Email"}
            </FieldLabel>
            {accountEntry?.emailField ?? (
              <Input
                disabled={loading}
                id="email"
                name="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>

          {!accountEntry && method === "password" && (
            <Field>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <AuthLink href="/forgot-password" className="text-xs">
                  Forgot password?
                </AuthLink>
              </div>
              <InputGroup appearance="form">
                <InputGroupInput
                  disabled={loading}
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    disabled={loading}
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    size="icon-sm"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    <HugeiconsIcon
                      icon={showPassword ? ViewOffSlashIcon : ViewIcon}
                    />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          )}

          {awaitingCode && (
            <Field>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor="login-code">Code</FieldLabel>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void resendCode()}
                  className="text-xs font-medium text-[var(--link)] underline-offset-4 hover:underline"
                >
                  {previewQaCode ? "Refresh code" : "Send a new code"}
                </button>
              </div>
              <Input
                disabled={loading}
                id="login-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="tabular-nums tracking-[0.3em]"
              />
            </Field>
          )}

          {awaitingCode && notice && !error && (
            <FormFeedback appearance="dashboard" variant="default">
              {notice}
            </FormFeedback>
          )}

          {error && <FormFeedback appearance="dashboard">{error}</FormFeedback>}

          <SubmitButton
            isSubmitting={loading}
            type="submit"
            disabled={loading || (accountEntry && !accountEntry.canSignIn)}
            className="w-full"
          >
            {method === "code" && !awaitingCode && !accountEntry
              ? loading
                ? "Sending code…"
                : "Email me a code"
              : loading
                ? "Signing in…"
                : "Sign in"}
          </SubmitButton>

          {!accountEntry && (
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={() =>
                switchMethod(method === "password" ? "code" : "password")
              }
              className="w-full"
            >
              {method === "password"
                ? "Sign in with an email code"
                : "Sign in with a password"}
            </Button>
          )}
        </FieldGroup>
      </form>
    </AuthShell>
  )
}
