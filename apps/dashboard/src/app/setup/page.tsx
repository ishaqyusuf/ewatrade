"use client"

import { Button } from "@ewatrade/ui"
import { Add01Icon, Store04Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRouter } from "next/navigation"
import { useState } from "react"

const CURRENCIES = [
  { code: "NGN", label: "Nigerian Naira (NGN)" },
  { code: "USD", label: "US Dollar (USD)" },
  { code: "GHS", label: "Ghanaian Cedi (GHS)" },
  { code: "KES", label: "Kenyan Shilling (KES)" },
  { code: "ZAR", label: "South African Rand (ZAR)" },
  { code: "EGP", label: "Egyptian Pound (EGP)" },
]

export default function SetupPage() {
  const router = useRouter()
  const [storeName, setStoreName] = useState("")
  const [currency, setCurrency] = useState("NGN")
  const [supportEmail, setSupportEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!storeName.trim()) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: storeName.trim(),
          currencyCode: currency,
          supportEmail: supportEmail.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(
          (body as { error?: string }).error ??
            "Failed to create store. Please try again.",
        )
        return
      }

      router.push("/")
      router.refresh()
    } catch {
      setError("Network error. Please check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-lg">
      {/* Icon + heading */}
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <HugeiconsIcon icon={Store04Icon} className="size-7 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Create your first store
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Set up a store to start managing products, orders, and inventory.
          </p>
        </div>
      </div>

      {/* Form card */}
      <form
        onSubmit={handleSubmit}
        className="rounded-[1.5rem] border border-border/70 bg-background p-6 shadow-[0_8px_40px_rgba(39,28,14,0.06)]"
      >
        <div className="flex flex-col gap-5">
          {/* Store name */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="store-name" className="text-sm font-medium">
              Store name <span className="text-destructive">*</span>
            </label>
            <input
              id="store-name"
              type="text"
              required
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="e.g. Nile Market"
              className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
            />
          </div>

          {/* Currency */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="currency" className="text-sm font-medium">
              Store currency
            </label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Support email */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="support-email" className="text-sm font-medium">
              Support email{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <input
              id="support-email"
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="support@yourstore.com"
              className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading || !storeName.trim()}
            className="mt-1 h-10 w-full rounded-xl"
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            {loading ? "Creating store…" : "Create store"}
          </Button>
        </div>
      </form>
    </div>
  )
}
