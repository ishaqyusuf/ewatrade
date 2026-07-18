"use client"

import { DashboardSheet } from "@/components/dashboard/dashboard-sheet"
import { DashboardTable } from "@/components/dashboard/dashboard-table"
import { formatMinorAmount } from "@/lib/sales-operations"
import { useTRPC } from "@/trpc/client"
import { cn } from "@/utils"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge, Button } from "@ewatrade/ui"
import {
  Add01Icon,
  Calendar03Icon,
  CheckmarkCircle01Icon,
  Copy01Icon,
  Search01Icon,
  ToolsIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import type {
  FormEvent,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react"
import { useMemo, useState } from "react"

type ServiceJob = RouterOutputs["retailOps"]["serviceJobs"][number]
type ServiceJobStatus = ServiceJob["status"]
type ServiceRequest = RouterOutputs["retailOps"]["serviceRequests"][number]

type StoreSummary = {
  currencyCode: string
  id: string
  name: string
}

type JobActionForm = {
  assignedUserId: string
  dueAt: string
  evidenceLabel: string
  evidenceUrl: string
  note: string
  status: ServiceJobStatus
}

const emptyJobActionForm: JobActionForm = {
  assignedUserId: "",
  dueAt: "",
  evidenceLabel: "",
  evidenceUrl: "",
  note: "",
  status: "received",
}

const statusLabels: Record<ServiceJobStatus, string> = {
  cancelled: "Cancelled",
  completed: "Completed",
  in_progress: "In progress",
  ready: "Ready",
  received: "Received",
}

const statusTones: Record<ServiceJobStatus, string> = {
  cancelled: "bg-muted text-muted-foreground",
  completed: "bg-emerald-50 text-emerald-700",
  in_progress: "bg-blue-50 text-blue-700",
  ready: "bg-violet-50 text-violet-700",
  received: "bg-amber-50 text-amber-700",
}

function Field({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: Every Field call supplies its form control as the child.
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20",
        props.className,
      )}
    />
  )
}

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-[88px] rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20",
        props.className,
      )}
    />
  )
}

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20",
        props.className,
      )}
    />
  )
}

