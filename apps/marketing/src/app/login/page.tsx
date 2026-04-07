"use client"

import { Button } from "@ewatrade/ui"
import { ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextUrl = searchParams.get("next") ?? null

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

      const { dashboardUrl } = body as { dashboardUrl: string }

      // Redirect to the tenant's dashboard (or the next param if same-origin)
      if (nextUrl?.startsWith("/")) {
        router.push(nextUrl)
      } else {
        window.location.href = dashboardUrl
      }
    } catch {
      setError("Network error. Please check your connection.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        {/* Heading */}
        <div className="mb-8 text-center">
          <h1
            className="text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to your ewatrade workspace.
          </p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-[1.75rem] border border-border/70 bg-background/95 p-7 shadow-[0_20px_80px_rgba(39,28,14,0.07)] backdrop-blur"
        >
          <div className="flex flex-col gap-4">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 rounded-2xl border border-border/70 bg-background px-4 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <a
                  href="/forgot-password"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 w-full rounded-2xl border border-border/70 bg-background px-4 pr-11 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <HugeiconsIcon icon={ViewOffSlashIcon} className="size-4" />
                  ) : (
                    <HugeiconsIcon icon={ViewIcon} className="size-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="mt-1 h-11 w-full rounded-2xl text-sm font-medium"
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </div>
        </form>

        {/* Footer links */}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <a
            href="/signup"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Create workspace
          </a>
        </p>
      </div>
    </main>
  )
}
