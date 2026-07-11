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

const COUNTRIES = [
  { code: "NG", currencyCode: "NGN", label: "Nigeria" },
  { code: "GH", currencyCode: "GHS", label: "Ghana" },
  { code: "KE", currencyCode: "KES", label: "Kenya" },
  { code: "ZA", currencyCode: "ZAR", label: "South Africa" },
  { code: "EG", currencyCode: "EGP", label: "Egypt" },
  { code: "OTHER", currencyCode: "USD", label: "Other" },
]

const BUSINESS_TYPES = [
  "Retail",
  "Wholesale",
  "Food and beverage",
  "Services",
  "Logistics",
  "Other",
]

const SALES_METHODS = [
  "In-store sales",
  "Delivery and pickup",
  "WhatsApp/order links",
  "Mixed channels",
]

const TEAM_SIZES = ["Just me", "2-5 people", "6-10 people", "11+ people"]

export default function SetupPage() {
  const router = useRouter()
  const [storeName, setStoreName] = useState("")
  const [businessType, setBusinessType] = useState("Retail")
  const [countryCode, setCountryCode] = useState("NG")
  const [currency, setCurrency] = useState("NGN")
  const [productCategory, setProductCategory] = useState("")
  const [salesMethod, setSalesMethod] = useState("In-store sales")
  const [supportEmail, setSupportEmail] = useState("")
  const [teamSize, setTeamSize] = useState("Just me")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleCountryChange(value: string) {
    setCountryCode(value)
    const nextCurrency = COUNTRIES.find(
      (country) => country.code === value,
    )?.currencyCode
    if (nextCurrency) setCurrency(nextCurrency)
  }

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
          onboarding: {
            businessType,
            countryCode,
            productCategory: productCategory.trim() || undefined,
            salesMethod,
            teamSize,
          },
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="business-type" className="text-sm font-medium">
                Business type
              </label>
              <select
                id="business-type"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
              >
                {BUSINESS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="product-category" className="text-sm font-medium">
                Main product category
              </label>
              <input
                id="product-category"
                type="text"
                value={productCategory}
                onChange={(e) => setProductCategory(e.target.value)}
                placeholder="e.g. Feed, groceries"
                className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="country" className="text-sm font-medium">
                Country
              </label>
              <select
                id="country"
                value={countryCode}
                onChange={(e) => handleCountryChange(e.target.value)}
                className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
              >
                {COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.label}
                  </option>
                ))}
              </select>
            </div>

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
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="sales-method" className="text-sm font-medium">
                Sales method
              </label>
              <select
                id="sales-method"
                value={salesMethod}
                onChange={(e) => setSalesMethod(e.target.value)}
                className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
              >
                {SALES_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="team-size" className="text-sm font-medium">
                Team size
              </label>
              <select
                id="team-size"
                value={teamSize}
                onChange={(e) => setTeamSize(e.target.value)}
                className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
              >
                {TEAM_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
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
