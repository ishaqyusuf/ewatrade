import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import { SecondaryOperationalRow } from "@/components/mobile/secondary-operations"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { getWebUrl } from "@/lib/base-url"
import { useRetailOpsStore } from "@/store/retailOpsStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatMinorMoney } from "@ewatrade/utils"
import { useMutation, useQuery } from "@tanstack/react-query"
import * as Clipboard from "expo-clipboard"
import { useMemo, useState } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

type ServiceJob = RouterOutputs["retailOps"]["serviceJobs"][number]
type ServiceJobStatus = ServiceJob["status"]

const nextStatus: Partial<Record<ServiceJobStatus, ServiceJobStatus>> = {
  in_progress: "ready",
  ready: "completed",
  received: "in_progress",
}

function formatMoney(valueMinor: number, currencyCode: string) {
  return formatMinorMoney(valueMinor, currencyCode)
}

function formatDue(value: string | null) {
  if (!value) return "No due date"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "No due date"
    : date.toLocaleString(undefined, {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
      })
}

function statusLabel(status: ServiceJobStatus) {
  return status === "in_progress"
    ? "In progress"
    : `${status.charAt(0).toUpperCase()}${status.slice(1)}`
}

function statusTone(status: ServiceJobStatus) {
  if (status === "completed") return "success"
  if (status === "cancelled") return "warning"
  if (status === "ready") return "primary"
  return "muted"
}

