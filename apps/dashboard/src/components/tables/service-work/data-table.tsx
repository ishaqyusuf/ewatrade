"use client"

import { DashboardTable } from "@/components/dashboard/dashboard-table"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { createServiceWorkColumns } from "./columns"
import { ServiceWorkEmptyState } from "./empty-states"

export function ServiceWorkDataTable({
  canManage,
  storeId,
  timeZone,
}: { canManage: boolean; storeId: string; timeZone: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { query, setParams } = useServiceWorkParams()
  const { data } = useSuspenseQuery(
    trpc.services.queue.queryOptions({ limit: 200, storeId }, { retry: false }),
  )
  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return data
    return data.filter((job) =>
      [
        job.orderNumber,
        job.summary,
        ...job.lines.flatMap((line) => [
          line.catalogItemName,
          line.variantName,
          line.offeringName,
        ]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    )
  }, [data, query])
  const columns = useMemo(
    () =>
      createServiceWorkColumns(
        (jobId) => setParams({ jobId, serviceSheet: "job" }),
        timeZone,
      ),
    [setParams, timeZone],
  )
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [channel, setChannel] = useState<"sms" | "whatsapp">("whatsapp")
  const [message, setMessage] = useState("")
  const [error, setError] = useState<string | null>(null)
  const selectedJobs = rows.filter((job) => selectedKeys.has(job.id))
  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: trpc.services.queue.queryKey(),
    })
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
        setSelectedKeys(new Set())
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

  return (
    <div className="grid gap-3">
      {canManage && selectedJobs.length > 0 ? (
        <div className="grid gap-3 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-sm font-medium">
              {selectedJobs.length} selected
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={batchMutation.isPending}
              onClick={() => void updateBatch("mark_in_progress")}
            >
              Start work
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={batchMutation.isPending}
              onClick={() => void updateBatch("mark_ready")}
            >
              Mark ready
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={
                batchMutation.isPending || notificationMutation.isPending
              }
              onClick={() => void updateBatch("delay")}
            >
              Delay 1 day + notify
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedKeys(new Set())}
            >
              Deselect
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
            <select
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
              value={channel}
              onChange={(event) =>
                setChannel(event.target.value as typeof channel)
              }
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
            </select>
            <input
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
              placeholder="Message; use {order} for the order number"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <Button
              size="sm"
              disabled={!message.trim() || notificationMutation.isPending}
              onClick={sendBatchMessage}
            >
              Send update
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      ) : null}
      <DashboardTable
        rows={rows}
        columns={columns}
        getRowKey={(job) => job.id}
        emptyState={<ServiceWorkEmptyState filtered={Boolean(query.trim())} />}
        onSelectionChange={canManage ? setSelectedKeys : undefined}
        selectedKeys={canManage ? selectedKeys : undefined}
      />
    </div>
  )
}
