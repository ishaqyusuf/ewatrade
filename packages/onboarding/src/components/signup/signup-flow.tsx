"use client"

import type { OnboardingDraft } from "@ewatrade/db/onboarding-continuation"
import { useEffect, useState } from "react"
import { useSignupAge } from "../../hooks/use-signup-age"
import type {
  PublicLegalPublication,
  SignupLegalAcceptance,
} from "../../lib/legal-publication"
import {
  businessValuesFromOnboardingDraft,
  onboardingDraftFromBusinessValues,
} from "../../lib/onboarding-draft"
import type { EligibleAgeBand } from "../../lib/signup-age"
import { getMarketingUrl } from "../../lib/signup-navigation"
import type { BusinessValues, OwnerValues } from "../../lib/signup-schemas"
import { SignupStepper } from "./signup-stepper"
import { StepBusiness } from "./step-business"
import { StepLegal } from "./step-legal"
import { StepOwner } from "./step-owner"
import { StepSuccess } from "./step-success"
import { VerifyApprovedEmail } from "./verify-approved-email"

// ─── Accumulated form state ───────────────────────────────────────────────────

type SignupFormState = {
  business?: Partial<BusinessValues>
  owner?: Partial<OwnerValues>
}

type EarlyAccessSessionResponse = {
  draft?: OnboardingDraft
  emailVerified: boolean
  qaWorkspace: boolean
  accessToken: string
  expiresAt: string
  lead: {
    businessName: string
    email: string
    firstName: string
    fullName: string
    lastName: string
    phone: string
  }
}

type SuccessState = {
  tenantSlug: string
  businessName: string
  dashboardUrl?: string
  devEmailHtml?: string
  emailDeliveryStatus?: "failed" | "sent"
  posUrl?: string
  storefrontUrl?: string
}

