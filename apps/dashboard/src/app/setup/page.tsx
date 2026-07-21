"use client"

import { Button } from "@ewatrade/ui"
import {
  BUSINESS_OPERATING_MODELS,
  BUSINESS_ORDER_CHANNELS,
  BUSINESS_PROFILE_SCHEMA_VERSION,
  BUSINESS_TEAM_SIZES,
  type BusinessOperatingModel,
  type BusinessOrderChannel,
  type BusinessTeamSize,
  OPERATING_CURRENCIES,
  findBusinessProfile,
  listBusinessProfiles,
  suggestCurrencyForCountry,
} from "@ewatrade/utils"
import { Add01Icon, Store04Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

const COUNTRIES = [
  { code: "NG", label: "Nigeria" },
  { code: "GH", label: "Ghana" },
  { code: "KE", label: "Kenya" },
  { code: "ZA", label: "South Africa" },
  { code: "EG", label: "Egypt" },
  { code: "OTHER", label: "Other" },
]

export default function SetupPage() {
  const router = useRouter()
  const [storeName, setStoreName] = useState("")
  const [businessProfileKey, setBusinessProfileKey] = useState("")
  const [profileQuery, setProfileQuery] = useState("")
  const [otherBusinessDescription, setOtherBusinessDescription] = useState("")
  const [countryCode, setCountryCode] = useState("NG")
  const [currency, setCurrency] = useState("NGN")
  const [operatingModel, setOperatingModel] =
    useState<BusinessOperatingModel>("products")
  const [salesMethod, setSalesMethod] =
    useState<BusinessOrderChannel>("walk_in")
  const [supportEmail, setSupportEmail] = useState("")
  const [teamSize, setTeamSize] = useState<BusinessTeamSize>("solo")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedBusinessProfile = findBusinessProfile(businessProfileKey)
  const visibleBusinessProfiles = useMemo(() => {
    if (selectedBusinessProfile && !profileQuery.trim()) {
      return [selectedBusinessProfile]
    }
    return listBusinessProfiles({ query: profileQuery })
  }, [profileQuery, selectedBusinessProfile])

  function handleCountryChange(value: string) {
    setCountryCode(value)
    setCurrency(suggestCurrencyForCountry(value))
  }

  function handleBusinessProfileChange(value: string) {
    setBusinessProfileKey(value)
    setProfileQuery("")
    const profile = findBusinessProfile(value)
    if (!profile) return
    setOperatingModel(
      profile.recommendedItemKinds.length === 1
        ? profile.recommendedItemKinds[0] === "service"
          ? "services"
          : "products"
        : "products_and_services",
    )
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
            businessProfileKey,
            businessProfileVersion: BUSINESS_PROFILE_SCHEMA_VERSION,
            countryCode,
            operatingModel,
            orderChannels: [salesMethod],
            otherBusinessDescription:
              otherBusinessDescription.trim() || undefined,
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
            Set up a store, then add Product and Service items to its catalog.
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

          <div className="flex flex-col gap-1.5">
            <label htmlFor="business-profile" className="text-sm font-medium">
              Business category <span className="text-destructive">*</span>
            </label>
            <input
              aria-label="Search business categories"
              className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
              id="business-profile"
              onChange={(event) => setProfileQuery(event.target.value)}
              placeholder="Search laundry, feed, groceries…"
              type="search"
              value={profileQuery}
            />
            <div
              aria-label="Business categories"
              className="max-h-56 overflow-y-auto rounded-xl border border-border/70"
              role="listbox"
            >
              {visibleBusinessProfiles.map((profile) => {
                const selected = profile.key === businessProfileKey
                return (
                  <button
                    aria-selected={selected}
                    className={`block w-full border-b border-border/60 px-3 py-2.5 text-left text-sm last:border-b-0 ${selected ? "bg-primary/10" : "hover:bg-muted/60"}`}
                    key={profile.key}
                    onClick={() => handleBusinessProfileChange(profile.key)}
                    role="option"
                    type="button"
                  >
                    <span className="block font-medium">{profile.title}</span>
                    <span className="block text-xs leading-5 text-muted-foreground">
                      {profile.description}
                    </span>
                  </button>
                )
              })}
              {visibleBusinessProfiles.length === 0 ? (
                <p className="px-3 py-5 text-center text-xs text-muted-foreground">
                  No category matches “{profileQuery.trim()}”.
                </p>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedBusinessProfile
                ? `${selectedBusinessProfile.title} suggestions will appear first.`
                : "We use this only to personalize setup suggestions."}
            </p>
          </div>

          {businessProfileKey === "other-mixed-business" ? (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="other-business-description"
                className="text-sm font-medium"
              >
                What does your business do?
              </label>
              <input
                id="other-business-description"
                required
                value={otherBusinessDescription}
                onChange={(event) =>
                  setOtherBusinessDescription(event.target.value)
                }
                placeholder="Describe your products or services"
                className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="operating-model" className="text-sm font-medium">
              What will you manage?
            </label>
            <select
              id="operating-model"
              value={operatingModel}
              onChange={(event) =>
                setOperatingModel(
                  event.target.value as BusinessOperatingModel,
                )
              }
              className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
            >
              {BUSINESS_OPERATING_MODELS.map((model) => (
                <option key={model.key} value={model.key}>
                  {model.label}
                </option>
              ))}
            </select>
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
                {OPERATING_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.symbol} — {c.label} ({c.code})
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
                onChange={(e) =>
                  setSalesMethod(e.target.value as BusinessOrderChannel)
                }
                className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
              >
                {BUSINESS_ORDER_CHANNELS.map((channel) => (
                  <option key={channel.key} value={channel.key}>
                    {channel.label}
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
                onChange={(e) =>
                  setTeamSize(e.target.value as BusinessTeamSize)
                }
                className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
              >
                {BUSINESS_TEAM_SIZES.map((size) => (
                  <option key={size.key} value={size.key}>
                    {size.label}
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
            disabled={loading || !storeName.trim() || !businessProfileKey}
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
