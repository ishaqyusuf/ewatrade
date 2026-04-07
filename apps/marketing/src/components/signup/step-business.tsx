"use client"

import { DevFormFillButton } from "@/components/dev/dev-form-fill-button"
import { useDevFormFill } from "@/hooks/use-dev-form-fill"
import { useZodForm } from "@/hooks/use-zod-form"
import { businessFill } from "@/lib/dev-fill-definitions"
import {
  BUSINESS_SIZES,
  type BusinessValues,
  COUNTRIES,
  INDUSTRIES,
  businessSchema,
} from "@/lib/signup-schemas"
import { Button } from "@ewatrade/ui"

const baseInputClasses =
  "w-full rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10 appearance-none"

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
      businessName: "",
      industry: "",
      businessSize: "",
      countryCode: "",
      phone: "",
    },
  })

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

        {/* Industry + Size grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Industry
            <select
              {...form.register("industry")}
              className={`${baseInputClasses} mt-1.5`}
            >
              <option value="">Select industry…</option>
              {INDUSTRIES.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>
            {form.formState.errors.industry && (
              <p className="text-xs text-destructive">
                {form.formState.errors.industry.message}
              </p>
            )}
          </label>

          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Team size
            <select
              {...form.register("businessSize")}
              className={`${baseInputClasses} mt-1.5`}
            >
              <option value="">Select size…</option>
              {BUSINESS_SIZES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
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

        {/* Country + Phone grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Country
            <select
              {...form.register("countryCode")}
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

        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="rounded-full"
            onClick={onBack}
          >
            Back
          </Button>
          <Button type="submit" size="lg" className="rounded-full px-8">
            Continue
          </Button>
        </div>
      </form>

      <DevFormFillButton onFill={fill} label="Fill step 3" />
    </div>
  )
}
