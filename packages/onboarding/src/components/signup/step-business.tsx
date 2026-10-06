"use client"

import { QaQuickFillButton } from "@ewatrade/onboarding/components/qa/qa-quick-fill-button"
import { useQaFormFill } from "@ewatrade/onboarding/hooks/use-qa-form-fill"
import { businessFill } from "@ewatrade/onboarding/lib/qa-fill-definitions"
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@ewatrade/ui"
import {
  BUSINESS_OPERATING_MODELS,
  BUSINESS_ORDER_CHANNELS,
  BUSINESS_TEAM_SIZES,
  OPERATING_CURRENCIES,
  findBusinessProfile,
  listBusinessProfiles,
  suggestCurrencyForCountry,
} from "@ewatrade/utils"
import { useState } from "react"
import { Controller } from "react-hook-form"
import { useZodForm } from "../../hooks/use-zod-form"
import {
  getCountryCallingCode,
  getNationalSignupPhone,
  getSignupPhoneForCountry,
} from "../../lib/signup-phone"
import {
  type BusinessValues,
  COUNTRIES,
  businessSchema,
} from "../../lib/signup-schemas"

import { SignupSelect } from "./signup-select"

const baseInputClasses = "signup-input"

type StepBusinessProps = {
  approvedBusinessName?: string
  totalSteps?: number
  defaultValues?: Partial<BusinessValues>
  onNext: (data: BusinessValues) => void
}

