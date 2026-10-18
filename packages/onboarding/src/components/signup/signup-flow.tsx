"use client"

import { Input } from "@ewatrade/ui"
import { normalizeStoreLink } from "@ewatrade/utils/store-link"
import { useCallback, useEffect, useRef, useState } from "react"
import type { EligibleAgeBand } from "../../lib/signup-age"
import { getMarketingUrl } from "../../lib/signup-navigation"
import { LegacySignupFlow } from "./legacy-signup-flow"
import { OwnerSignupFrame } from "./owner-signup-frame"
import { SignupGoogle } from "./signup-google"
import { SignupPhoneInput } from "./signup-phone-input"
import { type StoreLinkCheck, StoreLinkField } from "./store-link-field"

export { OwnerSignupFrame } from "./owner-signup-frame"
export { StoreLinkField } from "./store-link-field"
export type { StoreLinkCheck } from "./store-link-field"

type Settings = {
  publication: {
    acceptanceRequired: boolean
    effective: boolean
    signupAvailable: boolean
    version: string | null
  }
  phoneEnabled: boolean
  googleClientId: string | null
}
const ages = [
  ["UNDER_13", "Under 13"],
  ["AGE_13_TO_15", "13–15"],
  ["AGE_16_TO_17", "16–17"],
  ["ADULT", "18 or older"],
] as const
const blank = {
  businessName: "",
  name: "",
  email: "",
  phone: "",
  slug: "",
  terms: false,
}

export function SignupFlow() {
  const [legacy, setLegacy] = useState<boolean | null>(null)
  useEffect(() => {
    setLegacy(new URLSearchParams(window.location.search).has("access_token"))
  }, [])
  if (legacy === null)
    return (
      <main className="signup-main">
        <output>Preparing your account…</output>
      </main>
    )
  if (legacy) return <LegacySignupFlow />
  return <AccountFirstSignup />
}

