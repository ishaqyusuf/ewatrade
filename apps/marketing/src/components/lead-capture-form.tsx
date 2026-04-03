"use client"

import { startTransition, useRef, useState } from "react"

import {
  createMarketingLeadSubmissionFailedNotification,
  createMarketingLeadSubmittedNotification
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

const endpointByType = {
  "early-access": "/api/early-access",
  waitlist: "/api/waitlist"
} as const

const baseInputClasses =
  "w-full rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"

export function LeadCaptureForm({
  title,
  description,
  type,
  submitLabel
}: LeadCaptureFormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, setState] = useState<SubmissionState>("idle")
  const [message, setMessage] = useState("")
  const { notify } = useNotifications()

  async function handleSubmit(formData: FormData) {
    setState("submitting")
    setMessage("")

    const payload =
      type === "early-access"
        ? {
            fullName: String(formData.get("fullName") ?? ""),
            email: String(formData.get("email") ?? ""),
            companyName: String(formData.get("companyName") ?? ""),
            roleTitle: String(formData.get("roleTitle") ?? ""),
            phone: String(formData.get("phone") ?? ""),
            message: String(formData.get("message") ?? "")
          }
        : {
            fullName: String(formData.get("fullName") ?? ""),
            email: String(formData.get("email") ?? "")
          }

    try {
      const response = await fetch(endpointByType[type], {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      })

      const result = (await response.json()) as { message?: string }

      if (!response.ok) {
        setState("error")
        const nextMessage =
          result.message ?? "We could not save your request. Please try again."

        setMessage(nextMessage)
        notify({
          ...createMarketingLeadSubmissionFailedNotification({
            type: type === "early-access" ? "EARLY_ACCESS" : "WAITLIST"
          }),
          description: nextMessage
        })
        return
      }

      const nextMessage =
        result.message ??
        (type === "early-access"
          ? "Your early access request has been received."
          : "You have been added to the waitlist.")

      setState("success")
      setMessage(nextMessage)
      formRef.current?.reset()
      notify({
        ...createMarketingLeadSubmittedNotification({
          type: type === "early-access" ? "EARLY_ACCESS" : "WAITLIST"
        }),
        description: nextMessage
      })
    } catch {
      setState("error")
      const nextMessage = "Something went wrong while sending your request."

      setMessage(nextMessage)
      notify({
        ...createMarketingLeadSubmissionFailedNotification({
          type: type === "early-access" ? "EARLY_ACCESS" : "WAITLIST"
        }),
        description: nextMessage
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
              placeholder="Ada Nwosu"
              className={baseInputClasses}
            />
          </label>

          <label className="space-y-2 text-sm text-foreground">
            <span>Email</span>
            <input
              required
              type="email"
              name="email"
              placeholder="ada@merchant.com"
              className={baseInputClasses}
            />
          </label>
        </div>

        {type === "early-access" ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-foreground">
                <span>Company name</span>
                <input
                  name="companyName"
                  placeholder="Nile Market"
                  className={baseInputClasses}
                />
              </label>

              <label className="space-y-2 text-sm text-foreground">
                <span>Role</span>
                <input
                  name="roleTitle"
                  placeholder="Founder, Operations Lead, Merchant Owner"
                  className={baseInputClasses}
                />
              </label>
            </div>

            <label className="space-y-2 text-sm text-foreground">
              <span>Phone number</span>
              <input
                name="phone"
                placeholder="+234..."
                className={baseInputClasses}
              />
            </label>

            <label className="space-y-2 text-sm text-foreground">
              <span>What are you hoping to launch or improve?</span>
              <textarea
                name="message"
                rows={4}
                placeholder="Tell us about your storefront, fulfillment, or POS needs."
                className={`${baseInputClasses} resize-y`}
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
    </div>
  )
}
