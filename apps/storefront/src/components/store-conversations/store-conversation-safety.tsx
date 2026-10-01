"use client"

import { useEffect, useRef, useState } from "react"

import { StoreConversationAccountDialog } from "./store-conversation-account-dialog"

export const REPORT_REASONS = [
  { label: "Spam", value: "spam" },
  { label: "Harassment", value: "harassment" },
  { label: "Hateful content", value: "hateful_content" },
  { label: "Sexual content", value: "sexual_content" },
  { label: "Violence", value: "violence" },
  { label: "Other", value: "other" },
] as const

type ReportReason = (typeof REPORT_REASONS)[number]["value"]
type Access = "account" | "guest"

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { message?: string }
  if (!response.ok) throw new Error(body.message ?? "Request failed.")
  return body
}

export function StoreConversationSafety({
  access,
  blocked,
  conversationId,
  onBlockedChange,
  publicToken,
  reportMessageId,
  onReportMessageHandled,
}: {
  access: Access
  blocked: boolean
  conversationId: string
  onBlockedChange: (blocked: boolean) => void
  onReportMessageHandled: () => void
  publicToken: string
  reportMessageId: string | null
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason>("spam")
  const [details, setDetails] = useState("")
  const [reportBusy, setReportBusy] = useState(false)
  const [blockBusy, setBlockBusy] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [blockError, setBlockError] = useState<string | null>(null)
  const [reportSubmitted, setReportSubmitted] = useState(false)
  const reportOperation = useRef<string | null>(null)
  const reportTarget = useRef<string | null>(null)
  const blockOperation = useRef<{ blocked: boolean; id: string } | null>(null)

  useEffect(() => {
    if (!reportMessageId) return
    if (reportTarget.current !== reportMessageId) {
      reportOperation.current = null
      reportTarget.current = reportMessageId
    }
    setOpen(true)
    setReportSubmitted(false)
    setReportError(null)
  }, [reportMessageId])

  const close = () => {
    setOpen(false)
    onReportMessageHandled()
  }

  const submitReport = async () => {
    if (reportBusy) return
    const clientOperationId = reportOperation.current ?? crypto.randomUUID()
    reportOperation.current = clientOperationId
    setReportBusy(true)
    setReportError(null)
    try {
      await responseJson<{ reportId: string; status: "submitted" }>(
        await fetch("/api/store-conversations/report", {
          body: JSON.stringify({
            access,
            clientOperationId,
            conversationId,
            details: details.trim() || undefined,
            messageId: reportMessageId ?? undefined,
            publicToken,
            reason,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      )
      reportOperation.current = null
      setReportSubmitted(true)
      setDetails("")
    } catch (error) {
      setReportError(
        error instanceof Error
          ? error.message
          : "The report could not be submitted. Try again.",
      )
    } finally {
      setReportBusy(false)
    }
  }

  const setBlock = async (nextBlocked: boolean) => {
    if (blockBusy) return
    const current = blockOperation.current
    const clientOperationId =
      current?.blocked === nextBlocked ? current.id : crypto.randomUUID()
    blockOperation.current = { blocked: nextBlocked, id: clientOperationId }
    setBlockBusy(true)
    setBlockError(null)
    try {
      const result = await responseJson<{ blocked: boolean }>(
        await fetch("/api/store-conversations/block", {
          body: JSON.stringify({
            access,
            blocked: nextBlocked,
            clientOperationId,
            conversationId,
            publicToken,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      )
      blockOperation.current = null
      onBlockedChange(result.blocked)
    } catch (error) {
      setBlockError(
        error instanceof Error
          ? error.message
          : "The block setting could not be changed. Try again.",
      )
    } finally {
      setBlockBusy(false)
    }
  }

  return (
    <>
      <button
        aria-label="Conversation safety options"
        className="min-h-11 rounded-full border border-border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          if (reportTarget.current !== null) {
            reportOperation.current = null
            reportTarget.current = null
          }
          setReportSubmitted(false)
          setReportError(null)
          setOpen(true)
        }}
        type="button"
      >
        Safety
      </button>
      <StoreConversationAccountDialog
        onClose={close}
        open={open}
        title="Conversation safety"
      >
        <div className="grid gap-6">
          <section className="grid gap-3" aria-labelledby="report-heading">
            <div className="grid gap-1">
              <h3 className="font-semibold" id="report-heading">
                {reportMessageId ? "Report this message" : "Report the Store"}
              </h3>
              <p className="text-sm leading-5 text-muted-foreground">
                Tell EwaTrade about content or behavior that concerns you. A
                report does not block the Store.
              </p>
            </div>
            {reportSubmitted ? (
              <output className="text-sm font-medium">
                Report submitted. Thank you for letting us know.
              </output>
            ) : (
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  void submitReport()
                }}
              >
                <label className="grid gap-1 text-sm font-medium">
                  Reason
                  <select
                    className="min-h-11 rounded-xl border border-border bg-background px-3 font-normal"
                    disabled={reportBusy}
                    onChange={(event) => {
                      setReason(event.target.value as ReportReason)
                      reportOperation.current = null
                    }}
                    value={reason}
                  >
                    {REPORT_REASONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Details (optional)
                  <textarea
                    className="min-h-24 rounded-xl border border-border bg-background p-3 font-normal"
                    disabled={reportBusy}
                    maxLength={500}
                    onChange={(event) => {
                      setDetails(event.target.value)
                      reportOperation.current = null
                    }}
                    value={details}
                  />
                </label>
                {reportError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {reportError}
                  </p>
                ) : null}
                <button
                  className="min-h-11 justify-self-start rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  disabled={reportBusy}
                  type="submit"
                >
                  {reportBusy ? "Submitting report…" : "Submit report"}
                </button>
              </form>
            )}
          </section>
          <section
            aria-labelledby="block-heading"
            className="grid gap-3 border-t border-border pt-5"
          >
            <div className="grid gap-1">
              <h3 className="font-semibold" id="block-heading">
                {blocked ? "Store blocked" : "Block this Store"}
              </h3>
              <p className="text-sm leading-5 text-muted-foreground">
                {blocked
                  ? "Your conversation history stays available. New messages and Store reply alerts are paused until you unblock."
                  : "Pause new messages and Store reply alerts. Your conversation history stays available, and you can unblock later."}
              </p>
            </div>
            {blockError ? (
              <p className="text-sm text-destructive" role="alert">
                {blockError}
              </p>
            ) : null}
            <button
              className="min-h-11 justify-self-start rounded-full border border-border px-5 text-sm font-semibold disabled:opacity-60"
              disabled={blockBusy}
              onClick={() => void setBlock(!blocked)}
              type="button"
            >
              {blockBusy
                ? blocked
                  ? "Unblocking…"
                  : "Blocking…"
                : blocked
                  ? "Unblock Store"
                  : "Block Store"}
            </button>
          </section>
        </div>
      </StoreConversationAccountDialog>
    </>
  )
}
