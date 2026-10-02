"use client"

import { QaQuickFillButton } from "@/components/qa/qa-quick-fill-button"
import { useQaFormFill } from "@/hooks/use-qa-form-fill"
import { useZodForm } from "@/hooks/use-zod-form"
import { ownerFill } from "@/lib/qa-fill-definitions"
import { type OwnerValues, ownerSchema } from "@/lib/signup-schemas"
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
  Select,
} from "@ewatrade/ui"
import { ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"

const baseInputClasses = "signup-input"

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
  onNext: (data: OwnerValues) => void
  onBack: (draft: OwnerValues) => void
  isSubmitting?: boolean
  submitError?: string
  finalStep?: boolean
  blocked?: boolean
}

export function StepOwner({
  approvedEmail,
  defaultValues,
  onNext,
  onBack,
  isSubmitting,
  submitError,
  finalStep,
  blocked,
}: StepOwnerProps) {
  const form = useZodForm<OwnerValues>(ownerSchema, {
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
      ...defaultValues,
    },
  })

  const { canUndo, fill, isAvailable, qaDomain, undo } = useQaFormFill(
    ownerFill,
    form,
  )
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const password = form.watch("password") ?? ""

  return (
    <div>
      <div className="signup-heading">
        <p className="signup-entry">
          Step 2 of {finalStep ? 2 : 3} · Your account
        </p>
        <h1>
          One account.
          <br />
          Your business, connected.
        </h1>
        <p className="signup-intro">
          You’ll own this workspace. Invite your team once you’re inside.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onNext)}>
        <FieldGroup className="signup-fields">
          {/* Name row */}
          <FieldGroup className="signup-row">
            <Field data-invalid={Boolean(form.formState.errors.firstName)}>
              <FieldLabel htmlFor="signup-firstName">First name</FieldLabel>
              <Input
                id="signup-firstName"
                aria-invalid={Boolean(form.formState.errors.firstName)}
                {...form.register("firstName")}
                type="text"
                placeholder="Ada"
                autoComplete="given-name"
                className={`${baseInputClasses} mt-1.5`}
              />
              {form.formState.errors.firstName && (
                <FieldError>
                  {form.formState.errors.firstName.message}
                </FieldError>
              )}
            </Field>

            <Field data-invalid={Boolean(form.formState.errors.lastName)}>
              <FieldLabel htmlFor="signup-lastName">Last name</FieldLabel>
              <Input
                id="signup-lastName"
                aria-invalid={Boolean(form.formState.errors.lastName)}
                {...form.register("lastName")}
                type="text"
                placeholder="Nwosu"
                autoComplete="family-name"
                className={`${baseInputClasses} mt-1.5`}
              />
              {form.formState.errors.lastName && (
                <FieldError>
                  {form.formState.errors.lastName.message}
                </FieldError>
              )}
            </Field>
          </FieldGroup>

          {/* Email */}
          <Field data-invalid={Boolean(form.formState.errors.email)}>
            <FieldLabel htmlFor="signup-email">Email address</FieldLabel>
            <Input
              id="signup-email"
              aria-invalid={Boolean(form.formState.errors.email)}
              {...form.register("email")}
              readOnly={Boolean(approvedEmail)}
              type="email"
              placeholder="ada@merchant.com"
              autoComplete="email"
              className={`${baseInputClasses} mt-1.5`}
            />
            {form.formState.errors.email && (
              <FieldError>{form.formState.errors.email.message}</FieldError>
            )}
          </Field>

          {/* Password */}
          <Field data-invalid={Boolean(form.formState.errors.password)}>
            <FieldLabel htmlFor="signup-password">Password</FieldLabel>
            <InputGroup className="signup-password-input">
              <InputGroupInput
                id="signup-password"
                aria-invalid={Boolean(form.formState.errors.password)}
                {...form.register("password")}
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                className={baseInputClasses}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-sm"
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="signup-password-toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <HugeiconsIcon
                    icon={showPassword ? ViewOffSlashIcon : ViewIcon}
                    strokeWidth={2}
                    data-icon="inline-end"
                  />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {form.formState.errors.password ? (
              <FieldError>{form.formState.errors.password.message}</FieldError>
            ) : (
              <PasswordStrength password={password} />
            )}
          </Field>

          {/* Confirm password */}
          <Field data-invalid={Boolean(form.formState.errors.confirmPassword)}>
            <FieldLabel htmlFor="signup-confirmPassword">
              Confirm password
            </FieldLabel>
            <InputGroup className="signup-password-input">
              <InputGroupInput
                id="signup-confirmPassword"
                aria-invalid={Boolean(form.formState.errors.confirmPassword)}
                {...form.register("confirmPassword")}
                type={showConfirm ? "text" : "password"}
                placeholder="Repeat your password"
                autoComplete="new-password"
                className={baseInputClasses}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-sm"
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="signup-password-toggle"
                  aria-label={
                    showConfirm
                      ? "Hide confirm password"
                      : "Show confirm password"
                  }
                >
                  <HugeiconsIcon
                    icon={showConfirm ? ViewOffSlashIcon : ViewIcon}
                    strokeWidth={2}
                    data-icon="inline-end"
                  />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {form.formState.errors.confirmPassword && (
              <FieldError>
                {form.formState.errors.confirmPassword.message}
              </FieldError>
            )}
          </Field>

          {submitError && (
            <div className="border-l-2 border-destructive bg-destructive/5 px-4 py-3">
              <p className="text-sm text-destructive">{submitError}</p>
            </div>
          )}

          <div className="signup-actions">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="signup-secondary"
              onClick={() => onBack(form.getValues())}
              disabled={isSubmitting}
            >
              Back
            </Button>
            <Button
              type="submit"
              size="lg"
              className="signup-primary"
              disabled={isSubmitting || blocked}
            >
              {isSubmitting
                ? "Creating workspace…"
                : finalStep
                  ? "Create workspace"
                  : "Continue"}
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
