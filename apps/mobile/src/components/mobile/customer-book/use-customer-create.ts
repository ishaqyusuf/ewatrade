import { useModal } from "@/components/ui/modal"
import type { SaleCustomerDraft } from "../create-sale-customer-sheet-model"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { TRPCClientError } from "@trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import { useCallback, useEffect, useRef, useState } from "react"
import { Keyboard } from "react-native"

type CreateInput = RouterInputs["customers"]["create"]
type Phase = "editing" | "posting" | "uncertain" | "accepted"
const emptyDraft = (): SaleCustomerDraft => ({ name: "", phone: "", email: "" })

function prepareCustomer(
  draft: SaleCustomerDraft,
): { input: CreateInput } | { error: string } {
  const name = draft.name.trim()
  const phone = draft.phone.trim()
  const email = draft.email.trim()
  if (!name || name.length > 160)
    return { error: "Enter a customer name within 160 characters." }
  if (phone && (phone.length < 3 || phone.length > 40))
    return { error: "Use 3 to 40 characters for the phone number." }
  if (
    email &&
    (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  )
    return { error: "Enter a valid email address within 320 characters." }
  return {
    input: { name, phone: phone || undefined, email: email || undefined },
  }
}

// No automatic retry: customers.create has no server idempotency contract.
export function useCustomerCreate({
  scope,
  canOperate,
  isOffline,
  onCheckDirectory,
}: {
  scope: string | null
  canOperate: boolean
  isOffline: boolean
  onCheckDirectory: (name: string) => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const modal = useModal()
  const origin = useRef(scope)
  if (!origin.current && scope) origin.current = scope
  const blocked = !scope || scope !== origin.current || !canOperate
  const current = useRef({ scope, blocked, isOffline, onCheckDirectory })
  current.current = { scope, blocked, isOffline, onCheckDirectory }
  const mounted = useRef(false)
  const busy = useRef(false)
  const attempt = useRef<{
    scope: string
    input: CreateInput
    accepted: boolean
  } | null>(null)
  const [draft, updateDraft] = useState<SaleCustomerDraft>(emptyDraft)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>("editing")
  const [open, setOpen] = useState(false)
  const mutation = useMutation(
    trpc.customers.create.mutationOptions({ retry: false }),
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
    } else if (open) {
      modal.present()
    }
  }, [blocked, open, modal.dismiss, modal.present])

  const canFollowUp = useCallback(() => {
    const request = attempt.current
    return (
      mounted.current &&
      request &&
      !current.current.blocked &&
      current.current.scope === request.scope
    )
  }, [])

  const finishAccepted = useCallback(async () => {
    if (busy.current || !attempt.current?.accepted || !canFollowUp()) return
    busy.current = true
    modal.dismiss()
    setOpen(false)
    updateDraft(emptyDraft())
    setError(null)
    setNotice("Customer saved.")
    let refreshed = false
    if (!current.current.isOffline) {
      try {
        await Promise.all([
          queryClient.invalidateQueries(trpc.customers.count.queryFilter(), {
            throwOnError: true,
          }),
          queryClient.invalidateQueries(trpc.customers.listPage.queryFilter(), {
            throwOnError: true,
          }),
          queryClient.invalidateQueries(
            trpc.tenant.featureAvailability.queryFilter(),
            { throwOnError: true },
          ),
        ])
        refreshed = true
      } catch {
        /* Acceptance is independent of refreshing the directory. */
      }
    }
    busy.current = false
    if (!canFollowUp()) return
    setNotice(
      refreshed
        ? "Customer saved."
        : "Customer saved. Refresh the directory after reconnecting to see the latest record.",
    )
    attempt.current = null
    setPhase("editing")
  }, [canFollowUp, modal.dismiss, queryClient, trpc])

  useEffect(() => {
    if (phase === "accepted" && !blocked) void finishAccepted()
  }, [phase, blocked, finishAccepted])

  function setDraft(next: SaleCustomerDraft) {
    if (current.current.blocked || busy.current || attempt.current) return
    updateDraft(next)
    setError(null)
  }

  const present = useCallback(() => {
    if (current.current.blocked) return
    Keyboard.dismiss()
    setOpen(true)
  }, [])

  async function save() {
    if (
      busy.current ||
      attempt.current ||
      current.current.blocked ||
      !current.current.scope
    )
      return
    if (current.current.isOffline) {
      setError("Reconnect to save a customer to the shared directory.")
      return
    }
    const prepared = prepareCustomer(draft)
    if ("error" in prepared) {
      setError(prepared.error)
      return
    }
    attempt.current = {
      scope: current.current.scope,
      input: prepared.input,
      accepted: false,
    }
    busy.current = true
    setPhase("posting")
    setError(null)
    setNotice(null)
    Keyboard.dismiss()
    try {
      await mutation.mutateAsync(prepared.input)
    } catch (failure) {
      busy.current = false
      if (!mounted.current) return
      const rejected =
        failure instanceof TRPCClientError &&
        [
          "BAD_REQUEST",
          "CONFLICT",
          "UNAUTHORIZED",
          "FORBIDDEN",
          "NOT_FOUND",
        ].includes(failure.data?.code ?? "")
      if (rejected) {
        attempt.current = null
        setPhase("editing")
        setError(failure.message)
      } else {
        setPhase("uncertain")
        setError(
          "The save result was not confirmed. Check the shared directory before attempting another customer; this request will not be retried automatically.",
        )
      }
      return
    }
    busy.current = false
    if (attempt.current) attempt.current.accepted = true
    if (mounted.current) setPhase("accepted")
  }

  function checkDirectory() {
    if (
      busy.current ||
      current.current.blocked ||
      current.current.isOffline ||
      !attempt.current ||
      attempt.current.accepted
    )
      return
    modal.dismiss()
    setOpen(false)
    current.current.onCheckDirectory(attempt.current.input.name)
  }

  // An explicit user choice of an existing directory record is not proof that
  // this request created it. It ends local recovery without replaying any write.
  function useExistingContact() {
    if (busy.current || current.current.blocked || phase !== "uncertain") return
    attempt.current = null
    updateDraft(emptyDraft())
    setError(null)
    setPhase("editing")
    setNotice(
      "Using the selected saved contact. The previous save was not retried.",
    )
  }

  return {
    draft,
    setDraft,
    error,
    notice,
    phase,
    open,
    modal,
    blocked,
    isPending: phase === "posting" || phase === "accepted",
    locked: blocked || phase !== "editing",
    uncertain: phase === "uncertain",
    present,
    save,
    checkDirectory,
    useExistingContact,
    onDismiss: () => setOpen(false),
  }
}
