"use client"

import {
  availableActions,
  label,
} from "@/components/service-work/service-utils"
import { useTRPC } from "@/trpc/client"
import { Badge, Button } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
const areaClass = `${fieldClass} min-h-24 py-2`

export function ServiceJobWorkspace({
  canManage,
  jobId,
}: {
  canManage: boolean
  jobId: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const jobQuery = useQuery(
    trpc.services.getJob.queryOptions({ jobId }, { retry: false }),
  )
  const assigneesQuery = useQuery(
    trpc.services.assignees.queryOptions(undefined, {
      enabled: canManage,
      retry: false,
    }),
  )
  const [error, setError] = useState<string | null>(null)
  const [managerReason, setManagerReason] = useState("")
  const [assigneeId, setAssigneeId] = useState("")
  const [rescheduleAt, setRescheduleAt] = useState("")
  const [note, setNote] = useState("")
  const [exceptionType, setExceptionType] = useState<
    "customer_rejection" | "delay" | "failed_attempt" | "other" | "quality"
  >("delay")
  const [evidenceLabel, setEvidenceLabel] = useState("")
  const [evidenceReference, setEvidenceReference] = useState("")
  const [lineQuantities, setLineQuantities] = useState<Record<string, string>>(
    {},
  )
  const [customerMessage, setCustomerMessage] = useState("")
  const [publicUrl, setPublicUrl] = useState<string | null>(null)

  const refresh = async () => {
    setError(null)
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.services.getJob.queryKey({ jobId }),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.services.queue.queryKey(),
      }),
    ])
  }
  const fail = (failure: { message: string }) => setError(failure.message)
  const transitionMutation = useMutation(
    trpc.services.transitionLine.mutationOptions({
      onError: fail,
      onSuccess: refresh,
    }),
  )
  const assignMutation = useMutation(
    trpc.services.assignJob.mutationOptions({
      onError: fail,
      onSuccess: refresh,
    }),
  )
  const rescheduleMutation = useMutation(
    trpc.services.rescheduleJob.mutationOptions({
      onError: fail,
      onSuccess: refresh,
    }),
  )
  const authorizeMutation = useMutation(
    trpc.services.authorizeLine.mutationOptions({
      onError: fail,
      onSuccess: refresh,
    }),
  )
  const noteMutation = useMutation(
    trpc.services.addNote.mutationOptions({
      onError: fail,
      onSuccess: async () => {
        setNote("")
        await refresh()
      },
    }),
  )
  const exceptionMutation = useMutation(
    trpc.services.recordException.mutationOptions({
      onError: fail,
      onSuccess: refresh,
    }),
  )
  const evidenceMutation = useMutation(
    trpc.services.captureEvidence.mutationOptions({
      onError: fail,
      onSuccess: async () => {
        setEvidenceLabel("")
        setEvidenceReference("")
        await refresh()
      },
    }),
  )
  const publishEvidenceMutation = useMutation(
    trpc.services.publishEvidence.mutationOptions({
      onError: fail,
      onSuccess: refresh,
    }),
  )
  const revokeEvidenceMutation = useMutation(
    trpc.services.revokeEvidence.mutationOptions({
      onError: fail,
      onSuccess: refresh,
    }),
  )
  const splitMutation = useMutation(
    trpc.services.splitLine.mutationOptions({
      onError: fail,
      onSuccess: refresh,
    }),
  )
  const reworkMutation = useMutation(
    trpc.services.createRework.mutationOptions({
      onError: fail,
      onSuccess: refresh,
    }),
  )
  const trackingMutation = useMutation(
    trpc.serviceAccess.createTracking.mutationOptions({
      onError: fail,
      onSuccess: (result) => {
        const storefront =
          process.env.NEXT_PUBLIC_STOREFRONT_URL?.replace(/\/$/, "") ?? ""
        setPublicUrl(`${storefront}/service-tracking/${result.token}`)
      },
    }),
  )
  const manualShareMutation = useMutation(
    trpc.serviceCommunications.recordManualShare.mutationOptions({
      onError: fail,
      onSuccess: async () => {
        setCustomerMessage("")
        await refresh()
      },
    }),
  )
  const messageMutation = useMutation(
    trpc.serviceCommunications.createIntent.mutationOptions({
      onError: fail,
      onSuccess: (intent) =>
        manualShareMutation.mutate({
          channel: "manual",
          intentId: intent.id,
          note: "Shared from Job Workspace",
        }),
    }),
  )

  if (jobQuery.isLoading) {
    return (
      <div className="grid gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={`job-skeleton-${index + 1}`}
            className="h-14 animate-pulse rounded bg-muted"
          />
        ))}
      </div>
    )
  }
  const job = jobQuery.data
  if (!job) {
    return (
      <p className="text-sm text-muted-foreground">
        This Service Job is no longer available.
      </p>
    )
  }

  return (
    <div className="grid gap-5">
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {publicUrl ? (
        <div className="rounded-lg bg-primary/10 px-4 py-3 text-sm">
          <p className="font-medium">Customer tracking link ready</p>
          <a
            className="mt-2 block break-all text-primary underline"
            href={publicUrl}
            rel="noreferrer"
            target="_blank"
          >
            {publicUrl}
          </a>
        </div>
      ) : null}
      <section className="grid gap-3">
        <h3 className="font-medium">Work lines</h3>
        {job.lines.map((line) => (
          <div key={line.id} className="border-b border-border pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{line.catalogItemName}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {line.offeringName} · {line.allocatedQuantity}
                </p>
              </div>
              <Badge className="rounded-full capitalize">
                {label(line.status)}
              </Badge>
            </div>
            {line.authorizationStatus !== "AUTHORIZED" ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Work is waiting for {label(line.authorizationStatus)}.
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {availableActions(line.status).map((action) => (
                <Button
                  key={action}
                  size="sm"
                  variant={action === "completed" ? "default" : "outline"}
                  disabled={
                    transitionMutation.isPending ||
                    line.authorizationStatus !== "AUTHORIZED"
                  }
                  onClick={() =>
                    transitionMutation.mutate({
                      clientCommandId: crypto.randomUUID(),
                      expectedRevision: line.revision,
                      lineId: line.id,
                      reason:
                        action === "blocked" || action === "cancelled"
                          ? "Updated from Job Workspace"
                          : undefined,
                      schemaVersion: 1,
                      source: "dashboard_job_workspace",
                      toStatus: action,
                    })
                  }
                >
                  {label(action)}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </section>
      <section className="grid gap-3 border-t border-border pt-4">
        <h3 className="font-medium">Work record</h3>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Internal note</span>
          <textarea
            className={areaClass}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={!note.trim() || noteMutation.isPending}
          onClick={() =>
            noteMutation.mutate({
              body: note.trim(),
              clientCommandId: crypto.randomUUID(),
              jobId: job.id,
            })
          }
        >
          Add note
        </Button>
        {job.notes.map((entry) => (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm" key={entry.id}>
            {entry.body}
          </p>
        ))}
        <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
          <select
            className={fieldClass}
            value={exceptionType}
            onChange={(event) =>
              setExceptionType(event.target.value as typeof exceptionType)
            }
          >
            <option value="delay">Delay</option>
            <option value="quality">Quality</option>
            <option value="failed_attempt">Failed attempt</option>
            <option value="customer_rejection">Customer rejection</option>
            <option value="other">Other</option>
          </select>
          <input
            className={fieldClass}
            placeholder="Exception details"
            value={managerReason}
            onChange={(event) => setManagerReason(event.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!managerReason.trim() || exceptionMutation.isPending}
            onClick={() =>
              exceptionMutation.mutate({
                description: managerReason.trim(),
                jobId: job.id,
                type: exceptionType,
              })
            }
          >
            Record
          </Button>
        </div>
        {job.exceptions.map((entry) => (
          <p className="text-sm text-muted-foreground" key={entry.id}>
            <span className="font-medium capitalize text-foreground">
              {label(entry.type)}
            </span>{" "}
            · {entry.description}
          </p>
        ))}
      </section>
      <section className="grid gap-3 border-t border-border pt-4">
        <div>
          <h3 className="font-medium">Private evidence</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Capture is optional. Add a private reference only when your managed
            media system provides one. Trusted safety processing and a manager
            are both required before publication.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className={fieldClass}
            placeholder="Label"
            value={evidenceLabel}
            onChange={(event) => setEvidenceLabel(event.target.value)}
          />
          <input
            className={fieldClass}
            placeholder="Private asset reference (optional)"
            value={evidenceReference}
            onChange={(event) => setEvidenceReference(event.target.value)}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={evidenceMutation.isPending}
          onClick={() =>
            evidenceMutation.mutate({
              assetReference: evidenceReference.trim() || undefined,
              capturedAt: new Date(),
              clientEvidenceId: crypto.randomUUID(),
              jobId: job.id,
              label: evidenceLabel.trim() || undefined,
              mediaType: "photo",
              purpose: "progress",
              uploadStatus: "local",
            })
          }
        >
          Add private evidence
        </Button>
        {job.evidence.map((entry) => (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm"
            key={entry.id}
          >
            <span>
              {entry.label || label(entry.purpose)} ·{" "}
              {label(entry.uploadStatus)} · {label(entry.visibility)}
            </span>
            {canManage &&
            entry.uploadStatus === "AVAILABLE" &&
            entry.visibility !== "PUBLISHED" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  publishEvidenceMutation.mutate({ evidenceId: entry.id })
                }
              >
                Publish
              </Button>
            ) : canManage && entry.visibility === "PUBLISHED" ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  revokeEvidenceMutation.mutate({
                    evidenceId: entry.id,
                    reason: "Revoked from Job Workspace",
                  })
                }
              >
                Revoke
              </Button>
            ) : null}
          </div>
        ))}
      </section>
      {canManage ? (
        <section className="grid gap-4 border-t border-border pt-4">
          <div>
            <h3 className="font-medium">Manager controls</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Assignment and promises retain their complete history.
            </p>
          </div>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Assignee</span>
            <select
              className={fieldClass}
              value={assigneeId || job.currentAssigneeUserId || ""}
              onChange={(event) => setAssigneeId(event.target.value)}
            >
              <option value="">Choose team member</option>
              {assigneesQuery.data?.map((person) => (
                <option value={person.id} key={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={!assigneeId || assignMutation.isPending}
            onClick={() =>
              assignMutation.mutate({
                assigneeUserId: assigneeId,
                expectedRevision: job.revision,
                jobId: job.id,
                reason: managerReason.trim() || undefined,
              })
            }
          >
            Assign
          </Button>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              type="datetime-local"
              className={fieldClass}
              value={rescheduleAt}
              onChange={(event) => setRescheduleAt(event.target.value)}
            />
            <input
              className={fieldClass}
              placeholder="Reason for new promise"
              value={managerReason}
              onChange={(event) => setManagerReason(event.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={
                !rescheduleAt ||
                !managerReason.trim() ||
                rescheduleMutation.isPending
              }
              onClick={() =>
                rescheduleMutation.mutate({
                  expectedRevision: job.revision,
                  jobId: job.id,
                  promisedAt: new Date(rescheduleAt),
                  reason: managerReason.trim(),
                })
              }
            >
              Reschedule
            </Button>
          </div>
          <div className="grid gap-3 border-t border-border pt-3">
            {job.lines.map((line) => (
              <div
                className="grid gap-2 bg-muted p-3"
                key={`manage-${line.id}`}
              >
                <p className="text-sm font-medium">
                  {line.catalogItemName} · {line.allocatedQuantity}
                </p>
                {line.authorizationStatus !== "AUTHORIZED" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !managerReason.trim() || authorizeMutation.isPending
                    }
                    onClick={() =>
                      authorizeMutation.mutate({
                        clientCommandId: crypto.randomUUID(),
                        expectedRevision: line.revision,
                        lineId: line.id,
                        reason: managerReason.trim(),
                        source:
                          line.authorizationStatus === "PENDING_PAYMENT"
                            ? "payment"
                            : "manual_release",
                      })
                    }
                  >
                    Authorize work
                  </Button>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <input
                    className={fieldClass}
                    inputMode="decimal"
                    placeholder="Quantity"
                    value={lineQuantities[line.id] ?? ""}
                    onChange={(event) =>
                      setLineQuantities((current) => ({
                        ...current,
                        [line.id]: event.target.value,
                      }))
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !lineQuantities[line.id] ||
                      !managerReason.trim() ||
                      splitMutation.isPending
                    }
                    onClick={() => {
                      const quantity = lineQuantities[line.id]
                      if (!quantity) return
                      splitMutation.mutate({
                        clientCommandId: crypto.randomUUID(),
                        expectedRevision: line.revision,
                        lineId: line.id,
                        quantity,
                        reason: managerReason.trim(),
                      })
                    }}
                  >
                    Split
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !lineQuantities[line.id] ||
                      !managerReason.trim() ||
                      reworkMutation.isPending
                    }
                    onClick={() => {
                      const quantity = lineQuantities[line.id]
                      if (!quantity) return
                      reworkMutation.mutate({
                        clientCommandId: crypto.randomUUID(),
                        lineId: line.id,
                        quantity,
                        reason: managerReason.trim(),
                      })
                    }}
                  >
                    Rework
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            disabled={trackingMutation.isPending}
            onClick={() =>
              trackingMutation.mutate({
                customerScopeKey: job.orderNumber,
                jobId: job.id,
              })
            }
          >
            Create customer tracking link
          </Button>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Customer update</span>
            <textarea
              className={areaClass}
              value={customerMessage}
              onChange={(event) => setCustomerMessage(event.target.value)}
            />
          </label>
          <Button
            variant="outline"
            disabled={
              !customerMessage.trim() ||
              messageMutation.isPending ||
              manualShareMutation.isPending
            }
            onClick={() =>
              messageMutation.mutate({
                audienceKey: job.orderNumber,
                businessEventKey: `${job.id}:${crypto.randomUUID()}`,
                jobId: job.id,
                renderedMessage: customerMessage.trim(),
                templatePurpose: "manual_update",
              })
            }
          >
            Record customer-safe update
          </Button>
        </section>
      ) : null}
    </div>
  )
}
