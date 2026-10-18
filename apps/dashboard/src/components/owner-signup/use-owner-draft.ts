"use client"

import { useTRPCClient } from "@/trpc/client"
import type { OwnerSetupDraft } from "@ewatrade/utils/owner-signup"
import { useCallback, useEffect, useRef, useState } from "react"

/** Serial writes prevent a slower earlier autosave from replacing a newer draft. */
export function useOwnerDraft(draft: OwnerSetupDraft) {
  const client = useTRPCClient()
  const latest = useRef(draft)
  latest.current = draft
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const mounted = useRef(true)
  const finishing = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [state, setState] = useState<"saved" | "saving" | "error">("saved")
  const [error, setError] = useState("")
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])
  const save = useCallback(
    (snapshot: OwnerSetupDraft) => {
      if (mounted.current) {
        setState("saving")
        setError("")
      }
      const pending = queue.current
        .catch(() => undefined)
        .then(() => client.tenant.saveOwnerSignupDraft.mutate(snapshot))
      queue.current = pending
      return pending
        .then(() => {
          if (mounted.current && latest.current === snapshot) setState("saved")
        })
        .catch((cause) => {
          if (mounted.current) {
            setState("error")
            setError(
              cause instanceof Error
                ? cause.message
                : "Your setup could not be saved. Try again.",
            )
          }
          throw cause
        })
    },
    [client],
  )
  useEffect(() => {
    if (finishing.current) return
    setState("saving")
    timer.current = setTimeout(() => {
      void save(draft).catch(() => undefined)
    }, 650)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [draft, save])
  async function complete() {
    if (finishing.current) return false
    finishing.current = true
    if (timer.current) clearTimeout(timer.current)
    const finalSnapshot = latest.current
    try {
      await save(finalSnapshot)
      await client.tenant.completeOwnerSignup.mutate(finalSnapshot)
      return true
    } catch (cause) {
      if (mounted.current) {
        setState("error")
        setError(
          cause instanceof Error
            ? cause.message
            : "Setup could not be completed. Try again.",
        )
      }
      finishing.current = false
      return false
    }
  }
  return { state, error, retry: () => save(latest.current), complete }
}
