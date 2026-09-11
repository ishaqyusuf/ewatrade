import { useModal } from "@/components/ui/modal"
import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { TRPCClientError } from "@trpc/client"
import * as Crypto from "expo-crypto"
import { useCallback, useEffect, useRef, useState } from "react"
import { Keyboard } from "react-native"
import {
  emptyStaffDraft,
  prepareStaffInvite,
  type StaffDraft,
} from "./staff-model"

type InvitationInput = RouterInputs["retailOps"]["inviteStaff"]
type InvitationPhase = "editing" | "posting" | "uncertain" | "accepted"
type InvitationContext = {
  scope: string | null
  storeId: string | undefined
  canOperate: boolean
  canReadBilling: boolean
  isOffline: boolean
  isCurrentScope: () => boolean
  onCheckDirectory: (email: string) => void
  onComplete?: () => void
}

// One command owner for both appearances. The bounded server replay cache is
// not a durable retry contract: an uncertain command is never submitted again.
export function useStaffInvitation(context: InvitationContext) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const modal = useModal()
  const origin = useRef(context.scope)
  if (!origin.current && context.scope) origin.current = context.scope
  const blocked =
    !context.scope ||
    context.scope !== origin.current ||
    !context.canOperate ||
    !context.storeId
  const current = useRef({ ...context, blocked })
  current.current = { ...context, blocked }
  const mounted = useRef(false)
  const busy = useRef(false)
  const request = useRef<{
    scope: string
    input: InvitationInput
    accepted: boolean
  } | null>(null)
  const [draft, updateDraft] = useState<StaffDraft>(emptyStaffDraft)
  const [phase, setPhase] = useState<InvitationPhase>("editing")
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const mutation = useMutation(
    trpc.retailOps.inviteStaff.mutationOptions({
      retry: false,
      networkMode: "always",
    }),
  )

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (blocked) {
      modal.dismiss()
      setOpen(false)
    } else if (open) modal.present()
  }, [blocked, open, modal.dismiss, modal.present])

  const canFollowUp = useCallback(
    () =>
      Boolean(
        mounted.current &&
          request.current &&
          !current.current.blocked &&
          current.current.isCurrentScope() &&
          current.current.scope === request.current.scope,
      ),
    [],
  )

  const finishAccepted = useCallback(async () => {
    if (busy.current || !request.current?.accepted || !canFollowUp()) return
    busy.current = true
    modal.dismiss()
    setOpen(false)
    setError(null)
    setNotice(
      "Invitation recorded. This screen does not confirm email delivery.",
    )
    let refreshed = false
    if (!current.current.isOffline) {
      try {
        await Promise.all([
          queryClient.invalidateQueries(trpc.retailOps.staff.queryFilter(), {
            throwOnError: true,
          }),
          queryClient.invalidateQueries(
            trpc.tenant.featureAvailability.queryFilter(),
            { throwOnError: true },
          ),
          ...(current.current.canReadBilling
            ? [
                queryClient.invalidateQueries(
                  trpc.retailOps.subscription.queryFilter(),
                  { throwOnError: true },
                ),
              ]
            : []),
        ])
        refreshed = true
      } catch {
        // Directory refresh cannot change a confirmed command into a failure.
      }
    }
    busy.current = false
    if (!canFollowUp()) return
    setNotice(
      refreshed
        ? "Invitation recorded. This screen does not confirm email delivery."
        : "Invitation recorded, but the directory could not refresh. Reconnect and refresh; do not send again. Email delivery is not confirmed.",
    )
    request.current = null
    updateDraft(emptyStaffDraft())
    setPhase("editing")
    current.current.onComplete?.()
  }, [canFollowUp, modal.dismiss, queryClient, trpc])

  useEffect(() => {
    if (phase === "accepted" && !blocked) void finishAccepted()
  }, [phase, blocked, finishAccepted])

  const present = useCallback(() => {
    if (
      current.current.blocked ||
      !current.current.isCurrentScope() ||
      busy.current
    )
      return
    Keyboard.dismiss()
    setOpen(true)
  }, [])

  function setDraft(next: StaffDraft) {
    if (
      current.current.blocked ||
      !current.current.isCurrentScope() ||
      busy.current ||
      request.current
    )
      return
    updateDraft(next)
    setError(null)
  }

  async function save() {
    const active = current.current
    if (
      active.blocked ||
      !active.isCurrentScope() ||
      active.isOffline ||
      !active.scope ||
      !active.storeId ||
      busy.current ||
      request.current
    )
      return
    const prepared = prepareStaffInvite(
      draft,
      active.storeId,
      Crypto.randomUUID(),
    )
    if ("error" in prepared) {
      setError(prepared.error)
      return
    }
    const attempt = {
      scope: active.scope,
      input: prepared.input,
      accepted: false,
    }
    request.current = attempt
    busy.current = true
    setError(null)
    setNotice(null)
    setPhase("posting")
    try {
      await mutation.mutateAsync(attempt.input)
      attempt.accepted = true
      busy.current = false
      if (mounted.current) setPhase("accepted")
      // If identity changed, the accepted result waits for its original scope.
      if (canFollowUp()) void finishAccepted()
    } catch (failure) {
      busy.current = false
      const code =
        failure instanceof TRPCClientError ? failure.data?.code : undefined
      const rejected = [
        "BAD_REQUEST",
        "CONFLICT",
        "UNAUTHORIZED",
        "FORBIDDEN",
        "NOT_FOUND",
      ].includes(code ?? "")
      if (rejected) {
        request.current = null
        if (mounted.current) {
          setPhase("editing")
          setError(
            failure instanceof Error
              ? failure.message
              : "Check the invitation details and your access.",
          )
        }
      } else if (mounted.current) {
        setPhase("uncertain")
        setError(
          "The result did not arrive. The invitation may already be saved. Check the directory without sending it again. Recovery is held only while this workflow stays open.",
        )
      }
    }
  }

  function checkDirectory() {
    if (
      current.current.blocked ||
      !current.current.isCurrentScope() ||
      busy.current ||
      !request.current ||
      request.current.accepted
    )
      return
    modal.dismiss()
    setOpen(false)
    current.current.onCheckDirectory(request.current.input.email)
  }

  return {
    blocked,
    draft,
    setDraft,
    phase,
    open,
    modalRef: modal.ref,
    error,
    notice,
    present,
    save,
    checkDirectory,
    close: () => {
      if (busy.current) return
      modal.dismiss()
      setOpen(false)
    },
    onDismiss: () => setOpen(false),
    isPending: phase === "posting" || phase === "accepted",
    locked: blocked || phase !== "editing",
    recoveryEmail:
      phase === "uncertain" ? request.current?.input.email : undefined,
    canSubmit:
      !blocked &&
      !context.isOffline &&
      phase === "editing" &&
      "input" in
        prepareStaffInvite(draft, context.storeId ?? "", "validation-only"),
  }
}
