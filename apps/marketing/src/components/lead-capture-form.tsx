"use client"

import {
  type EarlyAccessContextDraft,
  EarlyAccessContextFields,
} from "@/components/early-access-context-fields"
import { EarlyAccessPreview } from "@/components/early-access-preview"
import { useLeadQuickFillRegistration } from "@/components/qa/lead-capture-quick-fill"
import { QaQuickFillButton } from "@/components/qa/qa-quick-fill-button"
import { useOptionalQaWebAccelerator } from "@/components/qa/qa-web-accelerator"
import type { EarlyAccessQaPreview } from "@/lib/early-access-preview"
import { createLeadCaptureAnalytics } from "@/lib/lead-capture-analytics"
import { createLeadDraft } from "@/lib/qa-lead-fill"
import { useEvents } from "@ewatrade/events/client"
import {
  startTransition,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"

import {
  getCountryCallingCode,
  getNationalSignupPhone,
  getSignupPhoneForCountry,
  resolveSignupPhone,
} from "@/lib/signup-phone"
import { COUNTRIES } from "@/lib/signup-schemas"
import {
  createMarketingLeadSubmissionFailedNotification,
  createMarketingLeadSubmittedNotification,
} from "@ewatrade/notifications"
import { useNotifications } from "@ewatrade/notifications-react"
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
} from "@ewatrade/ui"

type LeadCaptureFormProps = {
  title: string
  description: string
  type: "early-access" | "waitlist"
  submitLabel: string
  appearance?: "card" | "shop"
}

type SubmissionState = "idle" | "submitting" | "success" | "error"

type LeadDraft = EarlyAccessContextDraft & {
  countryCode: string
  companyName: string
  email: string
  fullName: string
  message: string
  phone: string
  roleTitle: string
}

const emptyDraft: LeadDraft = {
  businessSize: "",
  recordSystem: "",
  launchTimeline: "",
  setupNeeds: [],
  countryCode: "NG",
  companyName: "",
  email: "",
  fullName: "",
  message: "",
  phone: "",
  roleTitle: "",
}

const endpointByType = {
  "early-access": "/api/early-access",
  waitlist: "/api/waitlist",
} as const

