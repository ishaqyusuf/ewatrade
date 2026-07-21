"use client"

import { DevFormFillButton } from "@/components/dev/dev-form-fill-button"
import { useDevFormFill } from "@/hooks/use-dev-form-fill"
import { useZodForm } from "@/hooks/use-zod-form"
import { businessFill } from "@/lib/dev-fill-definitions"
import {
  type BusinessValues,
  COUNTRIES,
  businessSchema,
} from "@/lib/signup-schemas"
import { Button } from "@ewatrade/ui"
import {
  BUSINESS_OPERATING_MODELS,
  BUSINESS_ORDER_CHANNELS,
  BUSINESS_TEAM_SIZES,
  OPERATING_CURRENCIES,
  findBusinessProfile,
  listBusinessProfiles,
  suggestCurrencyForCountry,
} from "@ewatrade/utils"
import { useMemo, useState } from "react"

const baseInputClasses =
  "w-full scroll-mt-24 rounded-lg border border-border/70 bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10 appearance-none"

type StepBusinessProps = {
  defaultValues?: Partial<BusinessValues>
  onNext: (data: BusinessValues) => void
  onBack: () => void
}

export function StepBusiness({
  defaultValues,
  onNext,
  onBack,
}: StepBusinessProps) {
  const form = useZodForm<BusinessValues>(businessSchema, {
    defaultValues: defaultValues ?? {
      addressLine1: "",
      businessProfileKey: "",
      businessProfileVersion: 1,
      businessName: "",
      businessSize: "solo",
      city: "",
      countryCode: "",
      currencyCode: "NGN",
      phone: "",
      region: "",
      operatingModel: "products",
      orderChannels: ["walk_in"],
      otherBusinessDescription: "",
    },
  })
  const [profileQuery, setProfileQuery] = useState("")
  const selectedProfileKey = form.watch("businessProfileKey")
  const selectedProfile = findBusinessProfile(selectedProfileKey)
  const visibleProfiles = useMemo(() => {
    if (selectedProfile && !profileQuery.trim()) return [selectedProfile]
    return listBusinessProfiles({ query: profileQuery })
  }, [profileQuery, selectedProfile])

  const { fill } = useDevFormFill(businessFill, form)

  return (
    <div>
      <div className="mb-8 text-center">
        <h2
          className="text-2xl font-semibold text-foreground sm:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Tell us about your business
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This helps us configure your workspace and show you relevant features.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onNext)} className="space-y-4">
        {/* Business name */}
        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          Business name
          <input
            {...form.register("businessName")}
            type="text"
            placeholder="Nile Market Co."
            className={`${baseInputClasses} mt-1.5`}
          />
          {form.formState.errors.businessName && (
            <p className="text-xs text-destructive">
              {form.formState.errors.businessName.message}
            </p>
          )}
        </label>

        {/* Business profile + Size grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 text-sm font-medium text-foreground">
            Business category
            <input
              aria-label="Search business categories"
              className={`${baseInputClasses} mt-1.5`}
              onChange={(event) => setProfileQuery(event.target.value)}
              placeholder="Search laundry, feed, groceries…"
              type="search"
              value={profileQuery}
            />
            <div
              aria-label="Business categories"
              className="max-h-52 overflow-y-auto rounded-lg border border-border/70"
              role="listbox"
            >
              {visibleProfiles.map((profile) => {
                const selected = profile.key === selectedProfileKey
                return (
                  <button
                    aria-selected={selected}
                    className={`block w-full border-b border-border/60 px-3 py-2.5 text-left last:border-b-0 ${selected ? "bg-primary/10" : "hover:bg-muted/60"}`}
                    key={profile.key}
                    onClick={() => {
                      form.setValue("businessProfileKey", profile.key, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                      setProfileQuery("")
                      form.setValue(
                        "operatingModel",
                        profile.recommendedItemKinds.length === 1
                          ? profile.recommendedItemKinds[0] === "service"
                            ? "services"
                            : "products"
                          : "products_and_services",
                        { shouldValidate: true },
                      )
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="block font-medium">{profile.title}</span>
                    <span className="block text-xs font-normal leading-5 text-muted-foreground">
                      {profile.description}
                    </span>
                  </button>
                )
              })}
              {visibleProfiles.length === 0 ? (
                <p className="px-3 py-5 text-center text-xs font-normal text-muted-foreground">
                  No category matches “{profileQuery.trim()}”.
                </p>
              ) : null}
            </div>
            <input
              {...form.register("businessProfileKey")}
              type="hidden"
            />
            {form.formState.errors.businessProfileKey && (
              <p className="text-xs text-destructive">
                {form.formState.errors.businessProfileKey.message}
              </p>
            )}
            {selectedProfile ? (
              <span className="block text-xs font-normal leading-5 text-muted-foreground">
                {selectedProfile.description}
              </span>
            ) : null}
          </div>

          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Team size
            <select
              {...form.register("businessSize")}
              className={`${baseInputClasses} mt-1.5`}
            >
              <option value="">Select size…</option>
              {BUSINESS_TEAM_SIZES.map((size) => (
                <option key={size.key} value={size.key}>
                  {size.label}
                </option>
              ))}
            </select>
            {form.formState.errors.businessSize && (
              <p className="text-xs text-destructive">
                {form.formState.errors.businessSize.message}
              </p>
            )}
          </label>
        </div>

        {selectedProfileKey === "other-mixed-business" ? (
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            What does your business do?
            <input
              {...form.register("otherBusinessDescription")}
              className={`${baseInputClasses} mt-1.5`}
              placeholder="Describe your products or services"
              type="text"
            />
            {form.formState.errors.otherBusinessDescription ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.otherBusinessDescription.message}
              </p>
            ) : null}
          </label>
        ) : null}

        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          What will you manage?
          <select
            {...form.register("operatingModel")}
            className={`${baseInputClasses} mt-1.5`}
          >
            {BUSINESS_OPERATING_MODELS.map((model) => (
              <option key={model.key} value={model.key}>
                {model.label}
              </option>
            ))}
          </select>
          <p className="text-xs font-normal text-muted-foreground">
            This personalizes your starting suggestions and never limits what
            you can add later.
          </p>
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">
            How do customers order?
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {BUSINESS_ORDER_CHANNELS.map((channel) => (
              <label
                className="flex min-h-11 items-center gap-3 rounded-lg border border-border/70 px-3 text-sm text-foreground"
                key={channel.key}
              >
                <input
                  {...form.register("orderChannels")}
                  className="size-4 accent-primary"
                  type="checkbox"
                  value={channel.key}
                />
                {channel.label}
              </label>
            ))}
          </div>
          {form.formState.errors.orderChannels ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.orderChannels.message}
            </p>
          ) : null}
        </fieldset>

        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          Business address
          <input
            {...form.register("addressLine1")}
            type="text"
            placeholder="Street address"
            className={`${baseInputClasses} mt-1.5`}
          />
          {form.formState.errors.addressLine1 && (
            <p className="text-xs text-destructive">
              {form.formState.errors.addressLine1.message}
            </p>
          )}
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            City
            <input
              {...form.register("city")}
              type="text"
              placeholder="City"
              className={`${baseInputClasses} mt-1.5`}
            />
            {form.formState.errors.city && (
              <p className="text-xs text-destructive">
                {form.formState.errors.city.message}
              </p>
            )}
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            State or region{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
            <input
              {...form.register("region")}
              type="text"
              placeholder="State or region"
              className={`${baseInputClasses} mt-1.5`}
            />
          </label>
        </div>

        {/* Country + Phone grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Country
            <select
              {...form.register("countryCode", {
                onChange: (event) => {
                  form.setValue(
                    "currencyCode",
                    suggestCurrencyForCountry(event.target.value),
                    { shouldValidate: true },
                  )
                },
              })}
              className={`${baseInputClasses} mt-1.5`}
            >
              <option value="">Select country…</option>
              {COUNTRIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            {form.formState.errors.countryCode && (
              <p className="text-xs text-destructive">
                {form.formState.errors.countryCode.message}
              </p>
            )}
          </label>

          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Phone number
            <input
              {...form.register("phone")}
              type="tel"
              placeholder="+234 801 234 5678"
              className={`${baseInputClasses} mt-1.5`}
            />
            {form.formState.errors.phone && (
              <p className="text-xs text-destructive">
                {form.formState.errors.phone.message}
              </p>
            )}
          </label>
        </div>

        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          Operating currency
          <select
            {...form.register("currencyCode")}
            className={`${baseInputClasses} mt-1.5`}
          >
            {OPERATING_CURRENCIES.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.symbol} — {currency.label} ({currency.code})
              </option>
            ))}
          </select>
          <p className="text-xs font-normal text-muted-foreground">
            This prefix will appear on prices, totals, reports, and customer
            pages.
          </p>
          {form.formState.errors.currencyCode && (
            <p className="text-xs text-destructive">
              {form.formState.errors.currencyCode.message}
            </p>
          )}
        </label>

        <div className="flex items-center justify-between border-t border-border/60 pt-5">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="rounded-lg"
            onClick={onBack}
          >
            Back
          </Button>
          <Button type="submit" size="lg" className="rounded-lg px-8">
            Continue
          </Button>
        </div>
      </form>

      <DevFormFillButton onFill={fill} label="Fill step 2" />
    </div>
  )
}
