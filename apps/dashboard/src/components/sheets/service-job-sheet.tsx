"use client"

import { ServiceJobWorkspace } from "@/components/service-work/service-job-workspace"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { Sheet } from "@ewatrade/ui"
import {
  releaseAssistantDraftJobOverlay,
  useAssistantDraftJobOverlay,
} from "@/hooks/use-assistant-draft-job-handoff"
import {
  draftJobFactoryReadState,
  type DraftJobHandoff,
  type DraftJobScope,
} from "@/components/general-assistant/assistant-draft-job-handoff-state"
import { useTRPC, useTRPCClient } from "@/trpc/client"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRef } from "react"

export function ServiceJobSheet({
  canManage,
  storeId,
  scope,
  nativeAccessAvailable = true,
}: {
  canManage: boolean
  storeId: string
  scope?: DraftJobScope
  nativeAccessAvailable?: boolean
}) {
  const { jobId, setParams, sheet } = useServiceWorkParams()
  const open = sheet === "job" && Boolean(jobId)
  const overlay = useAssistantDraftJobOverlay()
  const retained = useRef<DraftJobHandoff | null>(null)
  if (open && overlay?.jobId === jobId) retained.current = overlay
  else if (!open || retained.current?.jobId !== jobId) retained.current = null
  const handoff = retained.current
  const client = useTRPCClient()
  const trpc = useTRPC()
  const cache = useQueryClient()
  const context = useQuery({
    queryKey: ["assistant-draft-job-context", handoff?.token, scope],
    queryFn: ({ signal }) => client.tenant.current.query(undefined, { signal }),
    enabled: open && Boolean(handoff) && nativeAccessAvailable,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  })
  const contextLoading =
    context.isPending ||
    context.isFetching ||
    context.isPaused ||
    !context.isFetchedAfterMount
  const freshScope: DraftJobScope | null =
    !contextLoading && context.isSuccess && context.data.activeStore
      ? {
          actorUserId: context.data.actorUserId,
          tenantId: context.data.tenant.id,
          storeId: context.data.activeStore.id,
        }
      : null
  const handoffState = !nativeAccessAvailable
    ? "unavailable"
    : handoff
      ? draftJobFactoryReadState(handoff, overlay?.token, scope, context)
      : null
  const { closeError, requestClose } = useSheetDismissal(async () => {
    await setParams(handoff ? { jobId: null, serviceSheet: null } : null)
    if (handoff)
      releaseAssistantDraftJobOverlay(handoff.token, () => {
        void cache.invalidateQueries({
          queryKey: trpc.retailOps.staffStoreAccessReview.queryKey(),
        })
      })
  })

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void requestClose()
      }}
    >
      {open && jobId ? (
        <SheetFrame
          closeError={closeError}
          title="Service Job"
          description="Line progress, evidence, assignment, promises, and customer-safe updates."
          finalFocus={handoff ? false : undefined}
        >
          {!nativeAccessAvailable || (handoff && handoffState !== "ready") ? (
            handoffState === "loading" ? (
              <output aria-live="polite">Checking current Job access…</output>
            ) : (
              <p role="alert">
                This Job review or your current scope is unavailable. Close the
                Job to return to your draft.
              </p>
            )
          ) : (
            <ServiceJobWorkspace
              canManage={canManage}
              jobId={jobId}
              key={
                handoff
                  ? `${storeId}:${jobId}:${canManage}:${handoff.token}`
                  : `${storeId}:${jobId}:${canManage}`
              }
              draftJobHandoff={handoff ?? undefined}
              draftJobScope={freshScope ?? undefined}
            />
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
