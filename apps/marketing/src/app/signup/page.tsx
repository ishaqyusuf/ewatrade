"use client"

import { SignupStepper } from "@/components/signup/signup-stepper"
import { StepBusiness } from "@/components/signup/step-business"
import { StepOwner } from "@/components/signup/step-owner"
import { StepSuccess } from "@/components/signup/step-success"
import { StepWorkspace } from "@/components/signup/step-workspace"
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SignupPage() {
  const [step, setStep] = useState(1)
  const [formState, setFormState] = useState<SignupFormState>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [success, setSuccess] = useState<SuccessState | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [accessNotice, setAccessNotice] = useState<string | null>(null)

  useEffect(() => {
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
  }, [])

  // ── Step handlers ──────────────────────────────────────────────────────────

  function handleWorkspace(data: WorkspaceValues) {
    setFormState((s) => ({ ...s, workspace: data }))
    setStep(2)
  }

  function handleBusiness(data: BusinessValues) {
    setFormState((s) => ({ ...s, business: data }))
    setStep(3)
  }

  async function handleOwner(data: OwnerValues) {
    setSubmitError("")
    setIsSubmitting(true)

    try {
      const payload = {
        addressLine1: formState.business?.addressLine1 ?? "",
        accessToken: accessToken ?? undefined,
        subdomain: formState.workspace?.subdomain ?? "",
        customDomain: formState.workspace?.customDomain ?? "",
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
