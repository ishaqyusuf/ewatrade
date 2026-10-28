"use client"

import { useTRPC, useTRPCClient } from "@/trpc/client"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  type CreditOffer,
  type CreditRequest,
  type StoredCreditCommand,
  appliedCredit,
  creditAwaitsLink,
  creditOffer,
  currentCreditCommand,
  newCreditCommand,
  provenFunds,
  readCreditCommand,
  refundIdentity,
  sameSnapshot,
  sendCreditCommand,
  writeCreditCommand,
} from "./customer-credit-model"
import type { PublicPaymentLink } from "./payment-format"

export type CreditPhase =
  | { kind: "idle" }
  /** The customer is looking at exactly this snapshot and amount before consenting. */
  | {
      kind: "review"
      availableMinor: number
      amountMinor: number
      proof: string
      snapshot: Omit<CreditRequest, "clientCommandId" | "amountMinor">
    }
  /** The balance or order changed before the customer consented; nothing was applied. */
  | { kind: "stale" }

/**
 * Verified customer credit for one link. The amount and snapshot are the server's; the stable
 * clientCommandId is saved before the request, a lost answer retries the same request, and only
 * the server's reply or a fresh read says what was applied.
 */
export function useCustomerCredit(input: {
  token: string
  link: PublicPaymentLink | undefined
  /** Only on a page that offers a new transfer. */
  enabled: boolean
  allowApply: boolean
  reportToken: string | null
  linkUpdatedAt: number
}) {
  const { token, link, enabled, allowApply, reportToken, linkUpdatedAt } = input
  const activeVisit = useRef({ token, generation: 0 })
  if (activeVisit.current.token !== token)
    activeVisit.current = {
      token,
      generation: activeVisit.current.generation + 1,
    }
  const visitGeneration = activeVisit.current.generation
  const trpc = useTRPC()
  const client = useTRPCClient()
  const queryClient = useQueryClient()
  const fundsOptions = trpc.businessBanking.customerFunds.queryOptions({
    token,
  })
  const fundsQuery = useQuery({
    ...fundsOptions,
    enabled: enabled && Boolean(link),
    staleTime: 0,
    refetchOnWindowFocus: true,
  })

  const [command, setCommand] = useState<StoredCreditCommand | null>(null)
  useEffect(() => {
    setCommand(readCreditCommand(token))
    setAnswered(new Set())
    setSettledAt(null)
    setPhase({ kind: "idle" })
    setSending(false)
    setUnknownError(null)
    sendingRef.current = false
  }, [token])

  const funds = provenFunds({
    enabled,
    status: fundsQuery.status,
    fetchStatus: fundsQuery.fetchStatus,
    data: fundsQuery.data,
  })
  const proofVerified = funds?.status === "VERIFIED"
  const refundProof = refundIdentity(funds)
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set())
  const [settledAt, setSettledAt] = useState<number | null>(null)
  const offer: CreditOffer =
    link && allowApply ? creditOffer({ funds, link }) : { kind: "none" }
  const [phase, setPhase] = useState<CreditPhase>({ kind: "idle" })
  const [sending, setSending] = useState(false)
  const [unknownError, setUnknownError] = useState<string | null>(null)
  const sendingRef = useRef(false)

  // Consent covers one snapshot only: any change clears it before it can be sent.
  const identity =
    funds?.status === "VERIFIED"
      ? `${funds.accountId}:${funds.customerId}:${funds.orderId}:${funds.currencyCode}:${link?.paymentAttemptId}`
      : null
  const current =
    offer.kind === "available"
      ? `${identity}:${offer.snapshot.expectedRevision}:${offer.snapshot.expectedOrderTotalMinor}:${offer.snapshot.expectedOrderPaidMinor}:${offer.applyMinor}`
      : null
  useEffect(() => {
    if (phase.kind !== "review" || sendingRef.current) return
    const reviewed = `${phase.proof}:${phase.snapshot.expectedRevision}:${phase.snapshot.expectedOrderTotalMinor}:${phase.snapshot.expectedOrderPaidMinor}:${phase.amountMinor}`
    if (current !== reviewed) setPhase({ kind: "stale" })
  }, [current, phase])

  const linkKey = trpc.businessBanking.paymentLink.queryKey({ token })
  const fundsKey = fundsOptions.queryKey
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: fundsKey })
    void queryClient.invalidateQueries({ queryKey: linkKey })
    // A decided report carries the order money this page shows.
    if (reportToken)
      void queryClient.invalidateQueries({
        queryKey: trpc.businessBanking.reportStatus.queryKey({ reportToken }),
      })
  }, [queryClient, fundsKey, linkKey, reportToken, trpc])

  const send = async (pending: StoredCreditCommand) => {
    if (sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    setUnknownError(null)
    try {
      const outcome = await sendCreditCommand({
        client,
        token,
        command: pending,
      })
      if (outcome.kind === "applied") {
        writeCreditCommand(token, outcome.command)
        if (activeVisit.current.generation !== visitGeneration) return
        setCommand(outcome.command)
        setPhase({ kind: "idle" })
        setAnswered(
          (previous) => new Set([...previous, pending.request.clientCommandId]),
        )
      } else if (activeVisit.current.generation === visitGeneration)
        setUnknownError(outcome.message)
    } finally {
      if (activeVisit.current.generation === visitGeneration) {
        sendingRef.current = false
        setSending(false)
        setSettledAt(Date.now())
        refresh()
      }
    }
  }

  const needsRecovery = Boolean(
    command &&
      (!command.result || !answered.has(command.request.clientCommandId)),
  )
  const blocksTransfer =
    needsRecovery || creditAwaitsLink({ sending, settledAt, linkUpdatedAt })
  const applied =
    proofVerified && link
      ? appliedCredit({
          command: currentCreditCommand(command, link.paymentAttemptId),
          answered,
          attemptAppliedMinor: link.attemptAppliedMinor,
        })
      : null
  const review = () => {
    if (
      !identity ||
      offer.kind !== "available" ||
      offer.applyMinor <= 0 ||
      blocksTransfer
    )
      return
    setPhase({
      kind: "review",
      proof: identity,
      availableMinor: offer.availableMinor,
      amountMinor: offer.applyMinor,
      snapshot: offer.snapshot,
    })
  }

  const confirm = () => {
    if (phase.kind !== "review" || !link || sendingRef.current) return
    if (
      offer.kind !== "available" ||
      identity !== phase.proof ||
      !sameSnapshot(offer.snapshot, phase.snapshot) ||
      offer.applyMinor !== phase.amountMinor
    ) {
      setPhase({ kind: "stale" })
      return
    }
    const pending = newCreditCommand({
      paymentAttemptId: link.paymentAttemptId,
      snapshot: phase.snapshot,
      amountMinor: phase.amountMinor,
    })
    // Saved before the first request, so a reload or lost answer reuses this exact key.
    writeCreditCommand(token, pending)
    setCommand(pending)
    // From here the saved request, not the review, decides what the page shows.
    setPhase({ kind: "idle" })
    void send(pending)
  }

  const retry = () => {
    if (command && proofVerified) void send(command)
  }

  const reset = () => {
    setPhase({ kind: "idle" })
    void fundsQuery.refetch()
  }

  const safePhase: CreditPhase =
    phase.kind === "review" &&
    current !==
      `${phase.proof}:${phase.snapshot.expectedRevision}:${phase.snapshot.expectedOrderTotalMinor}:${phase.snapshot.expectedOrderPaidMinor}:${phase.amountMinor}`
      ? { kind: "stale" }
      : phase

  return {
    fundsQuery,
    funds,
    proofVerified,
    refundProof,
    applied,
    needsRecovery,
    offer,
    phase: safePhase,
    command,
    sending,
    unknownError,
    blocksTransfer,
    review,
    confirm,
    retry,
    reset,
    cancel: () => setPhase({ kind: "idle" }),
  }
}

export type CustomerCreditState = ReturnType<typeof useCustomerCredit>
