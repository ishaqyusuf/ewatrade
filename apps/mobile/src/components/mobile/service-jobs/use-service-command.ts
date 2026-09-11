import { useModal } from "@/components/ui/modal"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useEffect, useRef, useState } from "react"
import { Keyboard } from "react-native"

export type ServiceScope = {
  userId: string | undefined
  businessId: string | undefined
  storeId: string | undefined
  canOperate: boolean
  canManage: boolean
}
type ServiceIdentity = { userId: string; businessId: string; storeId: string }
export type PreparedServiceAction = {
  kind:
    | "intake"
    | "payment"
    | "handoff"
    | "transition"
    | "note"
    | "assignment"
    | "message"
    | "evidence"
  title: string
  facts: Array<{ label: string; value: string }>
  // Created before staging. execute must reuse the captured, typed input on retry.
  execute: () => Promise<{
    message: string
    afterAccept?: (isCurrent: () => boolean) => void | Promise<void>
  }>
  onDiscard?: () => void
}
type ReviewedServiceAction = PreparedServiceAction & {
  identity: ServiceIdentity
}
type Phase = "review" | "posting" | "retry" | "accepted"
type AcceptedResult = Awaited<ReturnType<PreparedServiceAction["execute"]>>

export function useServiceCommand(scope: ServiceScope) {
  const modal = useModal()
  const live = useRef(scope)
  live.current = scope
  const origin = useRef<ServiceIdentity | null>(null)
  if (!origin.current && scope.userId && scope.businessId && scope.storeId) {
    origin.current = {
      userId: scope.userId,
      businessId: scope.businessId,
      storeId: scope.storeId,
    }
  }
  const mounted = useRef(true)
  const busy = useRef(false)
  const attempted = useRef(false)
  const accepted = useRef(false)
  const active = useRef<ReviewedServiceAction | null>(null)
  const acceptedFollowUp = useRef<AcceptedResult | null>(null)
  const [review, setReview] = useState<ReviewedServiceAction | null>(null)
  const [phase, setPhase] = useState<Phase>("review")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (review) modal.present()
  }, [review, modal.present])
  useEffect(() => {
    void resumeAcceptedFollowUp()
  }, [
    scope.userId,
    scope.businessId,
    scope.storeId,
    scope.canOperate,
    scope.canManage,
    phase,
  ])

  function matches(identity: ServiceIdentity, manager = false) {
    const current = live.current
    return (
      mounted.current &&
      current.canOperate &&
      (!manager || current.canManage) &&
      identity.userId === current.userId &&
      identity.businessId === current.businessId &&
      identity.storeId === current.storeId
    )
  }
  const scopeChanged = Boolean(origin.current && !matches(origin.current))
  function canAct(manager = false) {
    return Boolean(
      origin.current &&
        matches(origin.current, manager) &&
        !useOperationalModeStore.getState().isOfflineMode,
    )
  }
  function stage(action: PreparedServiceAction) {
    if (active.current || busy.current) return false
    if (!origin.current || !canAct(action.kind === "message")) {
      setError(
        "Reconnect with the original account, business, Store and required permission before continuing.",
      )
      return false
    }
    const snapshot = {
      ...action,
      facts: action.facts.map((fact) => ({ ...fact })),
      identity: { ...origin.current },
    }
    active.current = snapshot
    attempted.current = false
    accepted.current = false
    acceptedFollowUp.current = null
    setPhase("review")
    setError(null)
    setNotice(null)
    setReview(snapshot)
    Keyboard.dismiss()
    return true
  }
  async function confirm() {
    const request = active.current
    if (!request || busy.current || accepted.current) return
    if (
      !matches(request.identity, request.kind === "message") ||
      useOperationalModeStore.getState().isOfflineMode
    ) {
      setError(
        "Return online to the original account, business and Store with the required permission.",
      )
      return
    }
    busy.current = true
    attempted.current = true
    setPhase("posting")
    setError(null)
    try {
      const result = await request.execute()
      accepted.current = true
      if (mounted.current) {
        setNotice(result.message)
      }
      acceptedFollowUp.current = result
      await applyAcceptedFollowUp()
    } catch (failure) {
      if (!mounted.current || accepted.current) return
      setPhase("retry")
      setError(
        failure instanceof Error
          ? failure.message
          : "The outcome was not confirmed. Retry the retained action only.",
      )
    } finally {
      busy.current = false
      if (mounted.current && accepted.current) setPhase("accepted")
    }
  }
  async function applyAcceptedFollowUp() {
    const result = acceptedFollowUp.current
    const request = active.current
    if (!result || !request) return
    const isCurrent = () =>
      matches(request.identity, request.kind === "message")
    if (!isCurrent()) {
      if (mounted.current)
        setNotice(
          result.message +
            " Return to the original workspace to finish local follow-up. Do not submit again.",
        )
      return
    }
    // The mutation is already accepted. Run local cleanup once; failures in
    // refresh/evidence follow-up must never replay the accepted mutation.
    acceptedFollowUp.current = null
    try {
      await result.afterAccept?.(isCurrent)
      if (mounted.current) setNotice(result.message)
    } catch {
      if (mounted.current)
        setNotice(
          result.message +
            " Follow-up refresh or attachment work needs attention. Do not submit this action again.",
        )
    }
  }
  async function resumeAcceptedFollowUp() {
    const request = active.current
    if (
      !request ||
      !accepted.current ||
      !acceptedFollowUp.current ||
      busy.current ||
      !matches(request.identity, request.kind === "message")
    )
      return
    busy.current = true
    setPhase("posting")
    try {
      await applyAcceptedFollowUp()
    } finally {
      busy.current = false
      if (mounted.current) setPhase("accepted")
    }
  }
  function dismiss() {
    if (!busy.current) modal.dismiss()
  }
  function afterDismiss() {
    if (
      busy.current ||
      acceptedFollowUp.current ||
      (attempted.current && !accepted.current)
    )
      return
    const request = active.current
    if (!attempted.current) request?.onDiscard?.()
    active.current = null
    setReview(null)
    setError(null)
  }
  return {
    modal,
    review,
    phase,
    error,
    notice,
    stage,
    confirm,
    dismiss,
    afterDismiss,
    resume: modal.present,
    pending: phase === "posting",
    hasAttempt: attempted.current,
    isAccepted: accepted.current,
    locked: Boolean(review),
    scopeChanged,
    canAct,
    isMounted: () => mounted.current,
  }
}
export type ServiceCommandModel = ReturnType<typeof useServiceCommand>
