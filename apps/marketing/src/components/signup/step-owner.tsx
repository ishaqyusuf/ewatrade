"use client"

import { QaQuickFillButton } from "@/components/qa/qa-quick-fill-button"
import { useQaFormFill } from "@/hooks/use-qa-form-fill"
import { useZodForm } from "@/hooks/use-zod-form"
import type {
  PublicLegalPublication,
  SignupLegalAcceptance,
} from "@/lib/legal-publication"
import { ownerFill } from "@/lib/qa-fill-definitions"
import { type OwnerValues, ownerSchema } from "@/lib/signup-schemas"
import { Button } from "@ewatrade/ui"
import { ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"

const baseInputClasses =
  "w-full scroll-mt-24 rounded-lg border border-border/70 bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"

function PasswordStrength({ password }: { password: string }) {
  const len = password.length
  const hasUpper = /[A-Z]/.test(password)
  const hasLower = /[a-z]/.test(password)
  const hasNum = /[0-9]/.test(password)
  const hasSpecial = /[^A-Za-z0-9]/.test(password)

  let strength = 0
  if (len >= 8) strength++
  if (len >= 12) strength++
  if (hasUpper && hasLower) strength++
  if (hasNum) strength++
  if (hasSpecial) strength++

  if (!password) return null

  const labels = ["", "Weak", "Fair", "Good", "Strong", "Excellent"]
  const colors = [
    "",
    "bg-destructive",
    "bg-amber-400",
    "bg-amber-500",
    "bg-emerald-500",
    "bg-emerald-600",
  ]
  const textColors = [
    "",
    "text-destructive",
    "text-amber-600",
    "text-amber-700",
    "text-emerald-600",
    "text-emerald-700",
  ]

  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((level) => (
          <div
            key={level}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              level <= strength ? colors[strength] : "bg-muted"
            }`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${textColors[strength]}`}>
        {labels[strength]}
      </p>
    </div>
  )
}

type StepOwnerProps = {
  approvedEmail?: string
  defaultValues?: Partial<OwnerValues>
  onNext: (data: OwnerValues, legalAcceptance?: SignupLegalAcceptance) => void
  onBack: () => void
  isSubmitting?: boolean
  submitError?: string
  legalPublication: PublicLegalPublication | null
  legalPublicationError: string | null
}

