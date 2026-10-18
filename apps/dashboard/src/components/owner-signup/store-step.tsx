"use client"

import {
  OwnerBusinessAvatar,
  OwnerSignupIcon,
  SignupCountryPicker,
  SignupUseLocation,
} from "@ewatrade/onboarding/components/signup/signup-flow"
import { Input, SelectControl, Textarea } from "@ewatrade/ui"
import {
  OPERATING_CURRENCIES,
  isOperatingCurrencyCode,
  suggestCurrencyForCountry,
} from "@ewatrade/utils"
import { findCountry } from "@ewatrade/utils/countries"
import { GEO_ADDRESS_ATTRIBUTION } from "@ewatrade/utils/geo-address"
import type {
  OwnerSetupBusiness,
  OwnerSetupDraft,
} from "@ewatrade/utils/owner-signup"
import { type Dispatch, type SetStateAction, useState } from "react"
import {
  OWNER_PLAN_LIMITS,
  businessLabel,
  storeReady,
  typeLabel,
} from "./model"

const offers = [
  {
    value: "products",
    icon: "box",
    label: "I sell",
    description: "Things customers buy, like eggs, phones or clothes",
  },
  {
    value: "services",
    icon: "users",
    label: "I offer services",
    description: "Work I do for customers, like repairs, hair or cleaning",
  },
  {
    value: "products_and_services",
    icon: "store",
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
  const [typing, setTyping] = useState(false)
  const [typedAddress, setTypedAddress] = useState("")
  const [locatedBusinessId, setLocatedBusinessId] = useState<string>()
  if (!business || !first) return null
  function patch(changes: Partial<OwnerSetupBusiness>) {
    onChange((current) => ({
      ...current,
      businesses: current.businesses.map((b) =>
        b.id === business?.id ? { ...b, ...changes } : b,
      ),
    }))
  }
  const id = `owner-store-${business.id}`
  const types = business.typeKeys
    .map((key) => typeLabel(key, draft.otherType))
    .join(" + ")
  const address = [business.addressLine1, business.city, business.region]
    .filter(Boolean)
    .join(", ")
  const upgraded = draft.planId !== "starter"
  return (
    <>
      <header>
        <p className="signup-eyebrow">
          Step 3 of 3 ·{" "}
          {setupNow.length > 1
            ? `Business ${index + 1} of ${setupNow.length}`
            : "Store"}
        </p>
        <h1>Set up {business.name}</h1>
        <p className="signup-intro">
          Almost done. You can change all of this later in Settings.
        </p>
      </header>
      {setupNow.length > 1 && (
        <nav className="owner-ref-biztabs" aria-label="Businesses">
          {setupNow.map((item, i) => (
            <button
              type="button"
              key={item.id}
              className={`owner-ref-biztab${i === index ? " owner-ref-on" : ""}`}
              aria-current={i === index ? "step" : undefined}
              onClick={() => {
                setTyping(false)
                onChange({ ...draft, storeIndex: i })
              }}
            >
              <OwnerBusinessAvatar
                typeKey={item.typeKeys[0]}
                name={item.name}
                size={24}
              />
              {businessLabel(item, i)}
              {storeReady(item) && i !== index && (
                <OwnerSignupIcon name="check" />
              )}
            </button>
          ))}
        </nav>
      )}
      <div className="owner-ref-bizhead">
        <OwnerBusinessAvatar
          typeKey={business.typeKeys[0]}
          name={business.name}
          size={42}
        />
        <div>
          <b>{business.name}</b>
          <small>
            {business.slug}.ewatrade.com · {types}
          </small>
        </div>
        <button type="button" className="owner-ref-lnk" onClick={onBack}>
          Change
        </button>
      </div>
      <fieldset className="owner-offer-fieldset">
        <legend className="owner-ref-glbl">
          What does your business do?{" "}
          {!business.offerTouched && (
            <small>· picked for {types.toLowerCase()}</small>
          )}
        </legend>
        <div className="owner-ref-offeropts">
          {offers.map((offer) => (
            <label
              className={`owner-ref-offeropt${business.operatingModel === offer.value ? " owner-ref-on" : ""}`}
              key={offer.value}
            >
              <input
                className="sr-only"
                type="radio"
                name={`offer-${business.id}`}
                checked={business.operatingModel === offer.value}
                onChange={() =>
                  patch({ operatingModel: offer.value, offerTouched: true })
                }
              />
              <span className="owner-ref-oi">
                <OwnerSignupIcon name={offer.icon} />
              </span>
              <span className="owner-ref-ot">
                <b>{offer.label}</b>
                <small>{offer.description}</small>
              </span>
              <span
                className={`owner-ref-radio${business.operatingModel === offer.value ? " owner-ref-on" : ""}`}
                aria-hidden="true"
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="owner-ref-glbl">
        Where you trade <small>· optional, helps customers find you</small>
      </div>
      {address ? (
        <>
          <div className="owner-ref-loccard">
            <span className="owner-ref-pin">
              <OwnerSignupIcon name="flag" />
            </span>
            <div>
              <b>{address}</b>
              <small>
                {locatedBusinessId === business.id
                  ? "From your current location"
                  : "Your business address"}
              </small>
            </div>
            <button
              type="button"
              className="owner-ref-lnk"
              onClick={() => {
                patch({ addressLine1: "", city: "", region: "" })
                setLocatedBusinessId(undefined)
              }}
            >
              Remove
            </button>
          </div>
          {locatedBusinessId === business.id && (
            <small className="owner-ref-help">{GEO_ADDRESS_ATTRIBUTION}</small>
          )}
        </>
      ) : typing ? (
        <>
          <div className="owner-typed-location">
            <Input
              className="signup-input"
              value={typedAddress}
              maxLength={200}
              placeholder="Street, area, city"
              aria-label="Address"
              onChange={(event) => setTypedAddress(event.target.value)}
            />
            <button
              type="button"
              className="owner-ref-chip"
              disabled={!typedAddress.trim()}
              onClick={() => {
                patch({ addressLine1: typedAddress.trim() })
                setTyping(false)
                setLocatedBusinessId(undefined)
              }}
            >
              Use
            </button>
          </div>
          <button
            type="button"
            className="owner-ref-lnk owner-ref-switch"
            onClick={() => setTyping(false)}
          >
            Use my current location instead
          </button>
        </>
      ) : (
        <>
          <SignupUseLocation
            key={business.id}
            appearance="owner-signup"
            onLocated={(value) => {
              setLocatedBusinessId(business.id)
              onChange((current) => ({
                ...current,
                businesses: current.businesses.map((b) =>
                  b.id === business.id
                    ? {
                        ...b,
                        addressLine1: value.addressLine1,
                        city: value.city,
                        region: value.region,
                      }
                    : b,
                ),
              }))
            }}
          />
          <button
            type="button"
            className="owner-ref-lnk owner-ref-switch"
            onClick={() => {
              setTypedAddress("")
              setTyping(true)
            }}
          >
            Type the address instead
          </button>
        </>
      )}
      <div className="owner-ref-grid2 owner-store-country">
        <label className="owner-ref-fld" htmlFor={`${id}-country`}>
          <span>Country</span>
          <SignupCountryPicker
            id={`${id}-country`}
            value={business.countryCode}
            onChange={(countryCode) =>
              patch({
                countryCode,
                currencyCode: suggestCurrencyForCountry(countryCode),
              })
            }
          />
        </label>
        <label className="owner-ref-fld" htmlFor={`${id}-currency`}>
          <span>Currency</span>
          <SelectControl
            id={`${id}-currency`}
            value={business.currencyCode}
            placeholder="Choose currency"
            options={OPERATING_CURRENCIES.map((currency) => ({
              value: currency.code,
              label: `${currency.symbol} ${currency.label} (${currency.code})`,
            }))}
            popupClassName="signup-select-menu"
            onValueChange={(currencyCode) => {
              if (currencyCode === "" || isOperatingCurrencyCode(currencyCode))
                patch({ currencyCode })
            }}
          />
        </label>
      </div>
      {index > 0 && first.countryCode && first.currencyCode && (
        <div className="owner-ref-chips owner-same-country">
          <button
            type="button"
            className="owner-ref-chip owner-ref-sm"
            onClick={() =>
              patch({
                countryCode: first.countryCode,
                currencyCode: first.currencyCode,
              })
            }
          >
            Same as {first.name} · {findCountry(first.countryCode)?.name},{" "}
            {first.currencyCode}
          </button>
        </div>
      )}
      <label
        className="owner-ref-fld owner-store-about"
        htmlFor={`${id}-about`}
      >
        <span>
          About this store <small>· optional</small>
          <em className="owner-ref-counter">
            {business.description?.length ?? 0}/280
          </em>
        </span>
        <Textarea
          id={`${id}-about`}
          className="signup-input"
          rows={3}
          maxLength={280}
          value={business.description ?? ""}
          placeholder="A line or two about what you offer. Shown on your store page."
          onChange={(event) => patch({ description: event.target.value })}
        />
        <small className="owner-ref-help">
          Shown on your store page. Skip it now if you like.
        </small>
      </label>
      <div className="owner-ref-banner owner-ref-t-mint owner-free-store-banner">
        <OwnerSignupIcon name="store" />
        <div>
          <b>Your free store link works right away</b>
          <b>{business.slug}.ewatrade.com</b>
          {upgraded ? (
            `On ${draft.planId === "growth" ? "Growth" : "Pro"} it can list all your items. Customer messages are included once your store chat is set up.`
          ) : (
            <>
              On Starter it shows your{" "}
              <b className="owner-inline-bold">first 3 items</b>. Upgrade to
              show everything and let customers message you once your store chat
              is set up.
            </>
          )}
        </div>
      </div>
      <footer className="owner-step-actions">
        <button
          className="signup-secondary"
          disabled={disabled}
          type="button"
          onClick={onBack}
          aria-label="Back"
        >
          <OwnerSignupIcon name="arrowRight" className="owner-back-icon" />
        </button>
        <div className="owner-ref-hint">
          {!storeReady(business)
            ? "Choose a country and currency."
            : index < setupNow.length - 1
              ? `Next: ${setupNow[index + 1]?.name}`
              : draft.businesses.length > setupNow.length
                ? `${draft.businesses.length - setupNow.length} more wait on Home`
                : "Last step"}
        </div>
        <button
          className="signup-primary"
          type="button"
          disabled={disabled || !storeReady(business)}
          onClick={onNext}
        >
          {disabled
            ? "Saving…"
            : index < setupNow.length - 1
              ? `Continue to ${setupNow[index + 1]?.name}`
              : "Finish setup"}
        </button>
      </footer>
    </>
  )
}