export function LeadCaptureForm({
  title,
  description,
  type,
  submitLabel,
  appearance = "card",
}: LeadCaptureFormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const fieldId = useId()
  const roleInputId = `${fieldId}-role`
  const [phoneInvalid, setPhoneInvalid] = useState(false)
  const roleHintId = `${roleInputId}-hint`
  const [state, setState] = useState<SubmissionState>("idle")
  const [message, setMessage] = useState("")
  const [qaPreview, setQaPreview] = useState<EarlyAccessQaPreview | null>(null)
  const [draft, setDraft] = useState<LeadDraft>(emptyDraft)
  const [undoDraft, setUndoDraft] = useState<LeadDraft | null>(null)
  const qa = useOptionalQaWebAccelerator()
  const registerQuickFill = useLeadQuickFillRegistration()
  const { notify } = useNotifications()
  const { track } = useEvents()
  const analytics = useMemo(() => createLeadCaptureAnalytics(type), [type])

  function setField(field: keyof LeadDraft, value: string) {
    setPhoneInvalid(false)
    setDraft((current) => ({ ...current, [field]: value }))
  }

  const quickFill = useCallback(() => {
    if (!qa?.authorization) return
    setUndoDraft(draft)
    setPhoneInvalid(false)
    setDraft({
      countryCode: "NG",
      ...createLeadDraft({
        domain: qa.authorization.qaDomain,
        testerIdentity: qa.authorization.testerIdentity,
      }),
    })
  }, [draft, qa?.authorization])

  const undoQuickFill = useCallback(() => {
    if (!undoDraft) return
    setDraft(undoDraft)
    setPhoneInvalid(false)
    setUndoDraft(null)
  }, [undoDraft])

  useEffect(() => {
    if (!registerQuickFill || qa?.status !== "authorized" || !qa.authorization)
      return
    return registerQuickFill({
      id: type,
      label: type === "early-access" ? "Early access" : "Waitlist",
      onFill: quickFill,
      onUndo: undoQuickFill,
      canUndo: Boolean(undoDraft),
      disabled:
        state === "submitting" ||
        (type === "early-access" && state === "success"),
      qaDomain: qa.authorization.qaDomain,
    })
  }, [
    registerQuickFill,
    qa?.status,
    qa?.authorization,
    type,
    quickFill,
    undoQuickFill,
    undoDraft,
    state,
  ])

  async function handleSubmit(formData: FormData) {
    analytics.start(track)
    const phone = draft.phone.trim()
      ? resolveSignupPhone(draft.phone, draft.countryCode)
      : ""
    if (type === "early-access" && phone === null) {
      analytics.failed(track, "validation_error")
      setPhoneInvalid(true)
      return
    }
    setState("submitting")
    setMessage("")
    setQaPreview(null)

    const payload =
      type === "early-access"
        ? {
            fullName: String(formData.get("fullName") ?? ""),
            email: String(formData.get("email") ?? ""),
            companyName: String(formData.get("companyName") ?? ""),
            roleTitle: String(formData.get("roleTitle") ?? ""),
            phone: phone ?? "",
            message: String(formData.get("message") ?? ""),
            businessSize: String(formData.get("businessSize") ?? ""),
            recordSystem: String(formData.get("recordSystem") ?? ""),
            launchTimeline: String(formData.get("launchTimeline") ?? ""),
            setupNeeds: formData.getAll("setupNeeds").map(String),
          }
        : {
            fullName: String(formData.get("fullName") ?? ""),
            email: String(formData.get("email") ?? ""),
          }

    try {
      const response = await fetch(endpointByType[type], {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      const result = (await response.json()) as {
        message?: string
        qaPreview?: EarlyAccessQaPreview
      }

      if (!response.ok) {
        analytics.failed(track, "http_error")
        setState("error")
        const nextMessage =
          result.message ?? "We could not save your request. Please try again."

        setMessage(nextMessage)
        notify({
          ...createMarketingLeadSubmissionFailedNotification({
            type: type === "early-access" ? "EARLY_ACCESS" : "WAITLIST",
          }),
          description: nextMessage,
        })
        return
      }

      const nextMessage =
        result.message ??
        (type === "early-access"
          ? "Your early access request has been received."
          : "You have been added to the waitlist.")

      analytics.submitted(track)
      setState("success")
      setQaPreview(result.qaPreview ?? null)
      setMessage(nextMessage)
      formRef.current?.reset()
      setDraft(emptyDraft)
      notify({
        ...createMarketingLeadSubmittedNotification({
          type: type === "early-access" ? "EARLY_ACCESS" : "WAITLIST",
        }),
        description: nextMessage,
      })
    } catch {
      analytics.failed(track, "request_error")
      setState("error")
      const nextMessage = "Something went wrong while sending your request."

      setMessage(nextMessage)
      notify({
        ...createMarketingLeadSubmissionFailedNotification({
          type: type === "early-access" ? "EARLY_ACCESS" : "WAITLIST",
        }),
        description: nextMessage,
      })
    }
  }

  if (type === "early-access" && state === "success")
    return (
      <section
        className="lead-capture lead-capture--early-access flex flex-col gap-4"
        aria-label="Early access request received"
      >
        <h3 className="text-xl font-semibold">Request received</h3>
        <p className="text-sm font-medium">Approval required</p>
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {message}
        </p>
        {qaPreview ? <EarlyAccessPreview preview={qaPreview} /> : null}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setState("idle")
            setMessage("")
            setQaPreview(null)
          }}
        >
          Submit another request
        </Button>
      </section>
    )

  return (
    <div
      className={cn(
        "lead-capture",
        `lead-capture--${type}`,
        appearance === "shop"
          ? "lead-capture--shop"
          : "rounded-lg border border-border/70 bg-background/92 p-6 shadow-sm",
      )}
    >
      <div className="lead-capture-heading flex flex-col gap-2">
        <h3 className="text-xl font-semibold text-foreground">{title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>

      <form
        ref={formRef}
        className="mt-6"
        onChangeCapture={() => analytics.start(track)}
        action={(formData) => {
          startTransition(() => {
            void handleSubmit(formData)
          })
        }}
      >
        <FieldGroup className="lead-capture-fields">
          <FieldGroup className="lead-capture-row grid md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${fieldId}-fullName`}>Full name</FieldLabel>
              <Input
                required
                id={`${fieldId}-fullName`}
                name="fullName"
                autoComplete="name"
                maxLength={120}
                onChange={(event) => setField("fullName", event.target.value)}
                placeholder="Enter your name"
                value={draft.fullName}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor={`${fieldId}-email`}>Email</FieldLabel>
              <Input
                required
                type="email"
                id={`${fieldId}-email`}
                name="email"
                autoComplete="email"
                maxLength={200}
                onChange={(event) => setField("email", event.target.value)}
                placeholder="Enter your email"
                value={draft.email}
              />
            </Field>
          </FieldGroup>

          {type === "early-access" ? (
            <>
              <FieldGroup className="lead-capture-row grid md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${fieldId}-companyName`}>
                    Business name
                  </FieldLabel>
                  <Input
                    required
                    id={`${fieldId}-companyName`}
                    name="companyName"
                    autoComplete="organization"
                    maxLength={120}
                    onChange={(event) =>
                      setField("companyName", event.target.value)
                    }
                    placeholder="Enter business name"
                    value={draft.companyName}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor={roleInputId}>
                    Role in the business
                  </FieldLabel>
                  <Input
                    aria-describedby={roleHintId}
                    id={roleInputId}
                    name="roleTitle"
                    autoComplete="organization-title"
                    maxLength={120}
                    onChange={(event) =>
                      setField("roleTitle", event.target.value)
                    }
                    placeholder="Enter your role"
                    value={draft.roleTitle}
                  />
                  <FieldDescription id={roleHintId}>
                    For example: owner, manager, or staff member.
                  </FieldDescription>
                </Field>
              </FieldGroup>

              <p className="text-xs text-muted-foreground">
                The contact above will receive the approved setup link and
                become the first workspace owner.
              </p>
              <EarlyAccessContextFields
                draft={draft}
                onChange={(context) => {
                  analytics.start(track)
                  setDraft((current) => ({ ...current, ...context }))
                }}
              />

              <FieldGroup className="lead-capture-row grid md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${fieldId}-country`}>
                    Country
                  </FieldLabel>
                  <SelectRoot
                    name="phoneCountry"
                    items={COUNTRIES}
                    value={draft.countryCode}
                    onValueChange={(country) => {
                      if (!country) return
                      analytics.start(track)
                      setPhoneInvalid(false)
                      setDraft((current) => ({
                        ...current,
                        countryCode: country,
                        phone: getSignupPhoneForCountry(
                          current.phone,
                          current.countryCode,
                          country,
                        ),
                      }))
                    }}
                  >
                    <SelectTrigger id={`${fieldId}-country`} appearance="form">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {COUNTRIES.map((country) => (
                          <SelectItem key={country.value} value={country.value}>
                            {country.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </SelectRoot>
                </Field>
                <Field data-invalid={phoneInvalid}>
                  <FieldLabel htmlFor={`${fieldId}-phone`}>
                    Phone number
                  </FieldLabel>
                  <InputGroup appearance="form">
                    <InputGroupInput
                      id={`${fieldId}-phone`}
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete={
                        draft.countryCode === "OTHER" ? "tel" : "tel-national"
                      }
                      maxLength={40}
                      onChange={(event) =>
                        setField("phone", event.target.value)
                      }
                      placeholder={
                        draft.countryCode === "OTHER"
                          ? "Country code and number"
                          : "Enter your phone number"
                      }
                      value={getNationalSignupPhone(
                        draft.phone,
                        draft.countryCode,
                      )}
                      aria-invalid={phoneInvalid}
                      aria-describedby={`${fieldId}-phone-hint`}
                    />
                    <InputGroupAddon align="inline-start">
                      <InputGroupText aria-label="Country calling code">
                        {getCountryCallingCode(draft.countryCode) || "+"}
                      </InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription id={`${fieldId}-phone-hint`}>
                    {draft.countryCode === "OTHER"
                      ? "Include your country calling code."
                      : "Your country calling code is included automatically."}
                  </FieldDescription>
                  {phoneInvalid && (
                    <FieldError>
                      Enter a valid phone number for the selected country.
                    </FieldError>
                  )}
                </Field>
              </FieldGroup>

              <Field>
                <FieldLabel htmlFor={`${fieldId}-message`}>
                  What are you hoping to launch or improve?
                </FieldLabel>
                <Textarea
                  id={`${fieldId}-message`}
                  name="message"
                  maxLength={1000}
                  onChange={(event) => setField("message", event.target.value)}
                  rows={4}
                  placeholder="Describe what you want to launch or improve"
                  className="resize-y"
                  value={draft.message}
                />
              </Field>
            </>
          ) : null}

          <div className="lead-capture-footer flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              className="lead-capture-submit"
              type="submit"
              disabled={state === "submitting"}
            >
              {state === "submitting" ? "Submitting..." : submitLabel}
              {appearance === "shop" ? <span aria-hidden="true">↗</span> : null}
            </Button>

            <p
              aria-live="polite"
              className={cn(
                "lead-capture-feedback text-sm",
                state === "error"
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {message ||
                (type === "early-access"
                  ? "Approved businesses receive a private setup link by email."
                  : "We will notify you when ewatrade opens wider access.")}
            </p>
          </div>
        </FieldGroup>
      </form>
      {qaPreview ? <EarlyAccessPreview preview={qaPreview} /> : null}
      <QaQuickFillButton
        canUndo={Boolean(undoDraft)}
        onFill={quickFill}
        onUndo={undoQuickFill}
        qaDomain={qa?.authorization?.qaDomain}
        visible={!registerQuickFill && qa?.status === "authorized"}
      />
    </div>
  )
}
