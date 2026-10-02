"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import {
  Badge,
  Button,
  ControlField,
  DateControl,
  Input,
  MoneyInput,
  SelectControl,
  SubmitButton,
  Textarea,
} from "@ewatrade/ui"

import {
  availableActions,
  formatMoney,
  label,
} from "@/components/service-work/service-utils"
import { useTRPC } from "@/trpc/client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

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
  const [messageChannel, setMessageChannel] = useState<"sms" | "whatsapp">(
    "whatsapp",
  )
  const [messageSchedule, setMessageSchedule] = useState("")
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<
    "bank_transfer" | "card" | "cash" | "other" | "pos"
  >("cash")
  const [paymentReference, setPaymentReference] = useState("")
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
      queryClient.invalidateQueries({
        queryKey: trpc.services.queuePage.queryKey(),
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
  const messageMutation = useMutation(
    trpc.serviceCommunications.createIntent.mutationOptions({
      onError: fail,
      onSuccess: async () => {
        setCustomerMessage("")
        setMessageSchedule("")
        await refresh()
      },
    }),
  )
  const paymentMutation = useMutation(
    trpc.orders.recordPayment.mutationOptions({
      onError: fail,
      onSuccess: async () => {
        setPaymentAmount("")
        setPaymentReference("")
        await refresh()
      },
    }),
  )
  const handoffMutation = useMutation(
    trpc.services.handoff.mutationOptions({
      onError: fail,
      onSuccess: refresh,
    }),
  )

  if (jobQuery.isLoading) {
    return (
      <div className="grid gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={`job-skeleton-${index + 1}`}
            className="h-14 animate-pulse bg-muted"
          />
        ))}
      </div>
    )
  }
  const job = jobQuery.data
  if (jobQuery.isError) {
    return (
      <div className="grid gap-3">
        <FormFeedback appearance="dashboard">
          {jobQuery.error.message}
        </FormFeedback>
        <Button
          appearance="form"
          variant="outline"
          className="w-fit"
          onClick={() => void jobQuery.refetch()}
        >
          Try again
        </Button>
      </div>
    )
  }
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
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
      {publicUrl ? (
        <div className="bg-primary/10 px-4 py-3 text-sm">
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
      <section className="grid gap-3 border-b border-border pb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-medium">Order and payment</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatMoney(job.amountPaidMinor, job.currencyCode)} paid ·{" "}
              {formatMoney(job.balanceDueMinor, job.currencyCode)} due
            </p>
          </div>
          <Badge className="rounded-full capitalize">
            {label(job.paymentStatus)}
          </Badge>
        </div>
        {job.balanceDueMinor > 0 ? (
          <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
            <ControlField label="Amount received">
              <MoneyInput
                currencyCode={job.currencyCode}
                inputMode="decimal"
                placeholder="Amount received"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
              />
            </ControlField>
            <ControlField label="Payment method">
              <SelectControl
                value={paymentMethod}
                onValueChange={(value) =>
                  setPaymentMethod(value as typeof paymentMethod)
                }
                options={[
                  { value: "cash", label: <>Cash</> },
                  { value: "bank_transfer", label: <>Bank transfer</> },
                  { value: "pos", label: <>POS</> },
                  { value: "card", label: <>Card</> },
                  { value: "other", label: <>Other</> },
                ]}
              />
            </ControlField>
            <ControlField label="Reference (optional)">
              <Input
                placeholder="Reference (optional)"
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
              />
            </ControlField>
            <SubmitButton
              type="button"
              isSubmitting={paymentMutation.isPending}
              size="sm"
              variant="outline"
              disabled={!paymentAmount || paymentMutation.isPending}
              onClick={() =>
                paymentMutation.mutate({
                  amountMinor: Math.round(Number(paymentAmount) * 100),
                  clientPaymentId: crypto.randomUUID(),
                  method: paymentMethod,
                  orderId: job.commercialOrderId,
                  reference: paymentReference.trim() || undefined,
                })
              }
            >
              Record payment
            </SubmitButton>
          </div>
        ) : null}
        {job.summary === "ready_for_handoff" && !job.handedOffAt ? (
          <SubmitButton
            type="button"
            isSubmitting={handoffMutation.isPending}
            disabled={
              handoffMutation.isPending ||
              (job.balanceDueMinor > 0 && !paymentAmount)
            }
            onClick={() =>
              handoffMutation.mutate({
                clientCommandId: crypto.randomUUID(),
                expectedRevision: job.revision,
                jobId: job.id,
                note: "Collected by customer",
                payment:
                  job.balanceDueMinor > 0
                    ? {
                        amountMinor: Math.round(Number(paymentAmount) * 100),
                        method: paymentMethod,
                        reference: paymentReference.trim() || undefined,
                      }
                    : undefined,
              })
            }
          >
            {job.balanceDueMinor > 0
              ? "Collect balance and hand over"
              : "Mark collected"}
          </SubmitButton>
        ) : job.handedOffAt ? (
          <p className="text-sm text-muted-foreground">
            Collected {new Date(job.handedOffAt).toLocaleString("en-NG")}.
          </p>
        ) : null}
      </section>
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
              <FormFeedback appearance="dashboard" variant="default">
                Work is waiting for {label(line.authorizationStatus)}.
              </FormFeedback>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {availableActions(line.status).map((action) => (
                <SubmitButton
                  type="button"
                  isSubmitting={
                    transitionMutation.isPending &&
                    transitionMutation.variables?.lineId === line.id &&
                    transitionMutation.variables?.toStatus === action
                  }
                  key={action}
                  size="sm"
                  variant={
                    action === "ready_for_handoff" ? "default" : "outline"
                  }
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
                </SubmitButton>
              ))}
            </div>
          </div>
        ))}
      </section>
      <section className="grid gap-3 border-t border-border pt-4">
        <h3 className="font-medium">Work record</h3>
        <ControlField label={<>Internal note</>}>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </ControlField>
        <SubmitButton
          type="button"
          isSubmitting={noteMutation.isPending}
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
        </SubmitButton>
        {job.notes.map((entry) => (
          <p className="bg-muted px-3 py-2 text-sm" key={entry.id}>
            {entry.body}
          </p>
        ))}
        <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
          <ControlField label="Exception type">
            <SelectControl
              value={exceptionType}
              onValueChange={(value) =>
                setExceptionType(value as typeof exceptionType)
              }
              options={[
                { value: "delay", label: <>Delay</> },
                { value: "quality", label: <>Quality</> },
                { value: "failed_attempt", label: <>Failed attempt</> },
                { value: "customer_rejection", label: <>Customer rejection</> },
                { value: "other", label: <>Other</> },
              ]}
            />
          </ControlField>
          <ControlField label="Exception details">
            <Input
              placeholder="Exception details"
              value={managerReason}
              onChange={(event) => setManagerReason(event.target.value)}
            />
          </ControlField>
          <SubmitButton
            type="button"
            isSubmitting={exceptionMutation.isPending}
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
          </SubmitButton>
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
          <ControlField label="Label">
            <Input
              placeholder="Label"
              value={evidenceLabel}
              onChange={(event) => setEvidenceLabel(event.target.value)}
            />
          </ControlField>
          <ControlField label="Private asset reference (optional)">
            <Input
              placeholder="Private asset reference (optional)"
              value={evidenceReference}
              onChange={(event) => setEvidenceReference(event.target.value)}
            />
          </ControlField>
        </div>
        <SubmitButton
          type="button"
          isSubmitting={evidenceMutation.isPending}
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
        </SubmitButton>
        {job.evidence.map((entry) => (
          <div
            className="flex flex-wrap items-center justify-between gap-2 bg-muted px-3 py-2 text-sm"
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
                appearance="form"
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
                appearance="form"
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
          <ControlField label={<>Assignee</>}>
            <SelectControl
              value={assigneeId || job.currentAssigneeUserId || ""}
              onValueChange={(value) => setAssigneeId(value)}
              options={[
                { value: "", label: <>Choose team member</> },
                ...(assigneesQuery.data?.map((person) => ({
                  value: person.id,
                  label: person.name,
                })) ?? []),
              ]}
            />
          </ControlField>
          <SubmitButton
            type="button"
            isSubmitting={assignMutation.isPending}
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
          </SubmitButton>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <ControlField label="New promise">
              <DateControl
                type="datetime-local"
                value={rescheduleAt}
                onValueChange={(value) => setRescheduleAt(value)}
              />
            </ControlField>
            <ControlField label="Reason for new promise">
              <Input
                placeholder="Reason for new promise"
                value={managerReason}
                onChange={(event) => setManagerReason(event.target.value)}
              />
            </ControlField>
            <SubmitButton
              type="button"
              isSubmitting={rescheduleMutation.isPending}
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
            </SubmitButton>
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
                  <SubmitButton
                    type="button"
                    isSubmitting={
                      authorizeMutation.isPending &&
                      authorizeMutation.variables?.lineId === line.id
                    }
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
                  </SubmitButton>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <ControlField label="Quantity">
                    <Input
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
                  </ControlField>
                  <SubmitButton
                    type="button"
                    isSubmitting={
                      splitMutation.isPending &&
                      splitMutation.variables?.lineId === line.id
                    }
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
                  </SubmitButton>
                  <SubmitButton
                    type="button"
                    isSubmitting={
                      reworkMutation.isPending &&
                      reworkMutation.variables?.lineId === line.id
                    }
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
                  </SubmitButton>
                </div>
              </div>
            ))}
          </div>
          <SubmitButton
            type="button"
            isSubmitting={trackingMutation.isPending}
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
          </SubmitButton>
          <ControlField label={<>Customer update</>}>
            <Textarea
              value={customerMessage}
              onChange={(event) => setCustomerMessage(event.target.value)}
            />
          </ControlField>
          <div className="grid gap-2 sm:grid-cols-2">
            <ControlField label="Message channel">
              <SelectControl
                value={messageChannel}
                onValueChange={(value) =>
                  setMessageChannel(value as typeof messageChannel)
                }
                options={[
                  { value: "whatsapp", label: <>WhatsApp</> },
                  { value: "sms", label: <>SMS</> },
                ]}
              />
            </ControlField>
            <ControlField label="Schedule for (optional)">
              <DateControl
                type="datetime-local"
                value={messageSchedule}
                onValueChange={(value) => setMessageSchedule(value)}
              />
            </ControlField>
          </div>
          <SubmitButton
            type="button"
            isSubmitting={messageMutation.isPending}
            variant="outline"
            disabled={!customerMessage.trim() || messageMutation.isPending}
            onClick={() =>
              messageMutation.mutate({
                audienceKey: job.orderNumber,
                businessEventKey: `${job.id}:${crypto.randomUUID()}`,
                channel: messageChannel,
                jobId: job.id,
                renderedMessage: customerMessage.trim(),
                scheduledFor: messageSchedule
                  ? new Date(messageSchedule)
                  : undefined,
                templatePurpose: "manual_update",
              })
            }
          >
            {messageSchedule ? "Schedule customer update" : "Send update"}
          </SubmitButton>
        </section>
      ) : null}
    </div>
  )
}
