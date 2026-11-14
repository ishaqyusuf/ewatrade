"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"
import {
  Button,
  Checkbox,
  CheckboxField,
  ControlField,
  Field,
  FieldGroup,
  FieldLabel,
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
  const workflow = useDashboardWorkflow()
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
      const result = await workflow.fetch(
        operation === "complete" ? "staff_onboarding" : "staff_onboarding_code",
        "/api/staff-onboarding",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation,
            inviteToken,
            ...(operation === "complete"
              ? {
                  ...(!qaInvitation ? { code } : {}),
                  name,
                  ...(invite.needsPassword
                    ? { password, confirmPassword }
                    : {}),
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
        },
      )
      const body = await result.json()
      if (!result.ok) {
        setError(body.error ?? "Could not join. Try again.")
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
  const role = invite.role.charAt(0) + invite.role.slice(1).toLowerCase()
  return (
    <AuthShell
      title={<>Join {invite.businessName}</>}
      description={
        <p className="break-words">
          {invite.email} · {role}
        </p>
      }
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
        {/* Lets password managers save the new password against this email. */}
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={invite.email}
          readOnly
          hidden
        />
        <FieldGroup className="gap-5">
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
            <ControlField label={<>Your age</>}>
              <SelectControl
                id="staff-age"
                required
                value={ageBand}
                onValueChange={(value) => setAgeBand(value)}
                options={[
                  { value: "", label: <>Choose</> },
                  { value: "AGE_13_TO_15", label: <>13–15</> },
                  { value: "AGE_16_TO_17", label: <>16–17</> },
                  { value: "ADULT", label: <>18 or older</> },
                ]}
              />
            </ControlField>
          ) : null}
          {sent && !qaInvitation ? (
            <ControlField label={<>Code from your email</>}>
              <Input
                id="staff-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, ""))
                }
                className="tabular-nums tracking-[0.3em]"
                required
              />
            </ControlField>
          ) : null}
          {sent && invite.needsPassword ? (
            <>
              <Field>
                <FieldLabel htmlFor="staff-password">Password</FieldLabel>
                <Input
                  id="staff-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  placeholder="At least 8 characters"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="staff-confirm-password">
                  Type it again
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
                    className="font-medium text-[var(--link)] underline-offset-4 hover:underline"
                    href={`${marketingUrl}/terms`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Terms
                  </a>{" "}
                  and{" "}
                  <a
                    className="font-medium text-[var(--link)] underline-offset-4 hover:underline"
                    href={`${marketingUrl}/privacy`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Privacy Notice
                  </a>
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
          ) : sent && !qaInvitation ? (
            <FormFeedback appearance="dashboard" variant="default">
              Code sent to {invite.email}.
            </FormFeedback>
          ) : null}
          <SubmitButton
            isSubmitting={pending}
            type="submit"
            className="w-full"
            disabled={pending || (sent && Boolean(legalVersion) && !agreed)}
          >
            {pending
              ? "Please wait…"
              : sent
                ? `Join ${invite.businessName}`
                : "Email me a code"}
          </SubmitButton>
          {sent && !qaInvitation ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={pending}
              onClick={() => void submit("request-code")}
            >
              Send a new code
            </Button>
          ) : null}
        </FieldGroup>
      </form>
    </AuthShell>
  )
}
