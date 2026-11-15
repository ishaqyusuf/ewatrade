"use client"

import { AuthShell } from "@/components/auth/auth-shell"
import { useTRPCClient } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  assistantReviewLocatorSchema,
  assistantReviewPath,
} from "@ewatrade/assistant/channels/review-links"
import type {
  GeneralAction,
  GeneralProposal,
} from "@ewatrade/assistant/general/contracts"
import { Button } from "@ewatrade/ui"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { GeneralPaymentLinksReceipt } from "./general-payment-links"
import { GeneralProposalCard } from "./general-proposal-card"
import { GeneralProposalEditor } from "./general-proposal-editor"
import { switchLinkWorkspace } from "./switch-link-workspace"

type Review = RouterOutputs["assistant"]["reviewLink"]
type Ready = Extract<Review, { status: "ready" }>
const WHATSAPP_URL = "https://wa.me/2349047125343"

/**
 * WhatsApp review link page. The draft shows inline (the page is the review,
 * so no dialog); each other state is one title, one line and one action.
 * Only the existing proposal card/editor is mounted; this page has no chat.
 */
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
      if (!assistantReviewLocatorSchema.safeParse(locator).success) {
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
          setNotice("Check your connection and try again.")
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
    const path = locator
      ? (assistantReviewPath(locator) ?? "/assistant-review")
      : "/assistant-review"
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
      replaceLocator()
    } catch {
      if (mounted.current && current.current === generation) {
        setReview(null)
        setNotice("We couldn’t confirm the result. Check WhatsApp first.")
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
          "We couldn’t confirm your changes. Open the newest link in WhatsApp.",
        )
      }
    } finally {
      running.current = false
      if (mounted.current) setBusy(false)
    }
  }

  const ready = review?.status === "ready" ? review : null
  const view = reviewView({
    hasLink: Boolean(token),
    loading,
    notice,
    result,
    review,
  })

  async function switchToDraft() {
    if (review?.status !== "scope_mismatch" || busy) return
    setBusy(true)
    setNotice(null)
    try {
      await switchLinkWorkspace(review)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Couldn’t switch.")
      setBusy(false)
    }
  }

  const back = (
    <a
      href={WHATSAPP_URL}
      rel="noreferrer"
      className="font-medium text-[var(--link)] underline-offset-4 hover:underline"
    >
      Back to WhatsApp
    </a>
  )

  if (ready)
    return (
      <AuthShell
        width="wide"
        plain
        title={editing ? "Edit your draft" : "Review your draft"}
        description={`${ready.businessName} · ${ready.storeName}`}
        footer={back}
      >
        <div className="grid gap-4" aria-live="polite">
          {notice ? (
            <p role="alert" className="text-destructive">
              {notice}
            </p>
          ) : null}
          {editing ? (
            <div className="rounded-[var(--ui-radius-surface)] border border-border bg-card p-4 sm:p-6">
              <GeneralProposalEditor
                key={`${ready.proposal.id}:${ready.proposal.revision}`}
                proposal={ready.proposal}
                currencyCode={ready.currencyCode}
                disabled={busy}
                onCancel={() => setEditing(false)}
                onSave={(payload) => void save(payload)}
              />
            </div>
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
        </div>
      </AuthShell>
    )

  return (
    <AuthShell
      title={view.title}
      description={
        <span aria-live="polite">
          {result?.status === "COMPLETED" &&
          result.receipt?.kind === "payment_links"
            ? null
            : view.detail}
        </span>
      }
      footer={view.action === "whatsapp" ? null : back}
    >
      {loading ? (
        <div className="h-11 animate-pulse rounded-[var(--ui-radius-control)] bg-muted" />
      ) : (
        <div className="grid gap-4">
          {result?.status === "COMPLETED" &&
          result.receipt?.kind === "payment_links" ? (
            <GeneralPaymentLinksReceipt
              receipt={result.receipt}
              heading={false}
            />
          ) : null}
          {notice && view.action !== "retry" ? (
            <p role="alert" className="text-destructive">
              {notice}
            </p>
          ) : null}
          {view.action === "switch" && review?.status === "scope_mismatch" ? (
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => void switchToDraft()}
            >
              {busy ? "Switching…" : `Switch to ${review.businessName}`}
            </Button>
          ) : view.action === "account" ? (
            <Button
              className="w-full"
              render={
                <Link
                  href={`/login?next=${encodeURIComponent(currentPath(token))}`}
                />
              }
            >
              Use another account
            </Button>
          ) : view.action === "retry" ? (
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => void load(token)}
            >
              Try again
            </Button>
          ) : (
            <Button
              className="w-full"
              render={<Link href={WHATSAPP_URL} rel="noreferrer" />}
            >
              Back to WhatsApp
            </Button>
          )}
        </div>
      )}
    </AuthShell>
  )
}

function currentPath(token: string) {
  return (token && assistantReviewPath(token)) || "/assistant-review"
}

type ReviewView = {
  title: string
  detail?: string
  action: "whatsapp" | "switch" | "account" | "retry"
}

/** One title, at most one short line and one action per state. */
function reviewView({
  hasLink,
  loading,
  notice,
  result,
  review,
}: {
  hasLink: boolean
  loading: boolean
  notice: string | null
  result: GeneralProposal | null
  review: Review | null
}): ReviewView {
  if (loading) return { title: "Opening your review…", action: "whatsapp" }
  if (!hasLink && !result)
    return {
      title: "Open your review from WhatsApp",
      detail: "Tap the review link in the chat.",
      action: "whatsapp",
    }
  if (result?.status === "COMPLETED")
    return {
      title: result.receipt?.title ?? "Saved",
      detail: result.receipt?.detail ?? "Your change is saved.",
      action: "whatsapp",
    }
  if (result?.status === "CANCELLED")
    return {
      title: "Draft cancelled",
      detail: "Nothing was saved.",
      action: "whatsapp",
    }
  if (result)
    return {
      title: "Check WhatsApp first",
      detail: "We couldn’t confirm it saved. Check before trying again.",
      action: "whatsapp",
    }
  if (!review)
    return notice
      ? { title: "Couldn’t open this review", detail: notice, action: "retry" }
      : { title: "Opening your review…", action: "whatsapp" }
  switch (review.status) {
    case "expired":
      return {
        title: "This link has expired",
        detail: "Ask for a new review in WhatsApp.",
        action: "whatsapp",
      }
    case "used":
      return {
        title: "This draft is already done",
        detail: "WhatsApp has the result.",
        action: "whatsapp",
      }
    case "changed":
      return {
        title: "This draft has changed",
        detail: "Open the newest link in WhatsApp.",
        action: "whatsapp",
      }
    case "scope_mismatch":
      return {
        title: "This draft is for another business",
        detail: `${review.businessName} · ${review.storeName}`,
        action: "switch",
      }
    case "ready":
      return { title: "Review your draft", action: "whatsapp" }
    default:
      return {
        title: "This link isn’t for you",
        detail: "Sign in with the account that uses this WhatsApp number.",
        action: "account",
      }
  }
}