export function StepOwner({
  approvedEmail,
  defaultValues,
  onNext,
  onBack,
  isSubmitting,
  submitError,
  legalPublication,
  legalPublicationError,
}: StepOwnerProps) {
  const form = useZodForm<OwnerValues>(ownerSchema, {
    defaultValues: defaultValues ?? {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  })

  const { canUndo, fill, isAvailable, qaDomain, undo } = useQaFormFill(
    ownerFill,
    form,
  )
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [acknowledgedPrivacyNotice, setAcknowledgedPrivacyNotice] =
    useState(false)
  const [legalError, setLegalError] = useState<string | null>(null)
  const password = form.watch("password") ?? ""

  const submitOwner = (data: OwnerValues) => {
    if (!legalPublication) {
      setLegalError(
        "The current legal documents could not be checked. Reload and try again.",
      )
      return
    }
    if (!legalPublication.signupAvailable) {
      setLegalError(
        "Account creation is paused until the Terms and Privacy Notice are effective.",
      )
      return
    }
    if (!legalPublication.approved) {
      setLegalError(null)
      onNext(data)
      return
    }
    if (
      !legalPublication.version ||
      !acceptedTerms ||
      !acknowledgedPrivacyNotice
    ) {
      setLegalError(
        "Agree to the Terms and acknowledge the Privacy Notice before creating an account.",
      )
      return
    }
    setLegalError(null)
    onNext(data, {
      legalVersion: legalPublication.version,
      acceptedTerms: true,
      acknowledgedPrivacyNotice: true,
    })
  }

  return (
    <div>
      <div className="mb-8 text-center">
        <h2
          className="text-2xl font-semibold text-foreground sm:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Create your account
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          You will be the owner of this workspace. You can invite your team
          after signup.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(submitOwner)} className="space-y-4">
        {/* Name row */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            First name
            <input
              {...form.register("firstName")}
              type="text"
              placeholder="Ada"
              autoComplete="given-name"
              className={`${baseInputClasses} mt-1.5`}
            />
            {form.formState.errors.firstName && (
              <p className="text-xs text-destructive">
                {form.formState.errors.firstName.message}
              </p>
            )}
          </label>

          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Last name
            <input
              {...form.register("lastName")}
              type="text"
              placeholder="Nwosu"
              autoComplete="family-name"
              className={`${baseInputClasses} mt-1.5`}
            />
            {form.formState.errors.lastName && (
              <p className="text-xs text-destructive">
                {form.formState.errors.lastName.message}
              </p>
            )}
          </label>
        </div>

        {/* Email */}
        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          Email address
          <input
            {...form.register("email")}
            readOnly={Boolean(approvedEmail)}
            type="email"
            placeholder="ada@merchant.com"
            autoComplete="email"
            className={`${baseInputClasses} mt-1.5`}
          />
          {form.formState.errors.email && (
            <p className="text-xs text-destructive">
              {form.formState.errors.email.message}
            </p>
          )}
        </label>

        {/* Password */}
        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          Password
          <div className="relative mt-1.5">
            <input
              {...form.register("password")}
              type={showPassword ? "text" : "password"}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              className={`${baseInputClasses} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              tabIndex={-1}
            >
              <HugeiconsIcon
                icon={showPassword ? ViewOffSlashIcon : ViewIcon}
                strokeWidth={2}
                className="size-4"
              />
            </button>
          </div>
          {form.formState.errors.password ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.password.message}
            </p>
          ) : (
            <PasswordStrength password={password} />
          )}
        </label>

        {/* Confirm password */}
        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          Confirm password
          <div className="relative mt-1.5">
            <input
              {...form.register("confirmPassword")}
              type={showConfirm ? "text" : "password"}
              placeholder="Repeat your password"
              autoComplete="new-password"
              className={`${baseInputClasses} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              tabIndex={-1}
            >
              <HugeiconsIcon
                icon={showConfirm ? ViewOffSlashIcon : ViewIcon}
                strokeWidth={2}
                className="size-4"
              />
            </button>
          </div>
          {form.formState.errors.confirmPassword && (
            <p className="text-xs text-destructive">
              {form.formState.errors.confirmPassword.message}
            </p>
          )}
        </label>

        {submitError && (
          <div className="border-l-2 border-destructive bg-destructive/5 px-4 py-3">
            <p className="text-sm text-destructive">{submitError}</p>
          </div>
        )}

        {!legalPublication ? (
          <p className="text-center text-xs text-muted-foreground">
            Checking the current legal documents…
          </p>
        ) : legalPublication.approved ? (
          <div className="space-y-3 text-sm text-foreground">
            <p>
              Review the current Terms and Privacy Notice (version{" "}
              {legalPublication.version}).
            </p>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
                className="mt-1"
              />
              <span>
                I agree to the{" "}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Terms of Service
                </a>
                .
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={acknowledgedPrivacyNotice}
                onChange={(event) =>
                  setAcknowledgedPrivacyNotice(event.target.checked)
                }
                className="mt-1"
              />
              <span>
                I acknowledge the{" "}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Privacy Notice
                </a>
                . This is not consent to optional marketing.
              </span>
            </label>
          </div>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            Read our{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Privacy Notice
            </a>
            . These policies are not yet effective; this notice does not record
            legal acceptance.
            {!legalPublication.signupAvailable
              ? " Account creation is paused until they take effect."
              : ""}
          </p>
        )}
        {legalPublicationError || legalError ? (
          <p role="alert" className="text-sm text-destructive">
            {legalPublicationError ?? legalError}
          </p>
        ) : null}

        <div className="flex items-center justify-between border-t border-border/60 pt-5">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="rounded-lg"
            onClick={onBack}
            disabled={isSubmitting}
          >
            Back
          </Button>
          <Button
            type="submit"
            size="lg"
            className="rounded-lg px-8"
            disabled={
              isSubmitting ||
              !legalPublication ||
              !legalPublication.signupAvailable ||
              !!legalPublicationError
            }
          >
            {isSubmitting ? "Creating workspace…" : "Create workspace"}
          </Button>
        </div>
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