export function StepBusiness({
  approvedBusinessName,
  defaultValues,
  onNext,
  totalSteps = 2,
}: StepBusinessProps) {
  const form = useZodForm<BusinessValues>(businessSchema, {
    defaultValues: {
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
      ...defaultValues,
    },
  })
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const selectedCountry = form.watch("countryCode") ?? ""
  const phonePrefix = getCountryCallingCode(selectedCountry)
  const selectedProfileKey = form.watch("businessProfileKey")
  const selectedProfile = findBusinessProfile(selectedProfileKey)

  const { canUndo, fill, isAvailable, qaDomain, undo } = useQaFormFill(
    businessFill,
    form,
  )

  return (
    <div>
      <div className="signup-heading">
        <p className="signup-entry">
          Step 1 of {totalSteps} · Business details
        </p>
        <h1>
          A little about
          <br />
          your business.
        </h1>
        <p className="signup-intro">
          Keep your first setup useful. Products and services share the same
          workspace.
        </p>
      </div>

      <form
        onSubmit={form.handleSubmit(onNext, (errors) => {
          if (
            errors.businessSize ||
            errors.operatingModel ||
            errors.orderChannels
          )
            setPreferencesOpen(true)
        })}
      >
        <FieldGroup className="signup-fields">
          {/* Business name */}
          <Field data-invalid={Boolean(form.formState.errors.businessName)}>
            <FieldLabel htmlFor="signup-businessName">Business name</FieldLabel>
            <Input
              id="signup-businessName"
              aria-invalid={Boolean(form.formState.errors.businessName)}
              {...form.register("businessName")}
              readOnly={Boolean(approvedBusinessName)}
              type="text"
              placeholder="Nile Market Co."
              className={`${baseInputClasses} mt-1.5`}
            />
            {form.formState.errors.businessName && (
              <FieldError>
                {form.formState.errors.businessName.message}
              </FieldError>
            )}
          </Field>

          <Field
            data-invalid={Boolean(form.formState.errors.businessProfileKey)}
          >
            <FieldLabel htmlFor="signup-businessProfileKey">
              Business category
            </FieldLabel>
            <Controller
              name="businessProfileKey"
              control={form.control}
              render={({ field, fieldState }) => (
                <SignupSelect
                  id="signup-businessProfileKey"
                  name={field.name}
                  value={field.value}
                  triggerRef={field.ref}
                  onBlur={field.onBlur}
                  invalid={fieldState.invalid}
                  placeholder="Choose a category"
                  options={listBusinessProfiles().map((profile) => ({
                    value: profile.key,
                    label: profile.title,
                  }))}
                  onValueChange={(value) => {
                    field.onChange(value)
                    const profile = findBusinessProfile(value)
                    if (profile)
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
                />
              )}
            />
            {form.formState.errors.businessProfileKey && (
              <FieldError>
                {form.formState.errors.businessProfileKey.message}
              </FieldError>
            )}
            {selectedProfile && (
              <FieldDescription>{selectedProfile.description}</FieldDescription>
            )}
          </Field>

          {selectedProfileKey === "other-mixed-business" ? (
            <Field
              data-invalid={Boolean(
                form.formState.errors.otherBusinessDescription,
              )}
            >
              <FieldLabel htmlFor="signup-otherBusinessDescription">
                What does your business do?
              </FieldLabel>
              <Input
                id="signup-otherBusinessDescription"
                aria-invalid={Boolean(
                  form.formState.errors.otherBusinessDescription,
                )}
                {...form.register("otherBusinessDescription")}
                className={`${baseInputClasses} mt-1.5`}
                placeholder="Describe your products or services"
                type="text"
              />
              {form.formState.errors.otherBusinessDescription ? (
                <FieldError>
                  {form.formState.errors.otherBusinessDescription.message}
                </FieldError>
              ) : null}
            </Field>
          ) : null}

          <details
            className="signup-disclosure"
            open={preferencesOpen}
            onToggle={(event) => setPreferencesOpen(event.currentTarget.open)}
          >
            <summary>Your starting preferences</summary>
            <FieldGroup className="signup-fields">
              <Field data-invalid={Boolean(form.formState.errors.businessSize)}>
                <FieldLabel htmlFor="signup-businessSize">Team size</FieldLabel>
                <Controller
                  name="businessSize"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <SignupSelect
                      id="signup-businessSize"
                      name={field.name}
                      value={field.value}
                      triggerRef={field.ref}
                      onBlur={field.onBlur}
                      onValueChange={field.onChange}
                      invalid={fieldState.invalid}
                      options={BUSINESS_TEAM_SIZES.map((option) => ({
                        value: option.key,
                        label: option.label,
                      }))}
                    />
                  )}
                />
                {form.formState.errors.businessSize && (
                  <FieldError>
                    {form.formState.errors.businessSize.message}
                  </FieldError>
                )}
              </Field>
              <Field
                data-invalid={Boolean(form.formState.errors.operatingModel)}
              >
                <FieldLabel htmlFor="signup-operatingModel">
                  What will you manage?
                </FieldLabel>
                <Controller
                  name="operatingModel"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <SignupSelect
                      id="signup-operatingModel"
                      name={field.name}
                      value={field.value}
                      triggerRef={field.ref}
                      onBlur={field.onBlur}
                      onValueChange={field.onChange}
                      invalid={fieldState.invalid}
                      options={BUSINESS_OPERATING_MODELS.map((option) => ({
                        value: option.key,
                        label: option.label,
                      }))}
                    />
                  )}
                />
                <p className="text-xs font-normal text-muted-foreground">
                  This personalizes your starting suggestions and never limits
                  what you can add later.
                </p>
              </Field>

              <FieldSet className="signup-channel-set">
                <FieldLegend variant="label">
                  How do customers order?
                </FieldLegend>
                <FieldGroup className="signup-row">
                  {BUSINESS_ORDER_CHANNELS.map((channel) => (
                    <label className="signup-channel" key={channel.key}>
                      <input
                        {...form.register("orderChannels")}
                        className="size-4 accent-primary"
                        type="checkbox"
                        value={channel.key}
                      />
                      {channel.label}
                    </label>
                  ))}
                </FieldGroup>
                {form.formState.errors.orderChannels ? (
                  <FieldError>
                    {form.formState.errors.orderChannels.message}
                  </FieldError>
                ) : null}
              </FieldSet>
            </FieldGroup>
          </details>

          <Field data-invalid={Boolean(form.formState.errors.addressLine1)}>
            <FieldLabel htmlFor="signup-addressLine1">
              Business address
            </FieldLabel>
            <Input
              id="signup-addressLine1"
              aria-invalid={Boolean(form.formState.errors.addressLine1)}
              {...form.register("addressLine1")}
              type="text"
              placeholder="Street address"
              className={`${baseInputClasses} mt-1.5`}
            />
            {form.formState.errors.addressLine1 && (
              <FieldError>
                {form.formState.errors.addressLine1.message}
              </FieldError>
            )}
          </Field>
          <FieldGroup className="signup-row">
            <Field data-invalid={Boolean(form.formState.errors.city)}>
              <FieldLabel htmlFor="signup-city">City</FieldLabel>
              <Input
                id="signup-city"
                aria-invalid={Boolean(form.formState.errors.city)}
                {...form.register("city")}
                type="text"
                placeholder="City"
                className={`${baseInputClasses} mt-1.5`}
              />
              {form.formState.errors.city && (
                <FieldError>{form.formState.errors.city.message}</FieldError>
              )}
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.region)}>
              <FieldLabel htmlFor="signup-region">
                State or region{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </FieldLabel>
              <Input
                id="signup-region"
                aria-invalid={Boolean(form.formState.errors.region)}
                {...form.register("region")}
                type="text"
                placeholder="State or region"
                className={`${baseInputClasses} mt-1.5`}
              />
            </Field>
          </FieldGroup>

          {/* Country + Phone grid */}
          <FieldGroup className="signup-row">
            <Field data-invalid={Boolean(form.formState.errors.countryCode)}>
              <FieldLabel htmlFor="signup-countryCode">Country</FieldLabel>
              <Controller
                name="countryCode"
                control={form.control}
                render={({ field, fieldState }) => (
                  <SignupSelect
                    id="signup-countryCode"
                    name={field.name}
                    value={field.value}
                    triggerRef={field.ref}
                    onBlur={field.onBlur}
                    invalid={fieldState.invalid}
                    placeholder="Select country…"
                    options={[...COUNTRIES]}
                    onValueChange={(nextCountry) => {
                      const currentPhone = form.getValues("phone")
                      form.setValue(
                        "phone",
                        getSignupPhoneForCountry(
                          currentPhone,
                          selectedCountry,
                          nextCountry,
                        ),
                        { shouldDirty: true },
                      )
                      field.onChange(nextCountry)
                      form.setValue(
                        "currencyCode",
                        suggestCurrencyForCountry(nextCountry),
                        { shouldValidate: true },
                      )
                    }}
                  />
                )}
              />
              {form.formState.errors.countryCode && (
                <FieldError>
                  {form.formState.errors.countryCode.message}
                </FieldError>
              )}
            </Field>

            <Field data-invalid={Boolean(form.formState.errors.phone)}>
              <FieldLabel htmlFor="signup-phone">Phone number</FieldLabel>
              <Controller
                name="phone"
                control={form.control}
                render={({ field }) => (
                  <InputGroup className="signup-phone-input">
                    <InputGroupInput
                      {...field}
                      id="signup-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete={
                        selectedCountry === "OTHER" ? "tel" : "tel-national"
                      }
                      value={getNationalSignupPhone(
                        field.value ?? "",
                        selectedCountry,
                      )}
                      aria-invalid={Boolean(form.formState.errors.phone)}
                      aria-describedby="signup-phone-hint"
                      placeholder={
                        selectedCountry === "OTHER"
                          ? "Country code and number"
                          : "Phone number"
                      }
                      className="signup-input"
                    />
                    <InputGroupAddon align="inline-start">
                      <InputGroupText aria-label="Country calling code">
                        {phonePrefix || "+"}
                      </InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                )}
              />
              <FieldDescription id="signup-phone-hint">
                {selectedCountry === "OTHER"
                  ? "Include your country code before the number."
                  : !selectedCountry
                    ? "Choose your country to set the calling code."
                    : "Your country’s calling code is included automatically."}
              </FieldDescription>
              <FieldError errors={[form.formState.errors.phone]} />
            </Field>
          </FieldGroup>

          <Field data-invalid={Boolean(form.formState.errors.currencyCode)}>
            <FieldLabel htmlFor="signup-currencyCode">
              Operating currency
            </FieldLabel>
            <Controller
              name="currencyCode"
              control={form.control}
              render={({ field, fieldState }) => (
                <SignupSelect
                  id="signup-currencyCode"
                  name={field.name}
                  value={field.value}
                  triggerRef={field.ref}
                  onBlur={field.onBlur}
                  onValueChange={field.onChange}
                  invalid={fieldState.invalid}
                  options={OPERATING_CURRENCIES.map((currency) => ({
                    value: currency.code,
                    label: `${currency.symbol} — ${currency.label} (${currency.code})`,
                  }))}
                />
              )}
            />
            <p className="text-xs font-normal text-muted-foreground">
              This prefix will appear on prices, totals, reports, and customer
              pages.
            </p>
            {form.formState.errors.currencyCode && (
              <FieldError>
                {form.formState.errors.currencyCode.message}
              </FieldError>
            )}
          </Field>

          <div className="signup-actions">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="signup-secondary"
              disabled
              title="Address setup is coming later"
            >
              Back
            </Button>
            <Button type="submit" size="lg" className="signup-primary">
              Continue
            </Button>
          </div>
        </FieldGroup>
      </form>

      <QaQuickFillButton
        canUndo={canUndo}
        onFill={fill}
        onUndo={undo}
        qaDomain={qaDomain}
        visible={isAvailable}
      />
    </div>
  )
}
