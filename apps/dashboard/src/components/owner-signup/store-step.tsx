"use client"

import { SignupUseLocation } from "@ewatrade/onboarding/components/signup/signup-flow"
import { Input, SelectControl, Textarea } from "@ewatrade/ui"
import { OPERATING_CURRENCIES, isOperatingCurrencyCode } from "@ewatrade/utils"
import type {
  OwnerSetupBusiness,
  OwnerSetupDraft,
} from "@ewatrade/utils/owner-signup"
import type { Dispatch, SetStateAction } from "react"
import { OWNER_PLAN_LIMITS, businessLabel, storeReady } from "./model"

const countries = [
  { value: "", label: "Choose a country" },
  { value: "NG", label: "Nigeria" },
  { value: "GH", label: "Ghana" },
  { value: "KE", label: "Kenya" },
  { value: "ZA", label: "South Africa" },
  { value: "EG", label: "Egypt" },
  { value: "GB", label: "United Kingdom" },
  { value: "US", label: "United States" },
]
const offers = [
  {
    value: "products",
    label: "I sell",
    description: "Things customers buy, like eggs, phones or clothes",
  },
  {
    value: "services",
    label: "I offer services",
    description: "Work I do for customers, like repairs, hair or cleaning",
  },
  {
    value: "products_and_services",
    label: "I sell and offer services",
    description: "Both, like a salon that also sells hair products",
  },
] as const

