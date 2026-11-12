"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FormActions,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  SubmitButton,
} from "@ewatrade/ui"
import { AuthShell } from "./auth-shell"

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
      ? "Your account does not have an active workspace. Contact your workspace owner or create your own store."
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
        ? `Use ${body.previewQaCode} to sign in. It expires in 10 minutes.`
        : `We sent a 6-digit code to ${email}. It expires in 10 minutes.`,
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
      title="Welcome back"
      description="Sign in to your EwaTrade workspace."
      asideTitle="Your business, in view."
      asideDescription="Manage your catalog, sales, service work and team from one workspace."
      brandHref={marketingUrl}
      footer={
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New to EwaTrade?{" "}
          <a
            href="/signup"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Create your store
          </a>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="min-w-0">
        <FieldGroup className="min-w-0 gap-5">
          <div className="flex flex-col gap-4">
            {/* Email */}
            <Field className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="email" className="text-sm font-medium">
                {accountEntry?.label ?? "Email address"}
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
                  placeholder="you@example.com"
                />
              )}
            </Field>

            {/* Password */}
            {!accountEntry && method === "password" && (
              <Field className="gap-1.5">
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <a
                    href="/forgot-password"
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Forgot password?
                  </a>
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
                    placeholder="••••••••"
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
                      {showPassword ? (
                        <HugeiconsIcon icon={ViewOffSlashIcon} />
                      ) : (
                        <HugeiconsIcon icon={ViewIcon} />
                      )}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            )}

            {/* Login code */}
            {awaitingCode && (
              <Field className="gap-1.5">
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="login-code">Login code</FieldLabel>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void resendCode()}
                    className="text-xs text-muted-foreground hover:text-foreground"
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
                  placeholder="123456"
                />
              </Field>
            )}

            {awaitingCode && notice && !error && (
              <FormFeedback appearance="dashboard" variant="default">
                {notice}
              </FormFeedback>
            )}

            {error && (
              <FormFeedback appearance="dashboard">{error}</FormFeedback>
            )}

            <FormActions>
              <SubmitButton
                isSubmitting={loading}
                type="submit"
                disabled={loading || (accountEntry && !accountEntry.canSignIn)}
                className="mt-1 w-full"
              >
                {method === "code" && !awaitingCode && !accountEntry
                  ? loading
                    ? "Getting code…"
                    : "Get login code"
                  : loading
                    ? "Signing in…"
                    : "Sign in"}
              </SubmitButton>
            </FormActions>

            {!accountEntry && (
              <button
                type="button"
                disabled={loading}
                onClick={() =>
                  switchMethod(method === "password" ? "code" : "password")
                }
                className="text-center text-sm text-muted-foreground hover:text-foreground"
              >
                {method === "password"
                  ? "Use a login code instead"
                  : "Sign in with a password instead"}
              </button>
            )}
          </div>
        </FieldGroup>
      </form>
    </AuthShell>
  )
}
