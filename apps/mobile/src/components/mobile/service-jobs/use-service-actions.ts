import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import { formatMinorMoney } from "@ewatrade/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import type { WorkJob } from "./service-jobs-model"
import {
  projectServicePayment,
  type ServicePaymentFields,
} from "./service-payment-model"
import type { ServiceTextFields } from "./service-text-sheet"
import type {
  PreparedServiceAction,
  ServiceCommandModel,
} from "./use-service-command"

type ActionOptions = {
  selectedJob: WorkJob | undefined
  storeId: string | undefined
  userId: string | undefined
  canManage: boolean
  command: ServiceCommandModel
  requireJob: (job: WorkJob) => boolean
  acceptedAction: (
    message: string,
    apply?: () => void,
  ) => Awaited<ReturnType<PreparedServiceAction["execute"]>>
  setError: (error: string) => void
  amountPaid: string
  paymentMethod: ServicePaymentFields["method"]
  paymentReference: string
  jobNote: string
  customerMessage: string
  notificationChannel: ServiceTextFields["channel"]
  clearPayment: () => void
  clearNote: () => void
  clearMessage: () => void
  onCollected: () => void
}

// One command owner for both appearances. Inputs are captured before review;
// the runner, not query invalidation, decides whether a command was accepted.
export function useServiceActions({
  selectedJob,
  storeId,
  userId,
  canManage,
  command,
  requireJob,
  acceptedAction,
  setError,
  amountPaid,
  paymentMethod,
  paymentReference,
  jobNote,
  customerMessage,
  notificationChannel,
  clearPayment,
  clearNote,
  clearMessage,
  onCollected,
}: ActionOptions) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const transitionMutation = useMutation(
    trpc.services.transitionLine.mutationOptions({ retry: false }),
  )
  const noteMutation = useMutation(
    trpc.services.addNote.mutationOptions({ retry: false }),
  )
  const assignMutation = useMutation(
    trpc.services.assignJob.mutationOptions({ retry: false }),
  )
  const paymentMutation = useMutation(
    trpc.orders.recordPayment.mutationOptions({ retry: false }),
  )
  const handoffMutation = useMutation(
    trpc.services.handoff.mutationOptions({ retry: false }),
  )
  const messageMutation = useMutation(
    trpc.serviceCommunications.createIntent.mutationOptions({ retry: false }),
  )
  function transition(
    line: WorkJob["lines"][number],
    toStatus:
      | "blocked"
      | "cancelled"
      | "completed"
      | "in_progress"
      | "ready_for_handoff",
    reason = "",
    onDiscard?: () => void,
  ) {
    if (!selectedJob || !requireJob(selectedJob)) return false
    if (line.authorizationStatus !== "AUTHORIZED") {
      setError("This work line is not authorized.")
      return false
    }
    if (
      (toStatus === "blocked" || toStatus === "cancelled") &&
      !reason.trim()
    ) {
      setError("Enter a reason before blocking or cancelling work.")
      return false
    }
    if (reason.trim().length > 500) {
      setError("Keep the reason to 500 characters.")
      return false
    }
    const input: RouterInputs["services"]["transitionLine"] = {
      clientCommandId: "service-" + Crypto.randomUUID(),
      expectedRevision: line.revision,
      lineId: line.id,
      reason: reason.trim() || undefined,
      toStatus,
      schemaVersion: 1,
      source: "mobile_job_workspace",
    }
    return command.stage({
      kind: "transition",
      title: "Review work status",
      onDiscard,
      facts: [
        { label: "Job", value: selectedJob.orderNumber },
        {
          label: "Work",
          value: line.catalogItemName + " · " + line.allocatedQuantity,
        },
        { label: "New status", value: toStatus.replaceAll("_", " ") },
        { label: "Reason", value: reason.trim() || "Not required" },
      ],
      execute: async () => {
        await transitionMutation.mutateAsync(input)
        return acceptedAction("Work status recorded.")
      },
    })
  }
  function addNote(job: WorkJob, note = jobNote, onDiscard?: () => void) {
    if (!requireJob(job)) return false
    const body = note.trim()
    if (!body || body.length > 4000) {
      setError("Enter an internal note of 1–4000 characters.")
      return false
    }
    const input = {
      body,
      clientCommandId: "note-" + Crypto.randomUUID(),
      jobId: job.id,
    }
    return command.stage({
      kind: "note",
      title: "Review internal note",
      onDiscard,
      facts: [
        { label: "Job", value: job.orderNumber },
        { label: "Private note", value: body },
      ],
      execute: async () => {
        await noteMutation.mutateAsync(input)
        return acceptedAction("Internal note recorded.", clearNote)
      },
    })
  }
  function assignToMe(job: WorkJob) {
    if (!requireJob(job) || !userId) return false
    const input = {
      assigneeUserId: userId,
      expectedRevision: job.revision,
      jobId: job.id,
      reason: "Self-assigned from mobile",
    }
    let dispatched = false
    return command.stage({
      kind: "assignment",
      title: "Review assignment",
      facts: [
        { label: "Job", value: job.orderNumber },
        { label: "Assignment", value: "Assign to me" },
      ],
      execute: async () => {
        if (dispatched) {
          const current = await queryClient.fetchQuery({
            ...trpc.services.getJob.queryOptions({ jobId: input.jobId }),
            staleTime: 0,
          })
          if (!command.canAct())
            throw new Error("Workspace changed while checking assignment.")
          if (current.storeId !== storeId)
            throw new Error("The job no longer matches this Store.")
          if (current.currentAssigneeUserId === input.assigneeUserId)
            return acceptedAction("The current assignment already matches you.")
          if (current.revision !== input.expectedRevision)
            throw new Error(
              "The job changed. Reconcile its assignment before attempting another change.",
            )
        }
        dispatched = true
        await assignMutation.mutateAsync(input)
        return acceptedAction("Job assigned to you.")
      },
    })
  }
  function recordPayment(
    job: WorkJob,
    fields: ServicePaymentFields = {
      amount: amountPaid,
      method: paymentMethod,
      reference: paymentReference,
    },
    onDiscard?: () => void,
  ) {
    if (!requireJob(job)) return false
    const projection = projectServicePayment(job, "payment", fields)
    if (projection.amountMinor === null) {
      setError(projection.error)
      return false
    }
    const { amountMinor } = projection
    const input: RouterInputs["orders"]["recordPayment"] = {
      amountMinor,
      clientPaymentId: "payment-" + Crypto.randomUUID(),
      method: fields.method,
      orderId: job.commercialOrderId,
      reference: fields.reference.trim() || undefined,
    }
    return command.stage({
      kind: "payment",
      title: "Review payment",
      onDiscard,
      facts: [
        { label: "Job", value: job.orderNumber },
        {
          label: "Amount",
          value: formatMinorMoney(amountMinor, job.currencyCode),
        },
        { label: "Method", value: fields.method },
        { label: "Reference", value: input.reference ?? "Not provided" },
      ],
      execute: async () => {
        await paymentMutation.mutateAsync(input)
        return acceptedAction("Payment recorded.", clearPayment)
      },
    })
  }
  function handoff(
    job: WorkJob,
    fields: ServicePaymentFields = {
      amount: amountPaid,
      method: paymentMethod,
      reference: paymentReference,
    },
    onDiscard?: () => void,
  ) {
    if (!requireJob(job)) return false
    const projection = projectServicePayment(job, "handoff", fields)
    if (projection.amountMinor === null) {
      setError(projection.error)
      return false
    }
    const { amountMinor } = projection
    const input: RouterInputs["services"]["handoff"] = {
      clientCommandId: "handoff-" + Crypto.randomUUID(),
      expectedRevision: job.revision,
      jobId: job.id,
      note: "Collected by customer",
      payment:
        amountMinor > 0
          ? {
              amountMinor,
              method: fields.method,
              reference: fields.reference.trim() || undefined,
            }
          : undefined,
    }
    return command.stage({
      kind: "handoff",
      title: "Review collection",
      onDiscard,
      facts: [
        { label: "Job", value: job.orderNumber },
        {
          label: "Final payment",
          value: formatMinorMoney(amountMinor, job.currencyCode),
        },
        { label: "Result", value: "Mark collected and close the work" },
        ...(amountMinor > 0
          ? [
              { label: "Method", value: fields.method },
              {
                label: "Reference",
                value: fields.reference.trim() || "Not provided",
              },
            ]
          : []),
      ],
      execute: async () => {
        await handoffMutation.mutateAsync(input)
        return acceptedAction("Order collected and closed.", onCollected)
      },
    })
  }
  function notifyCustomer(
    job: WorkJob,
    fields: ServiceTextFields = {
      body: customerMessage,
      channel: notificationChannel,
    },
    onDiscard?: () => void,
  ) {
    if (!requireJob(job) || !canManage) return false
    const message = fields.body.trim()
    if (!fields.channel || !message || message.length > 4000) {
      setError("Choose a channel and enter a message of 1–4000 characters.")
      return false
    }
    const input = {
      audienceKey: job.orderNumber,
      businessEventKey: job.id + ":" + Crypto.randomUUID(),
      channel: fields.channel,
      jobId: job.id,
      renderedMessage: message,
      templatePurpose: "mobile_update",
    }
    return command.stage({
      kind: "message",
      title: "Review customer update",
      onDiscard,
      facts: [
        { label: "Job", value: job.orderNumber },
        { label: "Channel", value: fields.channel },
        { label: "Message", value: message },
        {
          label: "Delivery",
          value: "Queue an intent; delivery is not yet confirmed.",
        },
      ],
      execute: async () => {
        await messageMutation.mutateAsync(input)
        return acceptedAction(
          "Customer update queued for delivery.",
          clearMessage,
        )
      },
    })
  }
  return {
    transition,
    addNote,
    assignToMe,
    recordPayment,
    handoff,
    notifyCustomer,
    assignMutation,
    paymentMutation,
    handoffMutation,
    messageMutation,
    noteMutation,
  }
}
