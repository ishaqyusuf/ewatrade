"use client"

import {
  type DraftJobHandoff,
  type DraftJobScope,
  draftJobFactoryReadState,
} from "@/components/general-assistant/assistant-draft-job-handoff-state"
import {
  ServiceJobWorkspace,
  parseJobStep,
} from "@/components/service-work/service-job-workspace"
import {
  JOB_STEP_TITLES,
  jobWhat,
} from "@/components/service-work/service-utils"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import {
  releaseAssistantDraftJobOverlay,
  useAssistantDraftJobOverlay,
} from "@/hooks/use-assistant-draft-job-handoff"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { useTRPC, useTRPCClient } from "@/trpc/client"
import { Sheet } from "@ewatrade/ui"
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
  const { jobId, jobStep, setParams, sheet } = useServiceWorkParams()
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
  // Same query as the workspace (shared cache), for the sheet's title line.
  const titleJob = useQuery({
    ...trpc.services.getJob.queryOptions({ jobId: jobId ?? "" }),
    enabled: open && Boolean(jobId) && !handoff,
    retry: false,
  })
  const step = parseJobStep(jobStep)
  const customer =
    titleJob.data?.customerName ||
    (titleJob.data ? "Walk-in customer" : "Service job")
  const title = step ? JOB_STEP_TITLES[step.step] : customer
  const description = titleJob.data
    ? step
      ? `${customer} · ${titleJob.data.orderNumber}`
      : `${titleJob.data.orderNumber} · ${jobWhat(titleJob.data)}`
    : undefined
  const { closeError, requestClose } = useSheetDismissal(async () => {
    await setParams(
      handoff ? { jobId: null, jobStep: null, serviceSheet: null } : null,
    )
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
          title={title}
          description={description}
          back={
            step
              ? {
                  label: `Back to ${titleJob.data?.orderNumber ?? "job"}`,
                  onClick: () =>
                    void setParams({
                      jobId,
                      jobStep: null,
                      serviceSheet: "job",
                    }),
                }
              : undefined
          }
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
