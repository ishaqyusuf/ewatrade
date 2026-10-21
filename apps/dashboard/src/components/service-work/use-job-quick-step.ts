"use client"

import type { WorkJob } from "@/components/service-work/service-utils"
import { useTRPC } from "@/trpc/client"
import { toast } from "@ewatrade/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"

/**
 * Start or Mark ready from the list or the job sheet: moves every part of the
 * job that can move, one part at a time, so operators can use it too.
 */
export function useJobQuickStep() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const transition = useMutation(trpc.services.transitionLine.mutationOptions())

  async function run(job: WorkJob, step: "start" | "ready") {
    const lines = job.lines.filter(
      (line) =>
        line.authorizationStatus === "AUTHORIZED" &&
        (step === "start"
          ? line.status === "QUEUED"
          : line.status === "QUEUED" || line.status === "IN_PROGRESS"),
    )
    if (lines.length === 0) {
      toast("Nothing here can move yet. Open the job to see why.")
      return
    }
    try {
      for (const line of lines) {
        await transition.mutateAsync({
          clientCommandId: crypto.randomUUID(),
          expectedRevision: line.revision,
          lineId: line.id,
          schemaVersion: 1,
          source: "dashboard_job_workspace",
          toStatus: step === "start" ? "in_progress" : "ready_for_handoff",
        })
      }
      toast(
        step === "start"
          ? `${job.orderNumber} started.`
          : `${job.orderNumber} is ready for the customer.`,
      )
    } catch (failure) {
      toast(
        failure instanceof Error
          ? failure.message
          : "That didn’t save. Try again.",
      )
    } finally {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: trpc.services.queuePage.queryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.services.queue.queryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.services.queueStageCounts.queryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.services.getJob.queryKey({ jobId: job.id }),
        }),
      ])
    }
  }

  return { run, isPending: transition.isPending }
}
