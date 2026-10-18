"use client"

import { Input } from "@ewatrade/ui"
import { normalizeStoreLink } from "@ewatrade/utils/store-link"
import { useCallback, useEffect, useRef, useState } from "react"
import { phoneCountry as phoneCountryHint } from "../../lib/international-phone"
import type { EligibleAgeBand } from "../../lib/signup-age"
import { getMarketingUrl } from "../../lib/signup-navigation"
import { LegacySignupFlow } from "./legacy-signup-flow"
import { OwnerSignupIcon } from "./owner-signup-artwork"
import { OwnerSignupFrame } from "./owner-signup-frame"
import { SignupGoogle } from "./signup-google"
import { SignupPhoneInput } from "./signup-phone-input"
import { type StoreLinkCheck, StoreLinkField } from "./store-link-field"

export { OwnerSignupFrame } from "./owner-signup-frame"
export { OwnerBusinessAvatar, OwnerSignupIcon } from "./owner-signup-artwork"
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
  ["ADULT", "18+"],
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
    // Same country hint as the earlier signup; Nigeria when no hint is available.
    const controller = new AbortController()
    fetch("/api/signup/start", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (controller.signal.aborted) return
        setPhoneCountry(
          (current) => current || phoneCountryHint(data?.country) || "NG",
        )
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setPhoneCountry((current) => current || "NG")
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
      link?.available &&
      link.requestedSlug === account.slug &&
      link.emailDomain ===
        (mode === "email"
          ? account.email.split("@")[1]?.toLowerCase()
          : undefined) &&
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
    name: account.name.trim() || undefined,
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
      step={step}
    >
      <main className="signup-main owner-account">
        <p className="signup-eyebrow">
          {step === "account"
            ? "Step 1 of 3 · Account"
            : mode === "email"
              ? "Check your email"
              : "Check WhatsApp"}
        </p>
        <h1>
          {step === "account"
            ? "Start your business on EwaTrade"
            : "Enter the 6-digit code"}
        </h1>
        <p className="signup-intro">
          {step === "account" ? (
            "Your business name and how you’ll sign in. Takes about a minute."
          ) : (
            <>
              We sent it to {mode === "email" ? account.email : account.phone}.{" "}
              <button
                type="button"
                className="owner-ref-lnk"
                disabled={pending}
                onClick={() => {
                  setStep("account")
                  setCode("")
                  setDevCode(null)
                  setError("")
                }}
              >
                Change
              </button>
            </>
          )}
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
              if (ready && account.name.trim() && contactReady)
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
                  placeholder="Your business name"
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
                  placeholder="Your name"
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
                    placeholder="Email"
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
              <legend>Your age</legend>
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
              {age !== "UNDER_13" && (
                <span className="owner-ref-help">
                  EwaTrade accounts are for people aged 13 or older.
                </span>
              )}
            </fieldset>
            {age === "UNDER_13" ? (
              <output className="owner-age-warning">
                <b>Not available under 13</b>
                <span>
                  ẸwáTrade is available from age 13. Nothing you typed has been
                  saved.
                </span>
                <a href="/login">Close setup</a>
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
            {age !== "UNDER_13" && (
              <>
                <button
                  className="signup-primary"
                  disabled={
                    !ready || !account.name.trim() || !contactReady || pending
                  }
                  type="submit"
                >
                  {pending
                    ? "Sending your code…"
                    : mode === "email"
                      ? "Send code to email"
                      : "Send code on WhatsApp"}
                </button>
                <div className="owner-divider">or</div>
                <SignupGoogle
                  clientId={settings?.googleClientId ?? null}
                  disabled={!ready || pending}
                  onCredential={(idToken) => {
                    if (ready) void submit("google", idToken)
                  }}
                />
                <p className="owner-ref-help owner-ref-center">
                  {ready
                    ? "Google fills in your name and email."
                    : "Google needs your business name, age and the Terms above first."}
                </p>
              </>
            )}
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (/^\d{6}$/.test(code))
                void submit(mode === "email" ? "verify_email" : "verify_phone")
            }}
            className="owner-code-form"
          >
            <label className="sr-only" htmlFor="owner-code">
              Verification code
              <Input
                id="owner-code"
                className="owner-ref-otp-real"
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
            <label
              htmlFor="owner-code"
              className="owner-ref-otp"
              aria-hidden="true"
            >
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <i
                  className={
                    index === code.length ? "owner-ref-cur" : undefined
                  }
                  key={index}
                >
                  {code[index] ?? ""}
                </i>
              ))}
            </label>
            <div className="owner-ref-otp-msg">
              Didn’t get it?{" "}
              <button
                type="button"
                className="owner-ref-lnk"
                disabled={pending || now < retryAt}
                onClick={() =>
                  void submit(
                    mode === "email" ? "request_email" : "request_phone",
                  )
                }
              >
                {now < retryAt
                  ? `Resend in 0:${String(Math.ceil((retryAt - now) / 1000)).padStart(2, "0")}`
                  : "Resend code"}
              </button>
              {devCode && (
                <>
                  {" "}
                  · Local development code: <code>{devCode}</code>
                </>
              )}
            </div>
            <button
              type="submit"
              className="signup-primary"
              disabled={pending || code.length !== 6}
            >
              {pending ? "Verifying…" : "Verify"}
            </button>
            <div className="owner-ref-banner owner-ref-t-sky">
              <OwnerSignupIcon name="lock" />
              <div>
                Your account is created once the code checks out. If you leave
                after this, your progress is saved.
              </div>
            </div>
          </form>
        )}
      </main>
    </OwnerSignupFrame>
  )
}

export { SignupUseLocation } from "./signup-location"
