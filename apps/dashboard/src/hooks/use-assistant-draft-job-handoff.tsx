"use client"

import {
  createDraftJobHandoffStore,
  draftJobPreflightMatches,
  draftJobScopeEqual,
  type DraftJobHandoff,
} from "@/components/general-assistant/assistant-draft-job-handoff-state"
import type { StaffAccessWorkload } from "@/components/general-assistant/staff-access-workload-state"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useTRPC, useTRPCClient } from "@/trpc/client"
import { staffAccessReviewInput } from "@ewatrade/assistant/general/staff-access"
import { useQueryClient } from "@tanstack/react-query"
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import type { z } from "zod"

const handoffs = createDraftJobHandoffStore()
const serverSnapshot = () => null
export function releaseAssistantDraftJobOverlay(
  token: string,
  beforeRelease?: () => void,
) {
  if (handoffs.getSnapshot()?.token !== token) return false
  beforeRelease?.()
  return handoffs.release(token)
}
export function useAssistantDraftJobOverlay() {
  return useSyncExternalStore(
    handoffs.subscribe,
    handoffs.getSnapshot,
    serverSnapshot,
  )
}
type Request = {
  fields: z.infer<typeof staffAccessReviewInput>
  job: StaffAccessWorkload["jobs"][number]
  opener: HTMLElement
}
type HandoffAPI = {
  open: (request: Request) => Promise<void>
  pending: boolean
  error: string | null
}
const HandoffContext = createContext<HandoffAPI | null>(null)
export const AssistantDraftJobHandoffProvider = HandoffContext.Provider
export const useAssistantDraftJobOpener = () => useContext(HandoffContext)

export function useAssistantDraftJobHandoff(draftKey: string | null) {
  const client = useTRPCClient()
  const trpc = useTRPC()
  const cache = useQueryClient()
  const params = useServiceWorkParams()
  const overlay = useAssistantDraftJobOverlay()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef({ draftKey, params })
  latest.current = { draftKey, params }
  const generation = useRef(0)
  const owned = useRef<DraftJobHandoff | null>(null)
  const seen = useRef(false)
  const trigger = useRef<HTMLElement | null>(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      generation.current += 1
      if (owned.current) handoffs.release(owned.current.token)
    }
  }, [])
  useEffect(() => {
    generation.current += 1
    if (owned.current && owned.current.draftKey !== draftKey) {
      handoffs.release(owned.current.token)
      owned.current = null
    }
    setError(null)
    setPending(false)
  }, [draftKey])
  useEffect(() => {
    const mine = owned.current
    if (!mine) return
    if (params.sheet === "job" && params.jobId === mine.jobId) {
      seen.current = true
      return
    }
    if (!seen.current) return
    releaseAssistantDraftJobOverlay(mine.token, () => {
      void cache.invalidateQueries({
        queryKey: trpc.retailOps.staffStoreAccessReview.queryKey(),
      })
    })
    owned.current = null
    seen.current = false
    if (params.sheet === "job") return
    const frame = requestAnimationFrame(() => {
      if (
        trigger.current?.isConnected &&
        latest.current.draftKey === mine.draftKey
      )
        trigger.current.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [cache, params.jobId, params.sheet, trpc])

  async function open(request: Request) {
    if (!draftKey || pending || handoffs.getSnapshot()) return
    const requestGeneration = ++generation.current
    const active = () =>
      mounted.current &&
      generation.current === requestGeneration &&
      latest.current.draftKey === draftKey
    setPending(true)
    setError(null)
    try {
      const fields = staffAccessReviewInput.parse(request.fields)
      const before = await client.tenant.current.query()
      if (!active()) return
      if (!before.activeStore)
        throw Error("Your current Store is unavailable. Reopen the draft.")
      const scope = {
        actorUserId: before.actorUserId,
        tenantId: before.tenant.id,
        storeId: before.activeStore.id,
      }
      const review = await client.retailOps.staffStoreAccessReview.query(fields)
      if (!active()) return
      const native = await client.services.getJob.query({
        jobId: request.job.jobId,
      })
      if (
        !draftJobPreflightMatches(
          review.outstandingServiceWork,
          fields.membershipId,
          request.job,
          native,
        )
      )
        throw Error(
          "This Job's current assignment or revision changed. Review the staff workload again.",
        )
      const after = await client.tenant.current.query()
      if (
        !after.activeStore ||
        !draftJobScopeEqual(scope, {
          actorUserId: after.actorUserId,
          tenantId: after.tenant.id,
          storeId: after.activeStore.id,
        })
      )
        throw Error(
          "Your current business, Store or identity changed. Reopen the draft.",
        )
      if (!active() || !native?.currentAssigneeUserId) return
      const value: DraftJobHandoff = {
        token: crypto.randomUUID(),
        draftKey,
        scope,
        membershipId: fields.membershipId,
        staffRevision: review.expectedRevision,
        jobId: native.id,
        jobStoreId: native.storeId,
        jobRevision: native.revision,
        assigneeUserId: native.currentAssigneeUserId,
      }
      if (!handoffs.claim(value))
        throw Error("Another Job review is already open.")
      owned.current = value
      seen.current = false
      trigger.current = request.opener
      try {
        cache.setQueryData(
          trpc.services.getJob.queryKey({ jobId: native.id }),
          native,
        )
        await latest.current.params.setParams({
          jobId: native.id,
          serviceSheet: "job",
        })
      } catch (cause) {
        void cache.invalidateQueries({
          queryKey: trpc.retailOps.staffStoreAccessReview.queryKey(),
        })
        handoffs.release(value.token)
        owned.current = null
        requestAnimationFrame(() => {
          if (active() && trigger.current?.isConnected) trigger.current.focus()
        })
        throw cause
      }
    } catch (cause) {
      if (active())
        setError(
          cause instanceof Error
            ? cause.message
            : "The current Job cannot be opened with your access.",
        )
    } finally {
      if (active()) setPending(false)
    }
  }
  return {
    api: { open, pending, error },
    covering: Boolean(overlay && overlay.draftKey === draftKey),
    overlay,
  }
}
