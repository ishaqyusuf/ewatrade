"use client"

import { useTRPCClient } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { assistantReviewLinkTokenSchema } from "@ewatrade/assistant/channels/review-links"
import type {
  GeneralAction,
  GeneralProposal,
} from "@ewatrade/assistant/general/contracts"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ewatrade/ui"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { GeneralProposalCard } from "./general-proposal-card"
import { GeneralProposalEditor } from "./general-proposal-editor"

type Review = RouterOutputs["assistant"]["reviewLink"]
type Ready = Extract<Review, { status: "ready" }>
const notices = {
  expired: "This review link has expired. Ask for a new review in WhatsApp.",
  used: "This link is no longer active. Check WhatsApp for the latest result.",
  changed: "The draft has changed. Open the latest review link from WhatsApp.",
  scope_mismatch:
    "This review belongs to another business or Store. Select that workspace in EwaTrade, then reopen the link.",
  unavailable:
    "This review is unavailable for this account. Use the account connected to WhatsApp, or request a new link.",
} as const

/** Only the existing proposal review/editor is mounted; this page has no chat. */
export function AssistantLinkReview({
  initialToken,
}: { initialToken: string }) {
  const client = useTRPCClient()
  const [token, setToken] = useState(initialToken)
  const [review, setReview] = useState<Review | null>(null)
  const [result, setResult] = useState<GeneralProposal | null>(null)
  const [loading, setLoading] = useState(Boolean(initialToken))
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const current = useRef(0)
  const running = useRef(false)
  const mounted = useRef(false)

  const load = useCallback(
    async (locator: string) => {
      const generation = ++current.current
      setLoading(true)
      setNotice(null)
      setReview(null)
      if (!assistantReviewLinkTokenSchema.safeParse(locator).success) {
        setReview({ status: "unavailable" })
        setLoading(false)
        return
      }
      try {
        // A read-only POST keeps the locator out of tRPC query URLs.
        const next = await client.assistant.reviewLink.mutate({
          token: locator,
        })
        if (mounted.current && current.current === generation) setReview(next)
      } catch {
        if (mounted.current && current.current === generation)
          setNotice(
            "Couldn’t check this review. Sign in again or try checking its status.",
          )
      } finally {
        if (mounted.current && current.current === generation) setLoading(false)
      }
    },
    [client],
  )

  useEffect(() => {
    mounted.current = true
    if (initialToken) void load(initialToken)
    else setReview({ status: "unavailable" })
    return () => {
      mounted.current = false
      current.current += 1
    }
  }, [initialToken, load])

  useEffect(() => {
    if (review?.status !== "ready") return
    const remaining = Date.parse(review.expiresAt) - Date.now()
    const timeout = setTimeout(
      () => {
        current.current += 1
        setEditing(false)
        setReview({ status: "expired" })
      },
      Math.max(0, remaining),
    )
    return () => clearTimeout(timeout)
  }, [review])

  function replaceLocator(locator?: string) {
    const path = `/assistant-review${locator ? `?token=${encodeURIComponent(locator)}` : ""}`
    window.history.replaceState(window.history.state, "", path)
  }

  async function decide(ready: Ready, decision: "confirm" | "cancel") {
    if (running.current || Date.parse(ready.expiresAt) <= Date.now()) return
    running.current = true
    setBusy(true)
    setNotice(null)
    const generation = ++current.current
    try {
      const outcome = await client.assistant.decideReviewLink.mutate({
        token,
        decision,
        ...(decision === "confirm" && ready.proposal.approvalToken
          ? { approvalToken: ready.proposal.approvalToken }
          : {}),
      })
      if (!mounted.current || current.current !== generation) return
      setResult(outcome)
      setReview(null)
      setOpen(false)
      replaceLocator()
    } catch {
      if (mounted.current && current.current === generation) {
        setReview(null)
        setNotice(
          "Couldn’t verify the result. Check status before trying again.",
        )
      }
    } finally {
      running.current = false
      if (mounted.current) setBusy(false)
    }
  }

  async function save(payload: GeneralAction) {
    if (running.current || review?.status !== "ready") return
    running.current = true
    setBusy(true)
    setNotice(null)
    const generation = ++current.current
    try {
      const revised = await client.assistant.editReviewLink.mutate({
        token,
        payload,
      })
      if (!mounted.current || current.current !== generation) return
      setEditing(false)
      setToken(revised.token)
      replaceLocator(revised.token)
      await load(revised.token)
    } catch {
      if (mounted.current && current.current === generation) {
        setReview(null)
        setEditing(false)
        setNotice(
          "Couldn’t verify the updated draft. Check status or open the newest WhatsApp link.",
        )
      }
    } finally {
      running.current = false
      if (mounted.current) setBusy(false)
    }
  }

  const ready = review?.status === "ready" ? review : null
  const completed = result?.status === "COMPLETED"
  const cancelled = result?.status === "CANCELLED"
  return (
    <main className="flex min-h-svh flex-col bg-background px-5 py-8 text-foreground sm:py-12">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6">
        <Link
          href="/"
          className="self-start text-lg font-semibold tracking-tight"
        >
          EwaTrade
        </Link>
        <section
          className="flex flex-col gap-3 rounded-lg border bg-card p-6"
          aria-live="polite"
        >
          <h1 className="text-xl font-semibold">
            {loading
              ? "Checking your review…"
              : completed
                ? (result?.receipt?.title ?? "Saved")
                : cancelled
                  ? "Draft cancelled"
                  : result
                    ? "Check your result"
                    : ready
                      ? "Review your WhatsApp draft"
                      : "Review link"}
          </h1>
          {result ? (
            <p className="text-sm text-muted-foreground">
              {completed
                ? (result?.receipt?.detail ??
                  "Your change was saved. Return to WhatsApp to continue.")
                : cancelled
                  ? "The draft was cancelled. No business changes were saved."
                  : "This action has no confirmed successful result. Check WhatsApp before starting it again."}
            </p>
          ) : ready ? (
            <>
              <p className="text-sm text-muted-foreground">
                {ready.businessName} · {ready.storeName}
              </p>
              <p className="text-sm text-muted-foreground">
                Your draft is waiting for your review.
              </p>
              <Button onClick={() => setOpen(true)} className="self-start">
                Review draft
              </Button>
            </>
          ) : review && review.status !== "ready" ? (
            <p className="text-sm text-muted-foreground">
              {notices[review.status]}
            </p>
          ) : null}
          {notice ? (
            <p role="alert" className="text-sm text-destructive">
              {notice}
            </p>
          ) : null}
          {!result && !loading && token ? (
            <Button
              variant="outline"
              className="self-start"
              disabled={busy}
              onClick={() => void load(token)}
            >
              Check status
            </Button>
          ) : null}
        </section>
        <a
          href="https://wa.me/2349047125343"
          rel="noreferrer"
          className="self-start text-sm underline underline-offset-4"
        >
          Return to WhatsApp
        </a>
      </div>
      <Dialog
        open={Boolean(ready) && open}
        onOpenChange={(value) => {
          if (!running.current) {
            setOpen(value)
            if (!value) setEditing(false)
          }
        }}
      >
        {ready ? (
          <DialogContent
            className="flex max-h-[85svh] max-w-lg flex-col gap-4 rounded-lg p-6 text-foreground shadow-lg"
            hideClose={busy}
          >
            <DialogHeader className="pr-8">
              <DialogTitle className="text-lg leading-none font-semibold">
                {editing ? "Edit draft" : "Review draft"}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {ready.businessName} · {ready.storeName}
                {editing
                  ? ". Save changes, then review again before confirming."
                  : ". Nothing is saved until you confirm."}
              </DialogDescription>
            </DialogHeader>
            {notice ? (
              <p role="alert" className="text-sm text-destructive">
                {notice}
              </p>
            ) : null}
            {editing ? (
              <GeneralProposalEditor
                key={`${ready.proposal.id}:${ready.proposal.revision}`}
                proposal={ready.proposal}
                currencyCode={ready.currencyCode}
                disabled={busy}
                onCancel={() => setEditing(false)}
                onSave={(payload) => void save(payload)}
              />
            ) : (
              <GeneralProposalCard
                key={`${ready.proposal.id}:${ready.proposal.revision}`}
                proposal={{ ...ready.proposal, expiresAt: ready.expiresAt }}
                currencyCode={ready.currencyCode}
                expanded
                confirmLabel="Approve and save"
                disabled={busy}
                onConfirm={() => void decide(ready, "confirm")}
                onCancel={() => void decide(ready, "cancel")}
                onEdit={() => setEditing(true)}
                onReply={() => setEditing(true)}
              />
            )}
          </DialogContent>
        ) : null}
      </Dialog>
    </main>
  )
}
