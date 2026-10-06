"use client"
import {
  Button,
  Checkbox,
  CheckboxField,
  ControlField,
  Field,
  FieldGroup,
  FieldLabel,
  FormActions,
  Input,
  SelectControl,
  SubmitButton,
} from "@ewatrade/ui"

import { FormFeedback } from "@/components/forms/form-feedback"

import { useState } from "react"
import { AuthShell } from "./auth-shell"

type Props = {
  inviteToken: string
  qaInvitation: boolean
  invite: {
    businessName: string
    email: string
    role: string
    name: string
    needsAge: boolean
    needsPassword: boolean
  }
  legalVersion: string | null
  marketingUrl: string
}
export function StaffOnboardingForm({
  inviteToken,
  qaInvitation,
  invite,
  legalVersion,
  marketingUrl,
}: Props) {
  const [sent, setSent] = useState(qaInvitation)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [code, setCode] = useState("")
  const [name, setName] = useState(invite.name)
  const [ageBand, setAgeBand] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(operation: "request-code" | "complete") {
    setPending(true)
    setError(null)
    try {
      const result = await fetch("/api/staff-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation,
          inviteToken,
          ...(operation === "complete"
            ? {
                ...(!qaInvitation ? { code } : {}),
                name,
                ...(invite.needsPassword ? { password, confirmPassword } : {}),
                ...(ageBand ? { ageBand } : {}),
                ...(legalVersion && agreed
                  ? {
                      legalVersion,
                      acceptedTerms: true,
                      acknowledgedPrivacyNotice: true,
                    }
                  : {}),
              }
            : {}),
        }),
      })
      const body = await result.json()
      if (!result.ok) {
        setError(body.error ?? "Staff setup could not be completed.")
        return
      }
      if (operation === "request-code") setSent(true)
      else window.location.assign("/")
    } catch {
      setError("Connection failed. Try again.")
    } finally {
      setPending(false)
    }
  }
  return (
    <AuthShell
      title={<>Join {invite.businessName}</>}
      description={
        <>
          <p>
            You’re invited as{" "}
            <span className="capitalize">{invite.role.toLowerCase()}</span>.
          </p>
          <p className="mt-2 break-all">{invite.email}</p>
        </>
      }
      asideTitle="Work together."
      asideDescription="Complete your staff setup to join your business workspace."
      brandHref={marketingUrl}
    >
      <form
        id="staff-onboarding"
        autoComplete="on"
        className="min-w-0"
        onSubmit={(event) => {
          event.preventDefault()
          void submit(sent ? "complete" : "request-code")
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="staff-email">Email address</FieldLabel>
            <Input
              id="staff-email"
              name="username"
              type="email"
              autoComplete="username"
              value={invite.email}
              readOnly
            />
            <p className="text-xs text-muted-foreground">
              This invitation is for this email address.
            </p>
          </Field>
          {qaInvitation ? (
            <p className="text-sm text-muted-foreground">
              QA invitation verified. Complete setup here without checking
              email.
            </p>
          ) : null}
          <ControlField label={<>Your name</>}>
            <Input
              id="staff-name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </ControlField>
          {invite.needsAge ? (
            <ControlField label={<>Age range</>}>
              <SelectControl
                id="staff-age"
                required
                value={ageBand}
                onValueChange={(value) => setAgeBand(value)}
                options={[
                  { value: "", label: <>Choose your age range</> },
                  { value: "AGE_13_TO_15", label: <>13–15</> },
                  { value: "AGE_16_TO_17", label: <>16–17</> },
                  { value: "ADULT", label: <>18 or older</> },
                ]}
              />
            </ControlField>
          ) : null}
          {sent && !qaInvitation ? (
            <>
              <FormFeedback appearance="dashboard" variant="default">
                A verification code was sent to {invite.email}.
              </FormFeedback>
              <ControlField label={<>Verification code</>}>
                <Input
                  id="staff-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                />
              </ControlField>
            </>
          ) : null}
          {sent && invite.needsPassword ? (
            <>
              <Field>
                <FieldLabel htmlFor="staff-password">
                  Create password
                </FieldLabel>
                <Input
                  id="staff-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use at least 8 characters. You’ll use this password to sign
                  in.
                </p>
              </Field>
              <Field>
                <FieldLabel htmlFor="staff-confirm-password">
                  Confirm password
                </FieldLabel>
                <Input
                  id="staff-confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </Field>
            </>
          ) : null}
          {legalVersion && sent ? (
            <CheckboxField
              label={
                <span>
                  I agree to the{" "}
                  <a
                    className="underline"
                    href={`${marketingUrl}/terms`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Terms
                  </a>{" "}
                  and acknowledge the{" "}
                  <a
                    className="underline"
                    href={`${marketingUrl}/privacy`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Privacy Notice
                  </a>
                  .
                </span>
              }
            >
              <Checkbox
                checked={agreed}
                onCheckedChange={(checked) => setAgreed(checked)}
              />
            </CheckboxField>
          ) : null}
          {error ? (
            <FormFeedback appearance="dashboard">{error}</FormFeedback>
          ) : null}
          <FormActions>
            <SubmitButton
              isSubmitting={pending}
              type="submit"
              disabled={pending || (sent && Boolean(legalVersion) && !agreed)}
            >
              {pending
                ? "Please wait…"
                : sent
                  ? "Complete staff setup"
                  : "Send verification code"}
            </SubmitButton>
          </FormActions>
          {sent && !qaInvitation ? (
            <Button
              appearance="form"
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => void submit("request-code")}
            >
              Resend code
            </Button>
          ) : null}
        </FieldGroup>
      </form>
    </AuthShell>
  )
}