const ageChoices: Array<{
  label: string
  value: EligibleAgeBand | "UNDER_13"
}> = [
  { label: "Under 13", value: "UNDER_13" },
  { label: "13–15", value: "AGE_13_TO_15" },
  { label: "16–17", value: "AGE_16_TO_17" },
  { label: "18 or older", value: "ADULT" },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SignupFlow() {
  const [entryAgeChoice, setEntryAgeChoice] = useState<
    EligibleAgeBand | "UNDER_13" | null
  >(null)
  const { ageBand, ready: ageReady, confirmAge, clearAge } = useSignupAge()
  const [step, setStep] = useState<2 | 3 | 4 | 5>(2)
  const [formState, setFormState] = useState<SignupFormState>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [draftError, setDraftError] = useState("")
  const [success, setSuccess] = useState<SuccessState | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [accessNotice, setAccessNotice] = useState<string | null>(null)
  const [entryReady, setEntryReady] = useState(false)
  const [verificationEmail, setVerificationEmail] = useState<string | null>(
    null,
  )
  const [approvedIdentity, setApprovedIdentity] = useState<{
    businessName: string
    email: string
  } | null>(null)
  const [legalPublication, setLegalPublication] =
    useState<PublicLegalPublication | null>(null)
  const [legalPublicationError, setLegalPublicationError] = useState<
    string | null
  >(null)

  useEffect(() => {
    let cancelled = false
    async function loadLegalPublication() {
      try {
        const response = await fetch("/api/legal-publication", {
          cache: "no-store",
        })
        const body = (await response.json()) as PublicLegalPublication
        if (
          !response.ok ||
          typeof body.acceptanceRequired !== "boolean" ||
          typeof body.approved !== "boolean" ||
          typeof body.signupAvailable !== "boolean" ||
          (body.approved && !body.version)
        )
          throw new Error("Invalid legal publication status")
        if (!cancelled) {
          setLegalPublication(body)
          setLegalPublicationError(null)
        }
      } catch {
        if (!cancelled)
          setLegalPublicationError(
            "The current Terms could not be checked. Reload to continue.",
          )
      }
    }
    void loadLegalPublication()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ageBand) return
    const token = new URLSearchParams(window.location.search)
      .get("access_token")
      ?.trim()

    if (!token) {
      window.location.assign(`${getMarketingUrl()}/#early-access`)
      return
    }

    const earlyAccessToken = token
    let cancelled = false
    setAccessToken(earlyAccessToken)
    setAccessNotice("Checking your early access link…")

    async function loadAccessSession() {
      const response = await fetch(
        `/api/early-access/session?token=${encodeURIComponent(earlyAccessToken)}`,
      )
      const body = (await response.json().catch(() => null)) as
        | EarlyAccessSessionResponse
        | { message?: string }
        | null

      if (cancelled) return

      if (!response.ok || !body || !("lead" in body)) {
        const message =
          body && "message" in body
            ? body.message
            : "This early access link could not be verified."

        setAccessNotice(
          message ?? "This early access link could not be verified.",
        )
        return
      }

      setAccessNotice(
        body.emailVerified
          ? "Early access and email verified. Finish your workspace setup."
          : "Early access approved. Verify your email to continue.",
      )
      setFormState((current) => ({
        ...current,
        business: {
          ...current.business,
          ...businessValuesFromOnboardingDraft(body.draft ?? {}),
          businessName:
            body.lead.businessName || current.business?.businessName || "",
          phone:
            body.draft?.phone ||
            body.lead.phone ||
            current.business?.phone ||
            "",
        },
        owner: {
          ...current.owner,
          confirmPassword: current.owner?.confirmPassword ?? "",
          email: body.lead.email,
          firstName: body.lead.firstName || current.owner?.firstName || "",
          lastName: body.lead.lastName || current.owner?.lastName || "",
          password: current.owner?.password ?? "",
        },
      }))
      setApprovedIdentity({
        businessName: body.lead.businessName,
        email: body.lead.email,
      })
      setVerificationEmail(body.emailVerified ? null : body.lead.email)
      setEntryReady(body.emailVerified)
      if (body.emailVerified && body.draft?.step === "account") setStep(3)
    }

    void loadAccessSession().catch(() => {
      if (!cancelled) {
        setAccessNotice("This early access link could not be verified.")
      }
    })

    return () => {
      cancelled = true
    }
  }, [ageBand])

  function goToStep(nextStep: 2 | 3 | 4 | 5) {
    setStep(nextStep)
    window.scrollTo({ top: 0 })
  }

  // ── Step handlers ──────────────────────────────────────────────────────────

  async function handleBusiness(data: BusinessValues) {
    setDraftError("")
    try {
      const response = await fetch("/api/early-access/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: accessToken,
          draft: onboardingDraftFromBusinessValues(data),
        }),
      })
      if (!response.ok)
        throw new Error(
          "Your setup progress could not be saved. Try again before continuing.",
        )
    } catch {
      setDraftError(
        "Your setup progress could not be saved. Try again before continuing.",
      )
      return
    }
    setFormState((s) => ({ ...s, business: data }))
    goToStep(3)
  }

  async function createWorkspace(
    data: OwnerValues,
    legalAcceptance?: SignupLegalAcceptance,
  ) {
    setSubmitError("")
    setIsSubmitting(true)

    try {
      const payload = {
        ageBand,
        addressLine1: formState.business?.addressLine1 ?? "",
        accessToken: accessToken ?? undefined,
        businessName: formState.business?.businessName ?? "",
        city: formState.business?.city ?? "",
        businessProfileKey: formState.business?.businessProfileKey ?? "",
        businessProfileVersion: 1 as const,
        businessSize: formState.business?.businessSize ?? "",
        countryCode: formState.business?.countryCode ?? "",
        currencyCode: formState.business?.currencyCode ?? "NGN",
        phone: formState.business?.phone ?? "",
        region: formState.business?.region ?? "",
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: data.password,
        operatingModel: formState.business?.operatingModel ?? "products",
        orderChannels: formState.business?.orderChannels ?? [],
        otherBusinessDescription:
          formState.business?.otherBusinessDescription ?? undefined,
        ...legalAcceptance,
      }

      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })

      const result = (await response.json()) as {
        success?: boolean
        message?: string
        tenantSlug?: string
        dashboardUrl?: string
        devEmailHtml?: string
        emailDeliveryStatus?: "failed" | "sent"
        posUrl?: string
        storefrontUrl?: string
      }

      if (!response.ok || !result.success || !result.tenantSlug) {
        setSubmitError(
          result.message ?? "Something went wrong. Please try again.",
        )
        return
      }

      setFormState((s) => ({ ...s, owner: data }))
      clearAge()
      window.history.replaceState(null, "", window.location.pathname)
      setSuccess({
        tenantSlug: result.tenantSlug,
        businessName: payload.businessName,
        dashboardUrl: result.dashboardUrl,
        devEmailHtml: result.devEmailHtml,
        emailDeliveryStatus: result.emailDeliveryStatus,
        posUrl: result.posUrl,
        storefrontUrl: result.storefrontUrl,
      })
      goToStep(5)
    } catch {
      setSubmitError(
        "Unable to connect. Please check your connection and try again.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleOwner(data: OwnerValues) {
    setFormState((current) => ({ ...current, owner: data }))
    if (!legalPublication) return
    if (legalPublication.acceptanceRequired) goToStep(4)
    else void createWorkspace(data)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!ageReady) {
    return (
      <main className="signup-main">
        <output>Preparing your setup…</output>
      </main>
    )
  }

  if (!ageBand) {
    return (
      <main className="signup-main signup-age">
        <section>
          <p className="signup-eyebrow">A quick check before we start</p>
          <h1>
            Welcome to
            <br />
            your next chapter.
          </h1>
          <p className="signup-intro">
            EwaTrade accounts are for people aged 13 or older. Choose your age
            range before entering account or Store details.
          </p>
          <div className="grid gap-2">
            {ageChoices.map((choice) => (
              <label className="signup-age-choice" key={choice.value}>
                <input
                  checked={entryAgeChoice === choice.value}
                  name="account-entry-age"
                  onChange={() => setEntryAgeChoice(choice.value)}
                  type="radio"
                />
                <span>{choice.label}</span>
              </label>
            ))}
          </div>
          {entryAgeChoice === "UNDER_13" ? (
            <output className="signup-intro">
              EwaTrade accounts are not available to people under 13.
            </output>
          ) : (
            <button
              className="signup-primary"
              disabled={!entryAgeChoice}
              onClick={() => {
                if (entryAgeChoice && entryAgeChoice !== "UNDER_13")
                  void confirmAge(entryAgeChoice)
              }}
              type="button"
            >
              Continue
            </button>
          )}
        </section>
      </main>
    )
  }

  return (
    <main className="signup-main">
      <div>
        {/* Stepper (hidden on success step) */}
        {step < 5 && (
          <SignupStepper
            currentStep={step}
            acceptanceRequired={legalPublication?.acceptanceRequired ?? true}
          />
        )}

        {/* Focused form, without a surrounding card. */}
        <div className="signup-screen" key={step}>
          {(accessNotice || !entryReady) && step === 2 && (
            <output className="signup-entry">
              {accessNotice ?? "Preparing your setup…"}
              {!entryReady && !verificationEmail && (
                <a
                  href={`${getMarketingUrl()}/#early-access`}
                  className="mt-2 block underline"
                >
                  Request early access
                </a>
              )}
            </output>
          )}

          {step === 2 && verificationEmail && accessToken && (
            <VerifyApprovedEmail
              accessToken={accessToken}
              email={verificationEmail}
            />
          )}

          {step === 2 && entryReady && (
            <>
              {draftError ? <p role="alert">{draftError}</p> : null}
              <StepBusiness
                approvedBusinessName={approvedIdentity?.businessName}
                defaultValues={formState.business}
                onNext={handleBusiness}
                totalSteps={
                  legalPublication?.acceptanceRequired === false ? 2 : 3
                }
              />
            </>
          )}

          {step === 3 && (
            <StepOwner
              approvedEmail={approvedIdentity?.email}
              defaultValues={formState.owner}
              onNext={handleOwner}
              onBack={(draft) => {
                setFormState((current) => ({ ...current, owner: draft }))
                goToStep(2)
              }}
              isSubmitting={isSubmitting}
              submitError={submitError}
              finalStep={legalPublication?.acceptanceRequired === false}
              blocked={!legalPublication || Boolean(legalPublicationError)}
            />
          )}

          {step === 4 && legalPublication && (
            <StepLegal
              publication={legalPublication}
              isSubmitting={isSubmitting}
              submitError={submitError}
              onBack={() => {
                setSubmitError("")
                goToStep(3)
              }}
              onNext={(acceptance) => {
                if (formState.owner)
                  void createWorkspace(
                    formState.owner as OwnerValues,
                    acceptance,
                  )
              }}
            />
          )}
          {legalPublicationError && step === 3 && (
            <p role="alert">{legalPublicationError}</p>
          )}
          {step === 5 && success && (
            <StepSuccess
              tenantSlug={success.tenantSlug}
              businessName={success.businessName}
              dashboardUrl={success.dashboardUrl}
              devEmailHtml={success.devEmailHtml}
              emailDeliveryStatus={success.emailDeliveryStatus}
              posUrl={success.posUrl}
              storefrontUrl={success.storefrontUrl}
            />
          )}
        </div>
      </div>
    </main>
  )
}
