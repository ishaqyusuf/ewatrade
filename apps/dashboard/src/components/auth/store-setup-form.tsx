"use client"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FormActions,
  Input,
  SelectControl,
  SubmitButton,
} from "@ewatrade/ui"

import { FormSelectControl } from "@/components/forms/form-controls"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useZodForm } from "@/hooks/use-zod-form"
import { ControlField } from "@ewatrade/ui"
import {
  BUSINESS_OPERATING_MODELS,
  BUSINESS_OPERATING_MODEL_KEYS,
  BUSINESS_ORDER_CHANNELS,
  BUSINESS_ORDER_CHANNEL_KEYS,
  BUSINESS_PROFILE_SCHEMA_VERSION,
  BUSINESS_TEAM_SIZES,
  BUSINESS_TEAM_SIZE_KEYS,
  OPERATING_CURRENCIES,
  OPERATING_CURRENCY_CODES,
  findBusinessProfile,
  isBusinessProfileKey,
  listBusinessProfiles,
  suggestCurrencyForCountry,
} from "@ewatrade/utils"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { z } from "zod/v4"
import { AuthShell } from "./auth-shell"

const storeSetupSchema = z
  .object({
    storeName: z
      .string()
      .trim()
      .min(1, "Enter a store name.")
      .max(120, "Use 120 characters or fewer."),
    businessProfileKey: z
      .string()
      .refine(isBusinessProfileKey, "Choose a business category."),
    otherBusinessDescription: z
      .string()
      .trim()
      .max(240, "Use 240 characters or fewer."),
    countryCode: z.string().max(8),
    currency: z.enum(OPERATING_CURRENCY_CODES),
    operatingModel: z.enum(BUSINESS_OPERATING_MODEL_KEYS),
    salesMethod: z.enum(BUSINESS_ORDER_CHANNEL_KEYS),
    teamSize: z.enum(BUSINESS_TEAM_SIZE_KEYS),
    supportEmail: z.union([
      z.literal(""),
      z.email("Enter a valid email address."),
    ]),
  })
  .superRefine((values, context) => {
    if (
      values.businessProfileKey === "other-mixed-business" &&
      !values.otherBusinessDescription
    )
      context.addIssue({
        code: "custom",
        path: ["otherBusinessDescription"],
        message: "Tell us what your business does.",
      })
  })
type StoreSetupValues = z.infer<typeof storeSetupSchema>

const COUNTRIES = [
  { code: "NG", label: "Nigeria" },
  { code: "GH", label: "Ghana" },
  { code: "KE", label: "Kenya" },
  { code: "ZA", label: "South Africa" },
  { code: "EG", label: "Egypt" },
  { code: "OTHER", label: "Other" },
]

