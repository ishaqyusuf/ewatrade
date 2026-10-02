"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
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
import { useState } from "react"

export function LoginForm({
  next,
  initialError,
  marketingUrl,
}: { next?: string; initialError?: string; marketingUrl: string }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    initialError === "no_tenant"
      ? "Your account does not have an active workspace. Contact your workspace owner or request early access."
      : null,
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/login", {
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
    } catch {
      setError("Network error. Please check your connection.")
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
            href={`${marketingUrl}/#early-access`}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Request early access
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
              <Input
                disabled={loading}
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>

            {/* Password */}
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

            {error && (
              <FormFeedback appearance="dashboard">{error}</FormFeedback>
            )}

            <FormActions>
              <SubmitButton
                isSubmitting={loading}
                type="submit"
                disabled={loading}
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