export function ServiceJobsContent({
  onCreateOrder,
}: {
  onCreateOrder?: () => void
} = {}) {
  const trpc = useTRPC()
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode)
  const [search, setSearch] = useState("")
  const [evidenceUrl, setEvidenceUrl] = useState("")
  const [evidenceLabel, setEvidenceLabel] = useState("")
  const [delayNote, setDelayNote] = useState("")
  const [revisedDueAt, setRevisedDueAt] = useState("")
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const jobsQuery = useQuery(
    trpc.retailOps.serviceJobs.queryOptions(
      { limit: 100 },
      { enabled: !isOfflineMode, retry: false },
    ),
  )
  const updateStatusMutation = useMutation(
    trpc.retailOps.updateServiceJobStatus.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: (job) => {
        setError(null)
        void jobsQuery.refetch()
        if (job.status === "ready") {
          readyNotificationMutation.mutate({ jobId: job.id })
        }
      },
    }),
  )
  const assignmentMutation = useMutation(
    trpc.retailOps.assignServiceJob.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: () => {
        setError(null)
        setNotice("Service job assignment updated.")
        void jobsQuery.refetch()
      },
    }),
  )
  const readyNotificationMutation = useMutation(
    trpc.retailOps.queueServiceReadyNotification.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: (intent) => {
        void Clipboard.setStringAsync(intent.manualCopy)
        setNotice("Ready message copied. Share it with the customer.")
      },
    }),
  )
  const evidenceMutation = useMutation(
    trpc.retailOps.addServiceJobEvidence.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: () => {
        setEvidenceLabel("")
        setEvidenceUrl("")
        setSelectedJobId(null)
        setError(null)
        void jobsQuery.refetch()
      },
    }),
  )
  const delayMutation = useMutation(
    trpc.retailOps.delayServiceJob.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: (job) => {
        setDelayNote("")
        setRevisedDueAt("")
        setSelectedJobId(null)
        setError(null)
        void Clipboard.setStringAsync(job.notificationIntent.manualCopy)
        setNotice("Delay message copied. Share it with the customer.")
        void jobsQuery.refetch()
      },
    }),
  )
  const jobs = jobsQuery.data ?? []
  const visibleJobs = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return jobs
    return jobs.filter((job) =>
      [
        job.order.orderNumber,
        job.customer.name ?? "",
        job.customer.phone ?? "",
        job.status,
        job.trackingToken,
        ...job.lines.map((line) => line.itemName),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    )
  }, [jobs, search])

  return (
    <KeyboardAwareScrollView
      className="flex-1"
      contentContainerClassName="gap-5 px-4 pb-10"
      disableScrollOnKeyboardHide
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-sm leading-5 text-muted-foreground">
        Track paid service work from receipt through completion.
      </Text>
      {onCreateOrder && !isOfflineMode ? (
        <ActionButton icon="Plus" onPress={onCreateOrder}>
          New service order
        </ActionButton>
      ) : null}

      {isOfflineMode ? (
        <StatusBanner
          icon="Wind"
          message="Service jobs need a live connection. Product sales keep their existing offline queue."
          title="Offline mode"
          tone="warning"
        />
      ) : null}
      {error ? (
        <StatusBanner
          icon="TriangleAlert"
          message={error}
          title="Service job action failed"
          tone="destructive"
        />
      ) : null}
      {notice ? (
        <StatusBanner
          icon="ClipboardCheck"
          message={notice}
          title="Customer message ready"
          tone="success"
        />
      ) : null}

      <FormField
        autoCapitalize="none"
        label="Search"
        leadingIcon="Search"
        onChangeText={setSearch}
        placeholder="Search customer, receipt, or service"
        value={search}
      />

      {jobsQuery.isLoading ? (
        <StatusBanner
          icon="Loader2"
          message="Loading current service work."
          title="Service jobs"
        />
      ) : visibleJobs.length === 0 ? (
        <EmptyState
          icon="ClipboardList"
          message="Service jobs appear automatically when a sale contains a Service item."
          title="No service jobs"
        />
      ) : (
        <View className="gap-3">
          {visibleJobs.map((job) => {
            const next = nextStatus[job.status]
            const currencyCode = job.order.currencyCode
            const trackingUrl = `${getWebUrl()}/service-tracking/${job.trackingToken}`
            return (
              <View
                className="gap-3 rounded-2xl border border-border bg-card p-4"
                key={job.id}
              >
                <SecondaryOperationalRow
                  detail={`${job.customer.name ?? "Walk-in customer"} · ${formatDue(job.dueAt)}`}
                  icon="ClipboardList"
                  title={job.order.orderNumber}
                  trailing={
                    <StatusBadge
                      label={statusLabel(job.status)}
                      tone={statusTone(job.status)}
                    />
                  }
                />
                <View className="gap-1">
                  {job.lines.map((line) => (
                    <Text
                      className="text-xs text-muted-foreground"
                      key={line.id}
                    >
                      {line.quantity} × {line.itemName}
                      {line.variantName ? ` / ${line.variantName}` : ""} ·{" "}
                      {formatMoney(line.totalMinor, currencyCode)}
                    </Text>
                  ))}
                </View>
                <Text className="text-xs text-muted-foreground">
                  {job.assignedUserId
                    ? "Assigned to a staff member"
                    : "Unassigned"}
                </Text>

                {next ? (
                  <ActionButton
                    icon="CheckCircle2"
                    isLoading={updateStatusMutation.isPending}
                    onPress={() =>
                      updateStatusMutation.mutate({
                        jobId: job.id,
                        status: next,
                      })
                    }
                    variant="outline"
                  >
                    Mark {statusLabel(next).toLowerCase()}
                  </ActionButton>
                ) : null}
                {job.status !== "completed" && job.status !== "cancelled" ? (
                  <ActionButton
                    icon="User"
                    isLoading={assignmentMutation.isPending}
                    onPress={() =>
                      assignmentMutation.mutate({
                        assignedUserId: job.assignedUserId ? null : undefined,
                        jobId: job.id,
                      })
                    }
                    variant="outline"
                  >
                    {job.assignedUserId ? "Unassign job" : "Assign to me"}
                  </ActionButton>
                ) : null}

                {selectedJobId === job.id ? (
                  <View className="gap-3 rounded-xl bg-muted/40 p-3">
                    <FormField
                      label="Evidence label"
                      onChangeText={setEvidenceLabel}
                      placeholder="Condition photo"
                      value={evidenceLabel}
                    />
                    <FormField
                      autoCapitalize="none"
                      autoCorrect={false}
                      inputMode="url"
                      keyboardType="url"
                      label="Evidence link"
                      onChangeText={setEvidenceUrl}
                      placeholder="https://..."
                      value={evidenceUrl}
                    />
                    <ActionButton
                      disabled={!evidenceUrl.trim()}
                      isLoading={evidenceMutation.isPending}
                      onPress={() =>
                        evidenceMutation.mutate({
                          jobId: job.id,
                          label: evidenceLabel.trim() || "Service evidence",
                          url: evidenceUrl.trim(),
                        })
                      }
                    >
                      Add evidence
                    </ActionButton>
                    <View className="h-px bg-border" />
                    <FormField
                      autoCapitalize="none"
                      label="Revised due date"
                      onChangeText={setRevisedDueAt}
                      placeholder="2026-07-20 16:00"
                      value={revisedDueAt}
                    />
                    <FormField
                      label="Delay reason"
                      multiline
                      onChangeText={setDelayNote}
                      placeholder="Explain the delay to the customer"
                      value={delayNote}
                    />
                    <ActionButton
                      disabled={!revisedDueAt.trim() || !delayNote.trim()}
                      icon="Calendar"
                      isLoading={delayMutation.isPending}
                      onPress={() => {
                        const dueAt = new Date(
                          revisedDueAt.trim().replace(" ", "T"),
                        )
                        if (Number.isNaN(dueAt.getTime())) {
                          setError("Enter the due date as YYYY-MM-DD HH:mm.")
                          return
                        }
                        delayMutation.mutate({
                          dueAt,
                          jobId: job.id,
                          note: delayNote.trim(),
                        })
                      }}
                      variant="outline"
                    >
                      Save delay
                    </ActionButton>
                    {job.status !== "completed" &&
                    job.status !== "cancelled" ? (
                      <ActionButton
                        icon="XCircle"
                        isLoading={updateStatusMutation.isPending}
                        onPress={() =>
                          updateStatusMutation.mutate({
                            jobId: job.id,
                            note: delayNote.trim() || undefined,
                            status: "cancelled",
                          })
                        }
                        variant="destructive"
                      >
                        Cancel job
                      </ActionButton>
                    ) : null}
                  </View>
                ) : (
                  <ActionButton
                    icon="Camera"
                    onPress={() => setSelectedJobId(job.id)}
                    variant="ghost"
                  >
                    Add evidence
                  </ActionButton>
                )}
                <View className="min-h-[50px] pb-1">
                  <ActionButton
                    icon={copiedJobId === job.id ? "ClipboardCheck" : "Share"}
                    onPress={() => {
                      void Clipboard.setStringAsync(trackingUrl).then(() =>
                        setCopiedJobId(job.id),
                      )
                    }}
                    variant="ghost"
                  >
                    {copiedJobId === job.id
                      ? "Tracking link copied"
                      : "Copy tracking link"}
                  </ActionButton>
                </View>
              </View>
            )
          })}
        </View>
      )}
    </KeyboardAwareScrollView>
  )
}