export function StoreSetupForm() {
  const router = useRouter()
  const form = useZodForm<StoreSetupValues>(storeSetupSchema, {
    defaultValues: {
      storeName: "",
      businessProfileKey: "",
      otherBusinessDescription: "",
      countryCode: "NG",
      currency: "NGN",
      operatingModel: "products",
      salesMethod: "walk_in",
      supportEmail: "",
      teamSize: "solo",
    },
  })
  const { storeName, businessProfileKey, countryCode } = form.watch()
  const [profileQuery, setProfileQuery] = useState("")
  const selectedBusinessProfile = findBusinessProfile(businessProfileKey)
  const visibleBusinessProfiles = useMemo(() => {
    if (selectedBusinessProfile && !profileQuery.trim()) {
      return [selectedBusinessProfile]
    }
    return listBusinessProfiles({ query: profileQuery })
  }, [profileQuery, selectedBusinessProfile])

  function handleCountryChange(value: string) {
    form.setValue("countryCode", value)
    form.setValue("currency", suggestCurrencyForCountry(value))
  }

  function handleBusinessProfileChange(value: string) {
    form.setValue("businessProfileKey", value)
    setProfileQuery("")
    void form.trigger("businessProfileKey")
    const profile = findBusinessProfile(value)
    if (!profile) return
    form.setValue(
      "operatingModel",
      profile.recommendedItemKinds.length === 1
        ? profile.recommendedItemKinds[0] === "service"
          ? "services"
          : "products"
        : "products_and_services",
    )
  }

  const createStore = useMutation({
    mutationFn: async (values: StoreSetupValues) => {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.storeName.trim(),
          currencyCode: values.currency,
          onboarding: {
            businessProfileKey: values.businessProfileKey,
            businessProfileVersion: BUSINESS_PROFILE_SCHEMA_VERSION,
            countryCode: values.countryCode,
            operatingModel: values.operatingModel,
            orderChannels: [values.salesMethod],
            otherBusinessDescription:
              values.otherBusinessDescription.trim() || undefined,
            salesMethod: values.salesMethod,
            teamSize: values.teamSize,
          },
          supportEmail: values.supportEmail.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null)
        throw new Error(
          body &&
            typeof body === "object" &&
            "error" in body &&
            typeof body.error === "string"
            ? body.error
            : "Failed to create store. Please try again.",
        )
      }
    },
    onSuccess: () => {
      router.push("/")
      router.refresh()
    },
    retry: false,
  })
  const loading = createStore.isPending
  const error = createStore.error?.message
  const handleSubmit = form.handleSubmit((values) => {
    if (!loading) createStore.mutate(values)
  })

  return (
    <AuthShell
      title="Create your first store"
      description="Set up a store, then add products and services to its catalog."
      asideTitle="Make it your workspace."
      asideDescription="Choose your business category, currency and sales channels. These settings personalize your store."
    >
      <form noValidate onSubmit={handleSubmit} className="min-w-0">
        <FieldGroup className="min-w-0 gap-5">
          <div className="flex flex-col gap-5">
            {/* Store name */}
            <ControlField
              label={
                <>
                  Store name <span className="text-destructive">*</span>
                </>
              }
              error={form.formState.errors.storeName?.message}
            >
              <Input
                disabled={loading}
                {...form.register("storeName")}
                id="store-name"
                type="text"
                required
                placeholder="e.g. Nile Market"
              />
            </ControlField>

            <Field
              data-invalid={Boolean(form.formState.errors.businessProfileKey)}
              className="flex flex-col gap-1.5"
            >
              <FieldLabel
                htmlFor="business-profile"
                className="text-sm font-medium"
              >
                Business category <span className="text-destructive">*</span>
              </FieldLabel>
              <Command shouldFilter={false} className="border border-border">
                <CommandInput
                  disabled={loading}
                  aria-label="Search business categories"
                  id="business-profile"
                  onValueChange={setProfileQuery}
                  placeholder="Search laundry, feed, groceries…"
                  value={profileQuery}
                />
                <CommandList
                  aria-label="Business categories"
                  className="max-h-56"
                >
                  <CommandEmpty>
                    No category matches “{profileQuery.trim()}”.
                  </CommandEmpty>
                  <CommandGroup>
                    {visibleBusinessProfiles.map((profile) => (
                      <CommandItem
                        disabled={loading}
                        key={profile.key}
                        value={profile.key}
                        onSelect={() =>
                          handleBusinessProfileChange(profile.key)
                        }
                        className="flex-col items-start"
                      >
                        <span className="font-medium">{profile.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {profile.description}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
              {form.formState.errors.businessProfileKey ? (
                <FieldError>
                  {form.formState.errors.businessProfileKey.message}
                </FieldError>
              ) : null}
              <FieldDescription>
                {selectedBusinessProfile
                  ? `${selectedBusinessProfile.title} suggestions will appear first.`
                  : "We use this only to personalize setup suggestions."}
              </FieldDescription>
            </Field>

            {businessProfileKey === "other-mixed-business" ? (
              <ControlField
                label={<>What does your business do?</>}
                error={form.formState.errors.otherBusinessDescription?.message}
              >
                <Input
                  disabled={loading}
                  {...form.register("otherBusinessDescription")}
                  id="other-business-description"
                  required
                  placeholder="Describe your products or services"
                />
              </ControlField>
            ) : null}

            <ControlField
              label={<>What will you manage?</>}
              error={form.formState.errors.operatingModel?.message}
            >
              <FormSelectControl
                disabled={loading}
                control={form.control}
                name="operatingModel"
                id="operating-model"
                options={[
                  ...(BUSINESS_OPERATING_MODELS.map((model) => ({
                    value: model.key,
                    label: model.label,
                  })) ?? []),
                ]}
              />
            </ControlField>

            <div className="grid gap-4 sm:grid-cols-2">
              <ControlField
                label={<>Country</>}
                error={form.formState.errors.countryCode?.message}
              >
                <SelectControl
                  disabled={loading}
                  value={countryCode}
                  name="countryCode"
                  ref={form.register("countryCode").ref}
                  onBlur={form.register("countryCode").onBlur}
                  id="country"
                  onValueChange={(value) => handleCountryChange(value)}
                  options={[
                    ...(COUNTRIES.map((country) => ({
                      value: country.code,
                      label: country.label,
                    })) ?? []),
                  ]}
                />
              </ControlField>

              <ControlField
                label={<>Store currency</>}
                error={form.formState.errors.currency?.message}
              >
                <FormSelectControl
                  disabled={loading}
                  control={form.control}
                  name="currency"
                  id="currency"
                  options={[
                    ...(OPERATING_CURRENCIES.map((c) => ({
                      value: c.code,
                      label: (
                        <>
                          {c.symbol} — {c.label} ({c.code})
                        </>
                      ),
                    })) ?? []),
                  ]}
                />
              </ControlField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <ControlField
                label={<>Sales method</>}
                error={form.formState.errors.salesMethod?.message}
              >
                <FormSelectControl
                  disabled={loading}
                  control={form.control}
                  name="salesMethod"
                  id="sales-method"
                  options={[
                    ...(BUSINESS_ORDER_CHANNELS.map((channel) => ({
                      value: channel.key,
                      label: channel.label,
                    })) ?? []),
                  ]}
                />
              </ControlField>

              <ControlField
                label={<>Team size</>}
                error={form.formState.errors.teamSize?.message}
              >
                <FormSelectControl
                  disabled={loading}
                  control={form.control}
                  name="teamSize"
                  id="team-size"
                  options={[
                    ...(BUSINESS_TEAM_SIZES.map((size) => ({
                      value: size.key,
                      label: size.label,
                    })) ?? []),
                  ]}
                />
              </ControlField>
            </div>

            {/* Support email */}
            <ControlField
              label={
                <>
                  Support email{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    (optional)
                  </span>
                </>
              }
              error={form.formState.errors.supportEmail?.message}
            >
              <Input
                disabled={loading}
                {...form.register("supportEmail")}
                id="support-email"
                type="email"
                placeholder="support@yourstore.com"
              />
            </ControlField>

            {error && (
              <FormFeedback appearance="dashboard">{error}</FormFeedback>
            )}

            <FormActions>
              <SubmitButton
                isSubmitting={loading}
                type="submit"
                disabled={loading || !storeName.trim() || !businessProfileKey}
                className="mt-1 w-full"
              >
                {loading ? "Creating store…" : "Create store"}
              </SubmitButton>
            </FormActions>
          </div>
        </FieldGroup>
      </form>
    </AuthShell>
  )
}
