"use client"
import type { WorkJob } from "@/components/service-work/service-utils"
import { useTRPC } from "@/trpc/client"
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
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.services.queue.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.services.queuePage.queryKey(),
      }),
    ])
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
        await refresh()
      },
    }),
  )

  async function updateBatch(
    action: "delay" | "mark_in_progress" | "mark_ready",
  ) {
    setError(null)
    await batchMutation.mutateAsync({
      action,
      jobs: selectedJobs.map((job) => ({
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
        jobs: selectedJobs.map((job) => ({
          jobId: job.id,
          message: `Sorry, order ${job.orderNumber} has been delayed by 1 day.`,
        })),
        templatePurpose: "delay",
      })
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
