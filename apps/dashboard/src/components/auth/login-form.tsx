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
    emailField: ReactNode
    canSignIn: boolean
    signIn(): Promise<void>
  }
}) {
  const workflow = useDashboardWorkflow()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
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
      const res = await workflow.fetch("login", "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

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
                Email address
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
            {!accountEntry && (
              <Field className="gap-1.5">
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <a
                    href={`${marketingUrl}/contact`}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Need help?
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
                {loading ? "Signing in…" : "Sign in"}
              </SubmitButton>
            </FormActions>
          </div>
        </FieldGroup>
      </form>
    </AuthShell>
  )
}
