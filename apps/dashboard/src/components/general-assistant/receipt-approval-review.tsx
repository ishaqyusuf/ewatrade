"use client"

import { useTRPCClient } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type {
  GeneralAction,
  GeneralProposal,
} from "@ewatrade/assistant/general/contracts"
import { Button } from "@ewatrade/ui"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { GeneralProposalCard } from "./general-proposal-card"
import { GeneralProposalEditor } from "./general-proposal-editor"

type View = RouterOutputs["assistant"]["openReceiptApproval"]
type Ready = Extract<View, { status: "ready" }>

const notices = {
  expired: "This request has expired. Ask them to send the receipt again.",
  cancelled: "This request was cancelled. Nothing was saved.",
  scope_mismatch:
    "This request belongs to another Store. Switch to that Store in EwaTrade, then reopen the link.",
  unavailable: "This request is unavailable.",
  forbidden: "Only an owner or admin of this business can approve it.",
} as const

/**
 * A cashier's receipt sent for approval (Workshop 19l). Opening drafts the
 * request as your own proposal, so the usual review, edit and confirm apply.
 */
export function ReceiptApprovalReview({ id }: { id: string }) {
  const client = useTRPCClient()
  const [view, setView] = useState<View | null>(null)
  const [proposal, setProposal] = useState<GeneralProposal | null>(null)
  const [result, setResult] = useState<
    | { status: "approved"; proposal: GeneralProposal | null }
    | { status: "declined" }
    | null
  >(null)
  const [loading, setLoading] = useState(Boolean(id))
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const running = useRef(false)

  const load = useCallback(async () => {
    if (!id) {
      setView({ status: "unavailable" })
      setLoading(false)
      return
    }
    setLoading(true)
    setNotice(null)
    try {
      const next = await client.assistant.openReceiptApproval.mutate({ id })
      setView(next)
      setProposal(next.status === "ready" ? next.proposal : null)
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Couldn’t open this request. Try again.",
      )
    } finally {
      setLoading(false)
    }
  }, [client, id])

  useEffect(() => {
    void load()
  }, [load])

  async function run(task: () => Promise<void>) {
    if (running.current) return
    running.current = true
    setBusy(true)
    setNotice(null)
    try {
      await task()
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Couldn’t save that. Check the request and try again.",
      )
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  const decide = (decision: "approve" | "decline") =>
    run(async () => {
      if (!proposal) return
      const outcome = await client.assistant.decideReceiptApproval.mutate({
        id,
        decision,
        proposalId: proposal.id,
        revision: proposal.revision,
        ...(decision === "approve" && proposal.approvalToken
          ? { approvalToken: proposal.approvalToken }
          : {}),
      })
      setResult(
        outcome.status === "approved"
          ? { status: "approved", proposal: outcome.proposal }
          : { status: "declined" },
      )
    })

  const save = (payload: GeneralAction) =>
    run(async () => {
      if (!proposal) return
      const revised = await client.assistant.editProposal.mutate({
        proposalId: proposal.id,
        revision: proposal.revision,
        payload,
      })
      setProposal(revised)
      setEditing(false)
    })

  const ready: Ready | null = view?.status === "ready" ? view : null
  const heading = loading
    ? "Opening the request…"
    : result?.status === "approved"
      ? (result.proposal?.receipt?.title ?? "Approved and saved")
      : result?.status === "declined"
        ? "Declined"
        : ready
          ? `${ready.requestedBy} sent a ${ready.kind} to approve`
          : view?.status === "approved"
            ? `Already approved by ${view.decidedBy}`
            : view?.status === "declined"
              ? `Declined by ${view.decidedBy}`
              : "Receipt approval"

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
          className="flex flex-col gap-4 rounded-lg border bg-card p-6"
          aria-live="polite"
        >
          <h1 className="text-xl font-semibold">{heading}</h1>
          {result ? (
            <p className="text-sm text-muted-foreground">
              {result.status === "approved"
                ? (result.proposal?.receipt?.detail ??
                  `Saved. ${ready?.requestedBy ?? "They"} will be told in their chat.`)
                : `Nothing was saved. ${ready?.requestedBy ?? "They"} will be told in their chat.`}
            </p>
          ) : ready && proposal ? (
            <>
              <p className="text-sm text-muted-foreground">
                {ready.businessName} · {ready.storeName}
              </p>
              {ready.summary ? (
                <p className="whitespace-pre-line text-sm">{ready.summary}</p>
              ) : null}
              {ready.facts.length ? (
                <dl className="grid gap-1.5 rounded-md bg-muted/50 p-3 text-sm">
                  {ready.facts.map((fact) => (
                    <div key={fact.label} className="flex gap-3">
                      <dt className="w-32 shrink-0 text-muted-foreground">
                        {fact.label}
                      </dt>
                      <dd className="min-w-0 break-words">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {editing ? (
                <GeneralProposalEditor
                  key={`${proposal.id}:${proposal.revision}`}
                  proposal={proposal}
                  currencyCode={ready.currencyCode}
                  disabled={busy}
                  onCancel={() => setEditing(false)}
                  onSave={(payload) => void save(payload)}
                />
              ) : (
                <GeneralProposalCard
                  key={`${proposal.id}:${proposal.revision}`}
                  proposal={proposal}
                  currencyCode={ready.currencyCode}
                  expanded
                  confirmLabel="Approve and save"
                  cancelLabel="Decline"
                  disabled={busy}
                  onConfirm={() => void decide("approve")}
                  onCancel={() => void decide("decline")}
                  onEdit={() => setEditing(true)}
                />
              )}
            </>
          ) : view && view.status !== "ready" ? (
            <p className="text-sm text-muted-foreground">
              {view.status === "approved" || view.status === "declined"
                ? view.summary
                : notices[view.status]}
            </p>
          ) : null}
          {notice ? (
            <p role="alert" className="text-sm text-destructive">
              {notice}
            </p>
          ) : null}
          {!loading && !result && !ready ? (
            <Button
              variant="outline"
              className="self-start"
              disabled={busy}
              onClick={() => void load()}
            >
              Check again
            </Button>
          ) : null}
        </section>
        <Link
          href="/"
          className="self-start text-sm underline underline-offset-4"
        >
          Go to EwaTrade
        </Link>
      </div>
    </main>
  )
}