export function OwnerStoreStep({
  draft,
  onChange,
  onBack,
  onNext,
  disabled,
}: {
  draft: OwnerSetupDraft
  onChange: Dispatch<SetStateAction<OwnerSetupDraft>>
  onBack: () => void
  onNext: () => void
  disabled: boolean
}) {
  const setupNow = draft.businesses.slice(0, OWNER_PLAN_LIMITS[draft.planId])
  const index = Math.min(draft.storeIndex ?? 0, setupNow.length - 1)
  const business = setupNow[index]
  const first = setupNow[0]
  if (!business || !first) return null
  function patch(changes: Partial<OwnerSetupBusiness>) {
    onChange((current) => ({
      ...current,
      businesses: current.businesses.map((b) =>
        b.id === business?.id ? { ...b, ...changes } : b,
      ),
    }))
  }
  const locationId = `owner-store-${business.id}`
  return (
    <>
      <header>
        <p className="signup-eyebrow">
          05 / Store {index + 1}
          {setupNow.length > 1 ? ` of ${setupNow.length}` : ""}
        </p>
        <h1>Make it yours.</h1>
        <p className="signup-intro">
          A few details for {business.name}. You can change these later.
        </p>
      </header>
      {setupNow.length > 1 && (
        <nav className="owner-store-tabs" aria-label="Set up each business">
          {setupNow.map((item, i) => (
            <button
              type="button"
              key={item.id}
              className={i === index ? "is-active" : undefined}
              aria-current={i === index ? "step" : undefined}
              onClick={() => onChange({ ...draft, storeIndex: i })}
            >
              {storeReady(item) ? "✓ " : ""}
              {businessLabel(item, i)}
            </button>
          ))}
        </nav>
      )}
      <fieldset className="owner-offers">
        <legend>What will customers find here?</legend>
        {offers.map((offer) => (
          <label
            className={`owner-offer ${business.operatingModel === offer.value ? "is-selected" : ""}`}
            key={offer.value}
          >
            <input
              type="radio"
              name={`offer-${business.id}`}
              checked={business.operatingModel === offer.value}
              onChange={() =>
                patch({ operatingModel: offer.value, offerTouched: true })
              }
            />
            <span>
              <b>{offer.label}</b>
              <small>{offer.description}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="owner-fields">
        <div className="owner-location">
          <p>
            Location <span className="owner-muted">Optional</span>
          </p>
          <SignupUseLocation
            key={business.id}
            onLocated={(address) => {
              // The callback updates its originating stable business, even if a tab changed while geolocation was pending.
              onChange((current) => ({
                ...current,
                businesses: current.businesses.map((b) =>
                  b.id === business.id
                    ? {
                        ...b,
                        addressLine1: address.addressLine1,
                        city: address.city,
                        region: address.region,
                      }
                    : b,
                ),
              }))
            }}
          />
        </div>
        <label className="signup-label" htmlFor={`${locationId}-address`}>
          Street or area
          <Input
            id={`${locationId}-address`}
            className="signup-input"
            value={business.addressLine1 ?? ""}
            maxLength={200}
            autoComplete="street-address"
            placeholder="Type an address, or leave it for later"
            onChange={(event) => patch({ addressLine1: event.target.value })}
          />
        </label>
        <div className="signup-row">
          <label className="signup-label" htmlFor={`${locationId}-city`}>
            City
            <Input
              id={`${locationId}-city`}
              className="signup-input"
              value={business.city ?? ""}
              maxLength={120}
              autoComplete="address-level2"
              onChange={(event) => patch({ city: event.target.value })}
            />
          </label>
          <label className="signup-label" htmlFor={`${locationId}-region`}>
            State or region
            <Input
              id={`${locationId}-region`}
              className="signup-input"
              value={business.region ?? ""}
              maxLength={120}
              autoComplete="address-level1"
              onChange={(event) => patch({ region: event.target.value })}
            />
          </label>
        </div>
        {index > 0 && (
          <button
            type="button"
            className="owner-text-button"
            disabled={!first.countryCode || !first.currencyCode}
            onClick={() =>
              patch({
                countryCode: first.countryCode,
                currencyCode: first.currencyCode,
              })
            }
          >
            Same country and currency as {first.name}
          </button>
        )}
        <div className="signup-row">
          <label className="signup-label" htmlFor={`${locationId}-country`}>
            Country
            <SelectControl
              id={`${locationId}-country`}
              value={business.countryCode}
              options={countries}
              popupClassName="signup-select-menu"
              onValueChange={(countryCode) => patch({ countryCode })}
            />
          </label>
          <label className="signup-label" htmlFor={`${locationId}-currency`}>
            Currency
            <SelectControl
              id={`${locationId}-currency`}
              value={business.currencyCode}
              options={[
                { value: "", label: "Choose a currency" },
                ...OPERATING_CURRENCIES.map((currency) => ({
                  value: currency.code,
                  label: `${currency.symbol} ${currency.label} (${currency.code})`,
                })),
              ]}
              popupClassName="signup-select-menu"
              onValueChange={(currencyCode) => {
                if (
                  currencyCode === "" ||
                  isOperatingCurrencyCode(currencyCode)
                )
                  patch({ currencyCode })
              }}
            />
          </label>
        </div>
        <label className="signup-label" htmlFor={`${locationId}-about`}>
          About this store <span className="owner-muted">Optional</span>
          <Textarea
            id={`${locationId}-about`}
            className="signup-input"
            rows={3}
            maxLength={280}
            value={business.description ?? ""}
            placeholder="A short introduction for your customers"
            onChange={(event) => patch({ description: event.target.value })}
          />
          <small className="owner-muted">
            {business.description?.length ?? 0}/280 · Shown on your store page
          </small>
        </label>
        <div className="owner-free-link">
          <span className="owner-muted">Your free store link</span>
          <b>{business.slug}.ewatrade.com</b>
          <p>
            Start with 3 items on Starter. Growth and Pro give you room for
            more.
          </p>
        </div>
        {draft.planId === "starter" && draft.businesses.length > 1 && (
          <p className="owner-muted">
            {draft.businesses.length - 1} extra{" "}
            {draft.businesses.length === 2 ? "business is" : "businesses are"}{" "}
            waiting on Home. You can finish their Store details after upgrading.
          </p>
        )}
      </div>
      <div className="owner-step-actions">
        <button
          className="signup-secondary"
          disabled={disabled}
          type="button"
          onClick={onBack}
        >
          Back
        </button>
        <button
          className="signup-primary"
          type="button"
          disabled={disabled || !storeReady(business)}
          onClick={onNext}
        >
          {disabled
            ? "Saving…"
            : index < setupNow.length - 1
              ? "Next business"
              : "Open my dashboard"}
        </button>
      </div>
    </>
  )
}
