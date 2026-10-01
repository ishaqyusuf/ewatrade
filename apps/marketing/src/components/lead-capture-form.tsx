"use client"

import { EarlyAccessPreview } from "@/components/dev/early-access-preview"
import { QaQuickFillButton } from "@/components/qa/qa-quick-fill-button"
import { useOptionalQaWebAccelerator } from "@/components/qa/qa-web-accelerator"
import type { EarlyAccessDevPreview } from "@/lib/early-access-preview"
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
}

type SubmissionState = "idle" | "submitting" | "success" | "error"

type LeadDraft = {
  companyName: string
  email: string
  fullName: string
  message: string
  phone: string
  roleTitle: string
}

const emptyDraft: LeadDraft = {
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
}: LeadCaptureFormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const roleInputId = useId()
  const roleHintId = `${roleInputId}-hint`
  const [state, setState] = useState<SubmissionState>("idle")
  const [message, setMessage] = useState("")
  const [devPreview, setDevPreview] = useState<EarlyAccessDevPreview | null>(
    null,
  )
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
      Object.values(draft).some(Boolean) &&
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
    setDevPreview(null)

    const payload =
      type === "early-access"
        ? {
            fullName: String(formData.get("fullName") ?? ""),
            email: String(formData.get("email") ?? ""),
            companyName: String(formData.get("companyName") ?? ""),
            roleTitle: String(formData.get("roleTitle") ?? ""),
            phone: String(formData.get("phone") ?? ""),
            message: String(formData.get("message") ?? ""),
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
        devPreview?: EarlyAccessDevPreview
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
      setDevPreview(result.devPreview ?? null)
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

  return (
    <div className="rounded-[1.75rem] border border-border/70 bg-background/92 p-6 shadow-sm">
      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-foreground">{title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>

      <form
        ref={formRef}
        className="mt-6 space-y-4"
        action={(formData) => {
          startTransition(() => {
            void handleSubmit(formData)
          })
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-foreground">
            <span>Full name</span>
            <input
              required
              name="fullName"
              onChange={(event) => setField("fullName", event.target.value)}
              placeholder="Enter your name"
              className={baseInputClasses}
              value={draft.fullName}
            />
          </label>

          <label className="space-y-2 text-sm text-foreground">
            <span>Email</span>
            <input
              required
              type="email"
              name="email"
              onChange={(event) => setField("email", event.target.value)}
              placeholder="Enter your email"
              className={baseInputClasses}
              value={draft.email}
            />
          </label>
        </div>

        {type === "early-access" ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-foreground">
                <span>Business name</span>
                <input
                  name="companyName"
                  onChange={(event) =>
                    setField("companyName", event.target.value)
                  }
                  placeholder="Enter business name"
                  className={baseInputClasses}
                  value={draft.companyName}
                />
              </label>

              <div className="space-y-2 text-sm text-foreground">
                <label htmlFor={roleInputId}>Role in the business</label>
                <input
                  aria-describedby={roleHintId}
                  id={roleInputId}
                  name="roleTitle"
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

            <label className="space-y-2 text-sm text-foreground">
              <span>Phone number</span>
              <input
                name="phone"
                onChange={(event) => setField("phone", event.target.value)}
                placeholder="Enter your phone number"
                className={baseInputClasses}
                value={draft.phone}
              />
            </label>

            <label className="space-y-2 text-sm text-foreground">
              <span>What are you hoping to launch or improve?</span>
              <textarea
                name="message"
                onChange={(event) => setField("message", event.target.value)}
                rows={4}
                placeholder="Describe what you want to launch or improve"
                className={`${baseInputClasses} resize-y`}
                value={draft.message}
              />
            </label>
          </>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button type="submit" size="lg" disabled={state === "submitting"}>
            {state === "submitting" ? "Submitting..." : submitLabel}
          </Button>

          <p
            className={`text-sm ${
              state === "error" ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {message ||
              (type === "early-access"
                ? "We will reach out when the next early access cohort opens."
                : "We will notify you when ewatrade opens wider access.")}
          </p>
        </div>
      </form>
      {devPreview ? <EarlyAccessPreview preview={devPreview} /> : null}
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
