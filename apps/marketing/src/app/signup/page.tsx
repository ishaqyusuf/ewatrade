"use client"

import { SignupStepper } from "@/components/signup/signup-stepper"
import { StepBusiness } from "@/components/signup/step-business"
import { StepOwner } from "@/components/signup/step-owner"
import { StepSuccess } from "@/components/signup/step-success"
import { StepWorkspace } from "@/components/signup/step-workspace"
import type {
  PublicLegalPublication,
  SignupLegalAcceptance,
} from "@/lib/legal-publication"
import type {
  BusinessValues,
  OwnerValues,
  WorkspaceValues,
} from "@/lib/signup-schemas"
import { useEffect, useState } from "react"

// ─── Accumulated form state ───────────────────────────────────────────────────

type SignupFormState = {
  workspace?: Partial<WorkspaceValues>
  business?: Partial<BusinessValues>
  owner?: Partial<OwnerValues>
}

type EarlyAccessSessionResponse = {
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

type EligibleAgeBand = "AGE_13_TO_15" | "AGE_16_TO_17" | "ADULT"

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

export default function SignupPage() {
  const [entryAgeChoice, setEntryAgeChoice] = useState<
    EligibleAgeBand | "UNDER_13" | null
  >(null)
  const [ageBand, setAgeBand] = useState<EligibleAgeBand | null>(null)
  const [step, setStep] = useState(1)
  const [formState, setFormState] = useState<SignupFormState>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [success, setSuccess] = useState<SuccessState | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [accessNotice, setAccessNotice] = useState<string | null>(null)
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

    if (!token) return

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
        "Early access link verified. Finish your workspace setup.",
      )
      setFormState((current) => ({
        ...current,
        business: {
          ...current.business,
          businessName:
            body.lead.businessName || current.business?.businessName || "",
          phone: body.lead.phone || current.business?.phone || "",
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

  // ── Step handlers ──────────────────────────────────────────────────────────

  function handleWorkspace(data: WorkspaceValues) {
    setFormState((s) => ({ ...s, workspace: data }))
    setStep(2)
  }

  function handleBusiness(data: BusinessValues) {
    setFormState((s) => ({ ...s, business: data }))
    setStep(3)
  }

  async function handleOwner(
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
        subdomain: formState.workspace?.subdomain ?? "",
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

      if (!response.ok) {
        setSubmitError(
          result.message ?? "Something went wrong. Please try again.",
        )
        return
      }

      setFormState((s) => ({ ...s, owner: data }))
      setSuccess({
        tenantSlug: result.tenantSlug ?? payload.subdomain,
        businessName: payload.businessName,
        dashboardUrl: result.dashboardUrl,
        devEmailHtml: result.devEmailHtml,
        emailDeliveryStatus: result.emailDeliveryStatus,
        posUrl: result.posUrl,
        storefrontUrl: result.storefrontUrl,
      })
      setStep(4)
    } catch {
      setSubmitError(
        "Unable to connect. Please check your connection and try again.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!ageBand) {
    return (
      <main className="mx-auto grid min-h-[calc(100vh-8rem)] max-w-lg place-content-center gap-4 px-6 pb-16">
        <section className="grid gap-4 rounded-xl border border-border/70 bg-background p-6 sm:p-8">
          <h1 className="text-2xl font-semibold">Before creating an account</h1>
          <p className="text-sm text-muted-foreground">
            EwaTrade accounts are for people aged 13 or older. Choose your age
            range before entering account or Store details.
          </p>
          <div className="grid gap-2">
            {ageChoices.map((choice) => (
              <label
                className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3"
                key={choice.value}
              >
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
            <output className="text-sm text-muted-foreground">
              EwaTrade accounts are not available to people under 13.
            </output>
          ) : (
            <button
              className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50"
              disabled={!entryAgeChoice}
              onClick={() => setAgeBand(entryAgeChoice as EligibleAgeBand)}
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
    <div className="min-h-[calc(100vh-8rem)] px-6 pb-16 sm:px-10">
      <div className="mx-auto max-w-2xl">
        {/* Stepper (hidden on success step) */}
        {step < 4 && <SignupStepper currentStep={step} />}

        {/* Card wrapper */}
        <div
          className="animate-in fade-in slide-in-from-bottom-4 rounded-xl border border-border/70 bg-background p-6 duration-500 sm:p-8"
          key={step}
        >
          {accessNotice && step < 4 && (
            <div className="mb-5 border-l-2 border-primary bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
              {accessNotice}
            </div>
          )}

          {step === 1 && (
            <StepWorkspace
              defaultValues={formState.workspace}
              onNext={handleWorkspace}
            />
          )}

          {step === 2 && (
            <StepBusiness
              defaultValues={formState.business}
              onNext={handleBusiness}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && (
            <StepOwner
              defaultValues={formState.owner}
              onNext={handleOwner}
              onBack={() => setStep(2)}
              isSubmitting={isSubmitting}
              submitError={submitError}
              legalPublication={legalPublication}
              legalPublicationError={legalPublicationError}
            />
          )}

          {step === 4 && success && (
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
    </div>
  )
}