function formatDateTime(value: string | null) {
  if (!value) return "No due date"
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function getRequestLinkUrl(token: string) {
  if (typeof window === "undefined") return `/service-request/${token}`
  return `${window.location.origin}/service-request/${token}`
}

function getTrackingUrl(token: string) {
  if (typeof window === "undefined") return `/service-tracking/${token}`
  return `${window.location.origin}/service-tracking/${token}`
}

export function ServiceJobsPage({
  canManage,
  store,
}: {
  canManage: boolean
  store: StoreSummary
}) {
  const trpc = useTRPC()
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<ServiceJobStatus | "">("")
  const [selectedJob, setSelectedJob] = useState<ServiceJob | null>(null)
  const [jobForm, setJobForm] = useState<JobActionForm>(emptyJobActionForm)
  const [requestLinkOpen, setRequestLinkOpen] = useState(false)
  const [requestLinkLabel, setRequestLinkLabel] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const jobsQuery = useQuery(
    trpc.retailOps.serviceJobs.queryOptions(
      { limit: 100, status: status || undefined, storeId: store.id },
      { retry: false },
    ),
  )
  const requestsQuery = useQuery(
    trpc.retailOps.serviceRequests.queryOptions(
      { limit: 100, storeId: store.id },
      { retry: false },
    ),
  )
  const linksQuery = useQuery(
    trpc.retailOps.serviceRequestLinks.queryOptions(
      { storeId: store.id },
      { enabled: canManage, retry: false },
    ),
  )
  const reportQuery = useQuery(
    trpc.retailOps.serviceOperationsReport.queryOptions(
      { storeId: store.id },
      { enabled: canManage, retry: false },
    ),
  )
  const staffQuery = useQuery(
    trpc.retailOps.staff.queryOptions(
      { status: "active", storeId: store.id },
      { enabled: canManage, retry: false },
    ),
  )

  const jobs = jobsQuery.data ?? []
  const requests = requestsQuery.data ?? []
  const links = linksQuery.data ?? []
  const report = reportQuery.data

  const refreshOperations = () => {
    void jobsQuery.refetch()
    void requestsQuery.refetch()
    void linksQuery.refetch()
    void reportQuery.refetch()
  }

  const operationSuccess = (message: string) => {
    setError(null)
    setNotice(message)
    refreshOperations()
  }
  const mutationError = (mutationFailure: { message: string }) =>
    setError(mutationFailure.message)

  const statusMutation = useMutation(
    trpc.retailOps.updateServiceJobStatus.mutationOptions({
      onError: mutationError,
      onSuccess: () => {
        setSelectedJob(null)
        operationSuccess("Service job status updated.")
      },
    }),
  )
  const assignmentMutation = useMutation(
    trpc.retailOps.assignServiceJob.mutationOptions({
      onError: mutationError,
      onSuccess: () => {
        setSelectedJob(null)
        operationSuccess("Service job assignment updated.")
      },
    }),
  )
  const cancelLineMutation = useMutation(
    trpc.retailOps.cancelOrderLine.mutationOptions({
      onError: mutationError,
      onSuccess: (result) => {
        setSelectedJob(null)
        operationSuccess(
          result.refund
            ? "Service line cancelled, refund recorded, and order audit updated."
            : "Service line cancelled and the order audit updated.",
        )
      },
    }),
  )
  const delayMutation = useMutation(
    trpc.retailOps.delayServiceJob.mutationOptions({
      onError: mutationError,
      onSuccess: (job) => {
        setSelectedJob(null)
        operationSuccess(
          `Due date changed. Message prepared: ${job.notificationIntent.manualCopy}`,
        )
      },
    }),
  )
  const evidenceMutation = useMutation(
    trpc.retailOps.addServiceJobEvidence.mutationOptions({
      onError: mutationError,
      onSuccess: () => {
        setSelectedJob(null)
        operationSuccess("Evidence added to the service job.")
      },
    }),
  )
  const readyNotificationMutation = useMutation(
    trpc.retailOps.queueServiceReadyNotification.mutationOptions({
      onError: mutationError,
      onSuccess: (intent) =>
        operationSuccess(`Message prepared: ${intent.manualCopy}`),
    }),
  )
  const createLinkMutation = useMutation(
    trpc.retailOps.createServiceRequestLink.mutationOptions({
      onError: mutationError,
      onSuccess: (link) => {
        setRequestLinkLabel("")
        setRequestLinkOpen(false)
        operationSuccess(
          `Request link created: ${getRequestLinkUrl(link.token)}`,
        )
      },
    }),
  )
  const disableLinkMutation = useMutation(
    trpc.retailOps.disableServiceRequestLink.mutationOptions({
      onError: mutationError,
      onSuccess: () => operationSuccess("Request link disabled."),
    }),
  )
  const requestStatusMutation = useMutation(
    trpc.retailOps.updateServiceRequestStatus.mutationOptions({
      onError: mutationError,
      onSuccess: () => operationSuccess("Service request updated."),
    }),
  )
  const convertRequestMutation = useMutation(
    trpc.retailOps.convertServiceRequest.mutationOptions({
      onError: mutationError,
      onSuccess: () =>
        operationSuccess("Service request converted to a sale and job."),
    }),
  )

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return jobs

    return jobs.filter((job) =>
      [
        job.customer.email ?? "",
        job.customer.name ?? "",
        job.customer.phone ?? "",
        job.order.orderNumber,
        job.status,
        job.trackingToken,
        ...job.lines.map((line) => line.itemName),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    )
  }, [jobs, search])

  const dueToday = useMemo(() => {
    const dayEnd = new Date()
    dayEnd.setHours(23, 59, 59, 999)
    return jobs.filter(
      (job) =>
        job.dueAt &&
        new Date(job.dueAt) <= dayEnd &&
        job.status !== "completed" &&
        job.status !== "cancelled",
    ).length
  }, [jobs])

  function openJob(job: ServiceJob) {
    setError(null)
    setNotice(null)
    setSelectedJob(job)
    setJobForm({
      ...emptyJobActionForm,
      assignedUserId: job.assignedUserId ?? "",
      dueAt: job.dueAt ? new Date(job.dueAt).toISOString().slice(0, 16) : "",
      status: job.status,
    })
  }

  function submitStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedJob) return
    statusMutation.mutate({
      jobId: selectedJob.id,
      note: jobForm.note.trim() || undefined,
      status: jobForm.status,
      storeId: store.id,
    })
  }

  function submitDelay() {
    if (!selectedJob || !jobForm.dueAt || !jobForm.note.trim()) {
      setError("Choose the new due date and add a delay reason.")
      return
    }
    delayMutation.mutate({
      dueAt: new Date(jobForm.dueAt),
      jobId: selectedJob.id,
      note: jobForm.note.trim(),
      storeId: store.id,
    })
  }

  function submitEvidence() {
    if (!selectedJob || !jobForm.evidenceUrl.trim()) {
      setError("Enter a valid evidence URL.")
      return
    }
    evidenceMutation.mutate({
      jobId: selectedJob.id,
      label: jobForm.evidenceLabel.trim() || undefined,
      storeId: store.id,
      url: jobForm.evidenceUrl.trim(),
    })
  }

  function submitRequestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!requestLinkLabel.trim()) return
    createLinkMutation.mutate({
      label: requestLinkLabel.trim(),
      storeId: store.id,
    })
  }

  async function copyText(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value)
      setNotice(successMessage)
    } catch {
      setError("Copy failed. Select and copy the link manually.")
    }
  }

  const isJobSaving =
    statusMutation.isPending ||
    assignmentMutation.isPending ||
    cancelLineMutation.isPending ||
    delayMutation.isPending ||
    evidenceMutation.isPending

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <HugeiconsIcon icon={ToolsIcon} className="size-4" />
            Service operations
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Service jobs
          </h1>
          <p className="text-sm text-muted-foreground">
            Track due work for every service business.
          </p>
        </div>
        {canManage ? (
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-lg"
            onClick={() => setRequestLinkOpen(true)}
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            Request link
          </Button>
        ) : null}
      </div>

      {error ||
      jobsQuery.error ||
      requestsQuery.error ||
      linksQuery.error ||
      reportQuery.error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error ??
            jobsQuery.error?.message ??
            requestsQuery.error?.message ??
            linksQuery.error?.message ??
            reportQuery.error?.message}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Jobs", report?.jobCount ?? jobs.length],
          ["Due now", dueToday],
          ["Ready", report?.statusCounts.ready ?? 0],
          [
            "Revenue",
            formatMinorAmount(report?.revenueMinor ?? 0, store.currencyCode),
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-border bg-background p-4"
          >
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {value}
            </p>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <HugeiconsIcon
              icon={Search01Icon}
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search jobs"
              className="pl-9"
            />
          </div>
          <Select
            aria-label="Job status"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as ServiceJobStatus | "")
            }
            className="md:w-[180px]"
          >
            <option value="">All statuses</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        <DashboardTable
          rows={filteredJobs}
          isLoading={jobsQuery.isLoading}
          getRowKey={(job) => job.id}
          emptyState={
            <div className="flex flex-col items-center gap-3 text-center">
              <HugeiconsIcon
                icon={CheckmarkCircle01Icon}
                className="size-8 text-muted-foreground"
              />
              <div>
                <p className="text-sm font-medium">No service jobs found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Selling a tracked Service creates its job automatically.
                </p>
              </div>
            </div>
          }
          columns={[
            {
              header: "Job",
              key: "job",
              render: (job) => (
                <div>
                  <p className="font-medium">{job.order.orderNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {job.customer.name || "Walk-in customer"}
                  </p>
                </div>
              ),
            },
            {
              header: "Services",
              key: "services",
              render: (job) => (
                <div>
                  <p>{job.lines.map((line) => line.itemName).join(", ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {job.lines.reduce(
                      (total, line) => total + line.quantity,
                      0,
                    )}{" "}
                    item(s)
                  </p>
                </div>
              ),
            },
            {
              header: "Due",
              key: "due",
              render: (job) => (
                <span className="text-muted-foreground">
                  {formatDateTime(job.dueAt)}
                </span>
              ),
            },
            {
              header: "Status",
              key: "status",
              render: (job) => (
                <Badge className={cn("rounded-full", statusTones[job.status])}>
                  {statusLabels[job.status]}
                </Badge>
              ),
            },
            {
              header: "Total",
              key: "total",
              render: (job) =>
                formatMinorAmount(job.order.totalMinor, job.order.currencyCode),
            },
            {
              className: "text-right",
              header: "Action",
              key: "action",
              render: (job) => (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => openJob(job)}
                >
                  Manage
                </Button>
              ),
            },
          ]}
        />
      </section>

      <section className={cn("grid gap-4", canManage ? "xl:grid-cols-2" : "")}>
        <div className="rounded-lg border border-border bg-background p-5">
          <div className="mb-4">
            <h2 className="font-semibold">Customer requests</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Confirm a request, then convert it into a sale and service job.
            </p>
          </div>
          <div className="grid gap-3">
            {requests.slice(0, 8).map((request) => (
              <div
                key={request.id}
                className="flex flex-col gap-3 rounded-lg border border-border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{request.customerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {request.lines.map((line) => line.itemName).join(", ")}
                    </p>
                  </div>
                  <Badge className="rounded-full capitalize">
                    {request.status}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {formatMinorAmount(
                      request.totalMinor,
                      request.currencyCode,
                    )}
                  </span>
                  {request.status === "pending" ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          requestStatusMutation.mutate({
                            requestId: request.id,
                            status: "confirmed",
                            storeId: store.id,
                          })
                        }
                      >
                        Confirm
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          requestStatusMutation.mutate({
                            requestId: request.id,
                            status: "rejected",
                            storeId: store.id,
                          })
                        }
                      >
                        Reject
                      </Button>
                    </div>
                  ) : request.status === "confirmed" ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        convertRequestMutation.mutate({
                          paymentMethod: "cash",
                          requestId: request.id,
                          storeId: store.id,
                        })
                      }
                    >
                      Convert to job
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            {!requestsQuery.isLoading && requests.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No service requests yet.
              </p>
            ) : null}
          </div>
        </div>

        {canManage ? (
          <div className="rounded-lg border border-border bg-background p-5">
            <div className="mb-4">
              <h2 className="font-semibold">Request links</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Share a link so customers can choose from active Service items.
              </p>
            </div>
            <div className="grid gap-3">
              {links.map((link) => {
                const url = getRequestLinkUrl(link.token)
                return (
                  <div
                    key={link.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{link.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {link.disabledAt ? "Disabled" : url}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {!link.disabledAt ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            aria-label="Copy request link"
                            onClick={() =>
                              void copyText(url, "Request link copied.")
                            }
                          >
                            <HugeiconsIcon
                              icon={Copy01Icon}
                              className="size-4"
                            />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              disableLinkMutation.mutate({
                                linkId: link.id,
                                storeId: store.id,
                              })
                            }
                          >
                            Disable
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                )
              })}
              {!linksQuery.isLoading && links.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Create a request link when you are ready to accept online
                  requests.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <DashboardSheet
        open={selectedJob !== null}
        onClose={() => setSelectedJob(null)}
        title={selectedJob?.order.orderNumber ?? "Service job"}
        description={
          selectedJob
            ? `${selectedJob.customer.name || "Walk-in customer"} · ${statusLabels[selectedJob.status]}`
            : undefined
        }
      >
        {selectedJob ? (
          <div className="grid gap-5">
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Tracking
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="truncate text-sm">
                  {getTrackingUrl(selectedJob.trackingToken)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Copy tracking link"
                  onClick={() =>
                    void copyText(
                      getTrackingUrl(selectedJob.trackingToken),
                      "Tracking link copied.",
                    )
                  }
                >
                  <HugeiconsIcon icon={Copy01Icon} className="size-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-3 rounded-lg border border-border p-4">
              <h3 className="font-medium">Service lines</h3>
              {selectedJob.lines.map((line) => (
                <div
                  key={line.id}
                  className="flex flex-col gap-3 border-border border-t pt-3 first:border-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {line.quantity} × {line.itemName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {line.cancelledAt
                        ? "Cancelled"
                        : formatMinorAmount(
                            line.totalMinor,
                            selectedJob.order.currencyCode,
                          )}
                    </p>
                  </div>
                  {canManage &&
                  !line.cancelledAt &&
                  selectedJob.status !== "completed" &&
                  selectedJob.status !== "cancelled" ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isJobSaving}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Cancel ${line.itemName} without recording a refund?`,
                            )
                          ) {
                            return
                          }
                          cancelLineMutation.mutate({
                            externalId: crypto.randomUUID(),
                            note: "Service line cancelled by a manager.",
                            orderItemId: line.orderItemId,
                            storeId: store.id,
                          })
                        }}
                      >
                        Cancel only
                      </Button>
                      {selectedJob.order.paymentStatus === "PAID" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={isJobSaving}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Cancel ${line.itemName} and record a ${formatMinorAmount(
                                  line.totalMinor,
                                  selectedJob.order.currencyCode,
                                )} cash refund?`,
                              )
                            ) {
                              return
                            }
                            cancelLineMutation.mutate({
                              externalId: crypto.randomUUID(),
                              note: "Service line cancelled and refunded by a manager.",
                              orderItemId: line.orderItemId,
                              refundAmountMinor: line.totalMinor,
                              refundMethod: "cash",
                              storeId: store.id,
                            })
                          }}
                        >
                          Cancel + refund
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <form className="grid gap-3" onSubmit={submitStatus}>
              <h3 className="font-medium">Update status</h3>
              <Field label="Status">
                <Select
                  value={jobForm.status}
                  onChange={(event) =>
                    setJobForm((current) => ({
                      ...current,
                      status: event.target.value as ServiceJobStatus,
                    }))
                  }
                >
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Note">
                <TextArea
                  value={jobForm.note}
                  onChange={(event) =>
                    setJobForm((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                />
              </Field>
              <Button type="submit" disabled={isJobSaving}>
                Save status
              </Button>
              {jobForm.status === "ready" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    readyNotificationMutation.mutate({
                      jobId: selectedJob.id,
                      storeId: store.id,
                    })
                  }
                >
                  Prepare ready message
                </Button>
              ) : null}
            </form>

            <div className="grid gap-3 border-t border-border pt-5">
              <h3 className="font-medium">Assignment</h3>
              {canManage ? (
                <Field label="Assigned staff">
                  <Select
                    value={jobForm.assignedUserId}
                    onChange={(event) =>
                      setJobForm((current) => ({
                        ...current,
                        assignedUserId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Unassigned</option>
                    {(staffQuery.data ?? []).map((staff) => (
                      <option key={staff.user.id} value={staff.user.id}>
                        {staff.user.displayName ||
                          staff.user.name ||
                          staff.user.email}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {selectedJob.assignedUserId
                    ? "Assigned to a staff member."
                    : "This job is unassigned."}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={isJobSaving}
                onClick={() =>
                  assignmentMutation.mutate({
                    assignedUserId: canManage
                      ? jobForm.assignedUserId || null
                      : undefined,
                    jobId: selectedJob.id,
                    storeId: store.id,
                  })
                }
              >
                {canManage ? "Save assignment" : "Assign to me"}
              </Button>
            </div>

            <div className="grid gap-3 border-t border-border pt-5">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={Calendar03Icon} className="size-4" />
                <h3 className="font-medium">Change due date</h3>
              </div>
              <Field label="New due date">
                <TextInput
                  type="datetime-local"
                  value={jobForm.dueAt}
                  onChange={(event) =>
                    setJobForm((current) => ({
                      ...current,
                      dueAt: event.target.value,
                    }))
                  }
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                disabled={isJobSaving}
                onClick={submitDelay}
              >
                Save delay
              </Button>
            </div>

            <div className="grid gap-3 border-t border-border pt-5">
              <h3 className="font-medium">Add evidence</h3>
              <Field label="Label">
                <TextInput
                  value={jobForm.evidenceLabel}
                  onChange={(event) =>
                    setJobForm((current) => ({
                      ...current,
                      evidenceLabel: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Evidence URL">
                <TextInput
                  type="url"
                  value={jobForm.evidenceUrl}
                  onChange={(event) =>
                    setJobForm((current) => ({
                      ...current,
                      evidenceUrl: event.target.value,
                    }))
                  }
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                disabled={isJobSaving}
                onClick={submitEvidence}
              >
                Add evidence
              </Button>
            </div>
          </div>
        ) : null}
      </DashboardSheet>

      <DashboardSheet
        open={requestLinkOpen}
        onClose={() => setRequestLinkOpen(false)}
        title="Create request link"
        description="Customers see only active Service items."
      >
        <form className="grid gap-4" onSubmit={submitRequestLink}>
          <Field label="Link label">
            <TextInput
              value={requestLinkLabel}
              onChange={(event) => setRequestLinkLabel(event.target.value)}
              placeholder="Website service request"
              required
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRequestLinkOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createLinkMutation.isPending}>
              Create link
            </Button>
          </div>
        </form>
      </DashboardSheet>
    </div>
  )
}
