"use client"

import { SignupStepper } from "@/components/signup/signup-stepper"
import { StepAccountType } from "@/components/signup/step-account-type"
import { StepBusiness } from "@/components/signup/step-business"
import { StepOwner } from "@/components/signup/step-owner"
import { StepSuccess } from "@/components/signup/step-success"
import { StepWorkspace } from "@/components/signup/step-workspace"
import type {
  AccountTypeValues,
  BusinessValues,
  OwnerValues,
  WorkspaceValues,
} from "@/lib/signup-schemas"
import { useState } from "react"

// ─── Accumulated form state ───────────────────────────────────────────────────

type SignupFormState = {
  accountType?: AccountTypeValues
  workspace?: WorkspaceValues
  business?: BusinessValues
  owner?: OwnerValues
}

type SuccessState = {
  tenantSlug: string
  businessName: string
  devEmailHtml?: string
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SignupPage() {
  const [step, setStep] = useState(1)
  const [formState, setFormState] = useState<SignupFormState>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [success, setSuccess] = useState<SuccessState | null>(null)

  // ── Step handlers ──────────────────────────────────────────────────────────

  function handleAccountType(data: AccountTypeValues) {
    setFormState((s) => ({ ...s, accountType: data }))
    setStep(2)
  }

  function handleWorkspace(data: WorkspaceValues) {
    setFormState((s) => ({ ...s, workspace: data }))
    setStep(3)
  }

  function handleBusiness(data: BusinessValues) {
    setFormState((s) => ({ ...s, business: data }))
    setStep(4)
  }

  async function handleOwner(data: OwnerValues) {
    setSubmitError("")
    setIsSubmitting(true)

    try {
      const payload = {
        modes: formState.accountType?.modes ?? [],
        subdomain: formState.workspace?.subdomain ?? "",
        customDomain: formState.workspace?.customDomain ?? "",
        businessName: formState.business?.businessName ?? "",
        industry: formState.business?.industry ?? "",
        businessSize: formState.business?.businessSize ?? "",
        countryCode: formState.business?.countryCode ?? "",
        phone: formState.business?.phone ?? "",
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: data.password,
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
        devEmailHtml: result.devEmailHtml,
      })
      setStep(5)
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
        {step < 5 && <SignupStepper currentStep={step} />}

        {/* Card wrapper */}
        <div
          className="animate-in fade-in slide-in-from-bottom-4 rounded-[2rem] border border-border/70 bg-background/95 p-6 shadow-[0_32px_100px_rgba(39,28,14,0.09)] duration-500 sm:p-8"
          key={step}
        >
          {step === 1 && (
            <StepAccountType
              defaultValues={formState.accountType}
              onNext={handleAccountType}
            />
          )}

          {step === 2 && (
            <StepWorkspace
              defaultValues={formState.workspace}
              onNext={handleWorkspace}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && (
            <StepBusiness
              defaultValues={formState.business}
              onNext={handleBusiness}
              onBack={() => setStep(2)}
            />
          )}

          {step === 4 && (
            <StepOwner
              defaultValues={formState.owner}
              onNext={handleOwner}
              onBack={() => setStep(3)}
              isSubmitting={isSubmitting}
              submitError={submitError}
            />
          )}

          {step === 5 && success && (
            <StepSuccess
              tenantSlug={success.tenantSlug}
              businessName={success.businessName}
              devEmailHtml={success.devEmailHtml}
            />
          )}
        </div>
      </div>
    </div>
  )
}