function AccountFirstSignup() {
  const [account, setAccount] = useState(blank)
  const [age, setAge] = useState<EligibleAgeBand | "UNDER_13" | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [mode, setMode] = useState<"email" | "phone">("email")
  const [phoneCountry, setPhoneCountry] = useState("")
  const [link, setLink] = useState<StoreLinkCheck | null>(null)
  const [slugEdited, setSlugEdited] = useState(false)
  const [step, setStep] = useState<"account" | "code">("account")
  const [code, setCode] = useState("")
  const [devCode, setDevCode] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const submitLock = useRef(false)
  const [error, setError] = useState("")
  const [retryAt, setRetryAt] = useState(0)
  const [now, setNow] = useState(0)
  const checkLink = useCallback(
    (value: StoreLinkCheck | null) => setLink(value),
    [],
  )
  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/owner-signup", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.message)
        if (!controller.signal.aborted) setSettings(result)
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Signup options could not be loaded. Reload to try again.",
          )
      })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (step !== "code") return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [step])
  const eligible = age && age !== "UNDER_13"
  const ready = Boolean(
    eligible &&
      account.terms &&
      account.businessName.trim() &&
      account.name.trim() &&
      link?.available &&
      settings?.publication.signupAvailable,
  )
  const contactReady =
    mode === "email"
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email)
      : Boolean(
          settings?.phoneEnabled && /^\+[1-9]\d{7,14}$/.test(account.phone),
        )
  const legal = {
    acceptedTerms: true,
    acknowledgedPrivacyNotice: true,
    ...(settings?.publication.version
      ? { legalVersion: settings.publication.version }
      : {}),
  }
  const profile = {
    businessName: account.businessName.trim(),
    requestedSlug: link?.slug ?? account.slug,
    name: account.name.trim(),
    ageBand: age,
  }
  async function submit(
    action:
      | "request_email"
      | "request_phone"
      | "verify_email"
      | "verify_phone"
      | "google",
    idToken?: string,
  ) {
    if (
      submitLock.current ||
      !eligible ||
      !account.terms ||
      !settings?.publication.signupAvailable
    )
      return
    submitLock.current = true
    setPending(true)
    setError("")
    try {
      const input =
        action === "verify_phone"
          ? { phone: account.phone, code }
          : {
              ...profile,
              ...(action === "google"
                ? { idToken, ...legal }
                : mode === "email"
                  ? {
                      email: account.email.trim(),
                      ...(action === "verify_email" ? { code } : legal),
                    }
                  : { phone: account.phone, ...legal }),
            }
      const response = await fetch("/api/owner-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...input }),
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(result.message ?? "Signup could not be completed.")
      if (result.success) {
        window.location.assign("/setup")
        return
      }
      setStep("code")
      setCode("")
      setDevCode(result.devCode ?? null)
      setNow(Date.now())
      setRetryAt(Date.now() + 60_000)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to connect. Please try again.",
      )
    } finally {
      submitLock.current = false
      setPending(false)
    }
  }
  return (
    <OwnerSignupFrame
      name={account.businessName}
      slug={link?.slug ?? account.slug}
    >
      <main className="signup-main owner-account">
        <p className="signup-eyebrow">
          {step === "account"
            ? "01 / Your account"
            : "02 / Verify your contact"}
        </p>
        <h1>
          {step === "account"
            ? "Your next chapter starts here."
            : "Check your code."}
        </h1>
        <p className="signup-intro">
          {step === "account"
            ? "A free store link, a place for your business, and room to grow."
            : `Enter the six-digit code sent to ${mode === "email" ? account.email : account.phone}.`}
        </p>
        {error && (
          <p role="alert" className="owner-error">
            {error}
          </p>
        )}
        {step === "account" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (ready && contactReady)
                void submit(
                  mode === "email" ? "request_email" : "request_phone",
                )
            }}
          >
            <fieldset
              disabled={pending || age === "UNDER_13"}
              className="owner-fields"
            >
              <label className="signup-label" htmlFor="owner-business-name">
                Business name
                <Input
                  id="owner-business-name"
                  className="signup-input"
                  name="businessName"
                  autoComplete="organization"
                  maxLength={120}
                  required
                  value={account.businessName}
                  onChange={(event) => {
                    const businessName = event.target.value
                    setAccount((current) => ({
                      ...current,
                      businessName,
                      slug: slugEdited
                        ? current.slug
                        : normalizeStoreLink(businessName),
                    }))
                  }}
                />
              </label>
              <StoreLinkField
                value={account.slug}
                emailDomain={
                  mode === "email"
                    ? account.email.split("@")[1]?.toLowerCase()
                    : undefined
                }
                onChange={(slug) => {
                  setSlugEdited(true)
                  setAccount((current) => ({ ...current, slug }))
                }}
                onCheck={checkLink}
              />
              <label className="signup-label" htmlFor="owner-name">
                Your name
                <Input
                  id="owner-name"
                  className="signup-input"
                  name="name"
                  autoComplete="name"
                  maxLength={120}
                  required
                  value={account.name}
                  onChange={(event) =>
                    setAccount((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              {mode === "email" ? (
                <label className="signup-label" htmlFor="owner-email">
                  Email
                  <Input
                    id="owner-email"
                    className="signup-input"
                    type="email"
                    autoComplete="email"
                    required
                    value={account.email}
                    onChange={(event) =>
                      setAccount((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                  />
                </label>
              ) : (
                <label className="signup-label" htmlFor="signup-whatsapp">
                  WhatsApp number
                  <SignupPhoneInput
                    id="signup-whatsapp"
                    value={account.phone}
                    country={phoneCountry}
                    onCountryChange={setPhoneCountry}
                    onChange={(phone) =>
                      setAccount((current) => ({ ...current, phone }))
                    }
                  />
                </label>
              )}
              {settings?.phoneEnabled && (
                <button
                  type="button"
                  className="owner-text-button"
                  onClick={() => {
                    setMode(mode === "email" ? "phone" : "email")
                    setError("")
                  }}
                >
                  {mode === "email"
                    ? "Use WhatsApp instead"
                    : "Use email instead"}
                </button>
              )}
            </fieldset>
            <fieldset className="owner-age" disabled={pending}>
              <legend>Your age range</legend>
              <div className="owner-chips">
                {ages.map(([value, label]) => (
                  <label
                    className={`owner-chip ${age === value ? "is-selected" : ""}`}
                    key={value}
                  >
                    <input
                      type="radio"
                      name="owner-age"
                      checked={age === value}
                      value={value}
                      onChange={() => {
                        setAge(value)
                        if (value === "UNDER_13") {
                          setAccount(blank)
                          setSlugEdited(false)
                          setCode("")
                          setDevCode(null)
                          setLink(null)
                        }
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {age === "UNDER_13" ? (
              <output className="owner-error">
                EwaTrade accounts are for people aged 13 or older. Your entered
                details have been cleared.
              </output>
            ) : (
              <label className="owner-terms">
                <input
                  type="checkbox"
                  checked={account.terms}
                  disabled={pending}
                  onChange={(event) =>
                    setAccount((current) => ({
                      ...current,
                      terms: event.target.checked,
                    }))
                  }
                />
                <span>
                  I agree to the{" "}
                  <a
                    href={`${getMarketingUrl()}/terms`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Terms
                  </a>{" "}
                  and acknowledge the{" "}
                  <a
                    href={`${getMarketingUrl()}/privacy`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Privacy Notice
                  </a>
                  .
                </span>
              </label>
            )}
            {settings && !settings.publication.signupAvailable && (
              <output className="owner-error">
                Signup is unavailable until the current Terms and Privacy Notice
                are effective.
              </output>
            )}
            <button
              className="signup-primary"
              disabled={!ready || !contactReady || pending}
              type="submit"
            >
              {pending ? "Sending your code…" : "Continue"}
            </button>
            <div className="owner-divider">or</div>
            <SignupGoogle
              clientId={settings?.googleClientId ?? null}
              disabled={!ready || pending}
              onCredential={(idToken) => {
                if (ready) void submit("google", idToken)
              }}
            />
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (/^\d{6}$/.test(code))
                void submit(mode === "email" ? "verify_email" : "verify_phone")
            }}
            className="owner-fields"
          >
            <label className="signup-label" htmlFor="owner-code">
              Verification code
              <Input
                id="owner-code"
                className="signup-input owner-code"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                disabled={pending}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, ""))
                }
              />
            </label>
            {devCode && (
              <p className="owner-muted">
                Local development code: <code>{devCode}</code>
              </p>
            )}
            <button
              type="submit"
              className="signup-primary"
              disabled={pending || code.length !== 6}
            >
              {pending ? "Verifying…" : "Verify and continue"}
            </button>
            <button
              type="button"
              className="owner-text-button"
              disabled={pending || now < retryAt}
              onClick={() =>
                void submit(
                  mode === "email" ? "request_email" : "request_phone",
                )
              }
            >
              {now < retryAt
                ? `Resend code in ${Math.ceil((retryAt - now) / 1000)}s`
                : "Resend code"}
            </button>
            <button
              type="button"
              className="owner-text-button"
              disabled={pending}
              onClick={() => {
                setStep("account")
                setCode("")
                setDevCode(null)
                setError("")
              }}
            >
              Change account details
            </button>
          </form>
        )}
      </main>
    </OwnerSignupFrame>
  )
}
