"use client"

import {
  type EarlyAccessContextDraft,
  EarlyAccessContextFields,
} from "@/components/early-access-context-fields"
import { EarlyAccessPreview } from "@/components/early-access-preview"
import { QaQuickFillButton } from "@/components/qa/qa-quick-fill-button"
import { useOptionalQaWebAccelerator } from "@/components/qa/qa-web-accelerator"
import type { EarlyAccessQaPreview } from "@/lib/early-access-preview"
import { createLeadDraft } from "@/lib/qa-lead-fill"
import { startTransition, useId, useRef, useState } from "react"

import {
  createMarketingLeadSubmissionFailedNotification,
  createMarketingLeadSubmittedNotification,
} from "@ewatrade/notifications"
import { useNotifications } from "@ewatrade/notifications-react"
import { Button } from "@ewatrade/ui"

type LeadCaptureFormProps = {
  title: string
  description: string
  type: "early-access" | "waitlist"
  submitLabel: string
  appearance?: "card" | "shop"
}

type SubmissionState = "idle" | "submitting" | "success" | "error"

type LeadDraft = EarlyAccessContextDraft & {
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

const baseInputClasses =
  "w-full rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"

export function LeadCaptureForm({
  title,
  description,
  type,
  submitLabel,
  appearance = "card",
}: LeadCaptureFormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const roleInputId = useId()
  const roleHintId = `${roleInputId}-hint`
  const [state, setState] = useState<SubmissionState>("idle")
  const [message, setMessage] = useState("")
  const [qaPreview, setQaPreview] = useState<EarlyAccessQaPreview | null>(null)
  const [draft, setDraft] = useState<LeadDraft>(emptyDraft)
  const [undoDraft, setUndoDraft] = useState<LeadDraft | null>(null)
  const qa = useOptionalQaWebAccelerator()
  const { notify } = useNotifications()

  function setField(field: keyof LeadDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function quickFill() {
    if (!qa?.authorization) return
    if (
      Object.values(draft).some((value) =>
        Array.isArray(value) ? value.length > 0 : Boolean(value),
      ) &&
      !window.confirm("Replace your current draft with QA fixture values?")
    ) {
      return
    }
    setUndoDraft(draft)
    setDraft(
      createLeadDraft({
        domain: qa.authorization.qaDomain,
        testerIdentity: qa.authorization.testerIdentity,
      }),
    )
  }

  async function handleSubmit(formData: FormData) {
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
            phone: String(formData.get("phone") ?? ""),
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
        className="lead-capture lead-capture--early-access space-y-4"
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
      className={`lead-capture lead-capture--${type} ${
        appearance === "shop"
          ? "lead-capture--shop"
          : "rounded-[1.75rem] border border-border/70 bg-background/92 p-6 shadow-sm"
      }`}
    >
      <div className="lead-capture-heading space-y-2">
        <h3 className="text-xl font-semibold text-foreground">{title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>

      <form
        ref={formRef}
        className="lead-capture-fields mt-6 space-y-4"
        action={(formData) => {
          startTransition(() => {
            void handleSubmit(formData)
          })
        }}
      >
        <div className="lead-capture-row grid gap-4 md:grid-cols-2">
          <label className="lead-capture-field space-y-2 text-sm text-foreground">
            <span>Full name</span>
            <input
              required
              name="fullName"
              autoComplete="name"
              maxLength={120}
              onChange={(event) => setField("fullName", event.target.value)}
              placeholder="Enter your name"
              className={baseInputClasses}
              value={draft.fullName}
            />
          </label>

          <label className="lead-capture-field space-y-2 text-sm text-foreground">
            <span>Email</span>
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              maxLength={200}
              onChange={(event) => setField("email", event.target.value)}
              placeholder="Enter your email"
              className={baseInputClasses}
              value={draft.email}
            />
          </label>
        </div>

        {type === "early-access" ? (
          <>
            <div className="lead-capture-row grid gap-4 md:grid-cols-2">
              <label className="lead-capture-field space-y-2 text-sm text-foreground">
                <span>Business name</span>
                <input
                  required
                  name="companyName"
                  autoComplete="organization"
                  maxLength={120}
                  onChange={(event) =>
                    setField("companyName", event.target.value)
                  }
                  placeholder="Enter business name"
                  className={baseInputClasses}
                  value={draft.companyName}
                />
              </label>

              <div className="lead-capture-field space-y-2 text-sm text-foreground">
                <label htmlFor={roleInputId}>Role in the business</label>
                <input
                  aria-describedby={roleHintId}
                  id={roleInputId}
                  name="roleTitle"
                  autoComplete="organization-title"
                  maxLength={120}
                  onChange={(event) =>
                    setField("roleTitle", event.target.value)
                  }
                  placeholder="Enter your role"
                  className={baseInputClasses}
                  value={draft.roleTitle}
                />
                <span
                  id={roleHintId}
                  className="block text-xs text-muted-foreground"
                >
                  For example: owner, manager, or staff member.
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              The contact above will receive the approved setup link and become
              the first workspace owner.
            </p>
            <EarlyAccessContextFields
              draft={draft}
              onChange={(context) =>
                setDraft((current) => ({ ...current, ...context }))
              }
              inputClassName={baseInputClasses}
            />

            <label className="lead-capture-field space-y-2 text-sm text-foreground">
              <span>Phone number</span>
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                maxLength={40}
                onChange={(event) => setField("phone", event.target.value)}
                placeholder="Enter your phone number"
                className={baseInputClasses}
                value={draft.phone}
              />
            </label>

            <label className="lead-capture-field space-y-2 text-sm text-foreground">
              <span>What are you hoping to launch or improve?</span>
              <textarea
                name="message"
                maxLength={1000}
                onChange={(event) => setField("message", event.target.value)}
                rows={4}
                placeholder="Describe what you want to launch or improve"
                className={`${baseInputClasses} resize-y`}
                value={draft.message}
              />
            </label>
          </>
        ) : null}

        <div className="lead-capture-footer flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            className="lead-capture-submit"
            type="submit"
            size="lg"
            disabled={state === "submitting"}
          >
            {state === "submitting" ? "Submitting..." : submitLabel}
            {appearance === "shop" ? <span aria-hidden="true">↗</span> : null}
          </Button>

          <p
            aria-live="polite"
            className={`lead-capture-feedback text-sm ${
              state === "error" ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {message ||
              (type === "early-access"
                ? "Approved businesses receive a private setup link by email."
                : "We will notify you when ewatrade opens wider access.")}
          </p>
        </div>
      </form>
      {qaPreview ? <EarlyAccessPreview preview={qaPreview} /> : null}
      <QaQuickFillButton
        canUndo={Boolean(undoDraft)}
        onFill={quickFill}
        onUndo={() => {
          if (!undoDraft) return
          setDraft(undoDraft)
          setUndoDraft(null)
        }}
        qaDomain={qa?.authorization?.qaDomain}
        visible={qa?.status === "authorized"}
      />
    </div>
  )
}
