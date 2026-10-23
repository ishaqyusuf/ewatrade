"use client"

import { invalidateServiceJobLists } from "@/components/service-work/invalidate-service-job-lists"
import { serviceBatchEligible } from "@/components/service-work/service-batch-eligibility"
import type { WorkJob } from "@/components/service-work/service-utils"
import { useTRPC } from "@/trpc/client"
import { toast } from "@ewatrade/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"

export function useServiceWorkBatch(
  selectedJobs: WorkJob[],
  clearSelection: () => void,
) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [channel, setChannel] = useState<"sms" | "whatsapp">("whatsapp")
  const [message, setMessage] = useState("")
  const qaMessageSnapshot = useRef<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const running = useRef(false)
  const [working, setWorking] = useState(false)
  const [showMessage, setShowMessage] = useState(false)
  const transition = useMutation(trpc.services.transitionLine.mutationOptions())
  const eligibleCount = (
    action: "mark_in_progress" | "mark_ready" | "resume" | "delay",
  ) => selectedJobs.filter((job) => serviceBatchEligible(job, action)).length
  const refresh = async () => {
    await Promise.all([invalidateServiceJobLists(queryClient, trpc)])
  }
  const notificationMutation = useMutation(
    trpc.serviceCommunications.createBatchIntents.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: async () => {
        setMessage("")
        await refresh()
      },
    }),
  )
  const batchMutation = useMutation(
    trpc.services.batchUpdate.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: async () => {
        clearSelection()
      },
    }),
  )

  async function updateBatch(
    action: "delay" | "mark_in_progress" | "mark_ready",
  ) {
    if (running.current) return
    const eligible = selectedJobs.filter((job) =>
      serviceBatchEligible(job, action),
    )
    if (!eligible.length) {
      setError("No selected jobs are eligible for this action.")
      return
    }
    running.current = true
    setWorking(true)
    setError(null)
    try {
      await batchMutation.mutateAsync({
        action,
        jobs: eligible.map((job) => ({
          expectedRevision: job.revision,
          jobId: job.id,
        })),
        reason:
          action === "delay"
            ? "Batch delay of 1 day"
            : "Updated from Service Work batch actions",
        shiftMinutes: action === "delay" ? 1_440 : undefined,
      })
      if (action === "delay") {
        await notificationMutation.mutateAsync({
          channel,
          clientBatchId: `delay-${crypto.randomUUID()}`,
          jobs: eligible.map((job) => ({
            jobId: job.id,
            message: `Sorry, order ${job.orderNumber} has been delayed by 1 day.`,
          })),
          templatePurpose: "delay",
        })
      }
      toast(
        `${eligible.length} jobs updated; ${selectedJobs.length - eligible.length} ineligible jobs left unchanged.`,
      )
    } finally {
      running.current = false
      setWorking(false)
      await refresh()
    }
  }

  async function resumeBatch(reason: string) {
    if (running.current) return
    if (!reason.trim()) {
      setError("Enter a reason for continuing this work.")
      return false
    }
    const eligible = selectedJobs.filter((job) =>
      serviceBatchEligible(job, "resume"),
    )
    if (!eligible.length) return false
    running.current = true
    setWorking(true)
    setError(null)
    let completed = 0
    try {
      for (const job of eligible) {
        for (const line of job.lines.filter(
          (line) =>
            line.status === "BLOCKED" &&
            line.authorizationStatus === "AUTHORIZED",
        )) {
          await transition.mutateAsync({
            clientCommandId: crypto.randomUUID(),
            expectedRevision: line.revision,
            lineId: line.id,
            schemaVersion: 1,
            source: "dashboard_service_batch",
            toStatus: "in_progress",
            reason: reason.trim(),
          })
        }
        completed++
      }
      clearSelection()
      toast(
        `${completed} jobs continued; ${selectedJobs.length - eligible.length} ineligible jobs left unchanged.`,
      )
      return true
    } catch (failure) {
      setError(
        `${completed} jobs continued. ${failure instanceof Error ? failure.message : "Reload before retrying the remaining work."}`,
      )
      return false
    } finally {
      running.current = false
      setWorking(false)
      await refresh()
    }
  }

  function sendBatchMessage() {
    setError(null)
    notificationMutation.mutate({
      channel,
      clientBatchId: `message-${crypto.randomUUID()}`,
      jobs: selectedJobs.map((job) => ({
        jobId: job.id,
        message: message.replaceAll("{order}", job.orderNumber),
      })),
      templatePurpose: "batch_update",
    })
  }

  return {
    working,
    eligibleCount,
    resumeBatch,
    showMessage,
    setShowMessage,
    channel,
    setChannel,
    message,
    setMessage,
    qaMessageSnapshot,
    error,
    notificationMutation,
    batchMutation,
    updateBatch,
    sendBatchMessage,
  }
}
