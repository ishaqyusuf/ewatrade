"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useAttachmentAccess } from "@/hooks/use-attachment-access"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import {
  Badge,
  Button,
  ControlField,
  DateControl,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FormActions,
  Input,
  MoneyInput,
  SelectControl,
  SubmitButton,
  Textarea,
  cn,
  toast,
} from "@ewatrade/ui"
import { usesCustomerSignOff } from "@ewatrade/utils/service-work-presentation"
import {
  Alert02Icon,
  Camera01Icon,
  Link01Icon,
  Message01Icon,
  MoreVerticalIcon,
  Note01Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  type DraftJobHandoff,
  type DraftJobScope,
  draftJobNativeReadState,
} from "@/components/general-assistant/assistant-draft-job-handoff-state"
import { ChoiceButtons } from "@/components/service-work/choice-buttons"
import {
  type JobStep,
  type WorkJob,
  formatPrice,
  formatWhen,
  isJobLate,
  jobGate,
  jobNextStep,
  jobStage,
  lineStage,
  toneClass,
} from "@/components/service-work/service-utils"
import { useJobQuickStep } from "@/components/service-work/use-job-quick-step"
import { useTRPC, useTRPCClient } from "@/trpc/client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type ReactNode, useRef, useState } from "react"

type Job = WorkJob
type Line = Job["lines"][number]
type PaymentMethod = "bank_transfer" | "card" | "cash" | "other" | "pos"

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: ReactNode }> = [
  { value: "cash", label: <>Cash</> },
  { value: "bank_transfer", label: <>Bank transfer</> },
  { value: "pos", label: <>POS</> },
  { value: "card", label: <>Card</> },
  { value: "other", label: <>Other</> },
]

const PROBLEM_TYPES = [
  { value: "delay", label: <>Delay</> },
  { value: "quality", label: <>Not done well</> },
  { value: "failed_attempt", label: <>Couldn’t do it</> },
  { value: "customer_rejection", label: <>Customer refused</> },
  { value: "other", label: <>Other problem</> },
] as const

const PROBLEM_LABEL: Record<string, string> = {
  customer_rejection: "Customer refused",
  delay: "Delay",
  failed_attempt: "Couldn’t do it",
  other: "Other problem",
  quality: "Not done well",
}

const CHANNEL_LABEL: Record<string, string> = {
  EMAIL: "Email",
  MANUAL: "Shared",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
}

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: "bank transfer",
  card: "card",
  cash: "cash",
  other: "other",
  pos: "POS",
}

/** "pay" or "split:<lineId>" from the URL. */
export function parseJobStep(value: string | null) {
  if (!value) return null
  const [step, lineId] = value.split(":")
  return { step: step as JobStep, lineId: lineId || null }
}

export function ServiceJobWorkspace({
  canManage,
  jobId,
  draftJobHandoff,
  draftJobScope,
}: {
  canManage: boolean
  jobId: string
  draftJobHandoff?: DraftJobHandoff
  draftJobScope?: DraftJobScope
}) {
  const trpc = useTRPC()
  const client = useTRPCClient()
  const queryClient = useQueryClient()
  const { jobStep, setParams } = useServiceWorkParams()
  const jobKey = draftJobHandoff
    ? [
        "assistant-draft-native-job",
        draftJobScope,
        draftJobHandoff.token,
        jobId,
      ]
    : trpc.services.getJob.queryKey({ jobId })
  const jobQuery = useQuery({
    queryKey: jobKey,
    queryFn: ({ signal }) =>
      client.services.getJob.query({ jobId }, { signal }),
    retry: false,
    ...(draftJobHandoff
      ? { staleTime: 0, refetchOnMount: "always" as const }
      : {}),
  })
  const assigneesQuery = useQuery(
    trpc.services.assignees.queryOptions(undefined, {
      enabled: canManage,
      retry: false,
    }),
  )

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: jobKey }),
      queryClient.invalidateQueries({
        queryKey: trpc.services.queue.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.services.queuePage.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.services.queueStageCounts.queryKey(),
      }),
    ])
  }
  const goTo = (next: string | null) =>
    void setParams({ jobId, jobStep: next, serviceSheet: "job" })

  if (draftJobHandoff) {
    const state = draftJobScope
      ? draftJobNativeReadState(draftJobHandoff, draftJobScope, jobQuery)
      : "unavailable"
    if (state === "loading")
      return <output aria-live="polite">Checking current Job access…</output>
    if (state !== "ready")
      return (
        <p role="alert">
          This Job or your access changed. Close it and review the workload
          again.
        </p>
      )
  }
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
        This job is no longer available.
      </p>
    )
  }

  const names = new Map(
    (assigneesQuery.data ?? []).map((person) => [person.id, person.name]),
  )
  const parsed = parseJobStep(jobStep)
  const done = async (message: string) => {
    await refresh()
    toast(message)
    goTo(null)
  }

  if (parsed) {
    return (
      <JobStepView
        job={job}
        canManage={canManage}
        step={parsed.step}
        lineId={parsed.lineId}
        assignees={assigneesQuery.data ?? []}
        onBack={() => goTo(null)}
        onDone={done}
        onStep={goTo}
      />
    )
  }
  return (
    <JobSummary
      job={job}
      canManage={canManage}
      assigneeName={(id) => (id ? (names.get(id) ?? null) : null)}
      goTo={goTo}
      refresh={refresh}
    />
  )
}

// ---------------------------------------------------------------- Summary

function JobSummary({
  job,
  canManage,
  assigneeName,
  goTo,
  refresh,
}: {
  job: Job
  canManage: boolean
  assigneeName: (id: string | null) => string | null
  goTo: (step: string | null) => void
  refresh: () => Promise<void>
}) {
  const trpc = useTRPC()
  const quick = useJobQuickStep()
  const stage = jobStage(job)
  const next = jobNextStep(job, canManage)
  const signOff = usesCustomerSignOff(
    job.lines.map((line) => line.catalogItemName),
  )
  const late = isJobLate(job)
  const who = job.currentAssigneeUserId
    ? (assigneeName(job.currentAssigneeUserId) ?? "Someone")
    : null
  const openProblem = job.exceptions.find((entry) => entry.outcome === "OPEN")
  const publish = useMutation(
    trpc.services.publishEvidence.mutationOptions({
      onError: (failure) => toast(failure.message),
      onSuccess: async () => {
        await refresh()
        toast("The customer can see this photo now.")
      },
    }),
  )
  const revoke = useMutation(
    trpc.services.revokeEvidence.mutationOptions({
      onError: (failure) => toast(failure.message),
      onSuccess: async () => {
        await refresh()
        toast("Hidden from the customer.")
      },
    }),
  )

  let nextText: string
  switch (job.summary) {
    case "queued": {
      const gate = jobGate(job)
      nextText =
        gate === "PENDING_PAYMENT"
          ? `Work starts after payment. ${formatPrice(job.balanceDueMinor, job.currencyCode)} to pay.`
          : gate === "PENDING_RELEASE"
            ? "A manager must approve before work starts."
            : gate === "REVOKED"
              ? "On hold. A manager must approve it again."
              : who
                ? "Not started yet."
                : "Not started yet. Nobody is on it."
      break
    }
    case "in_progress":
      nextText = who
        ? `${who} is working on it.`
        : "Work has started. Nobody is assigned."
      break
    case "partially_ready": {
      const ready = job.lines.filter(
        (line) => line.status === "READY_FOR_HANDOFF",
      ).length
      const active = job.lines.filter((line) => line.status !== "CANCELLED")
      nextText = `${ready} of ${active.length} parts are ready.`
      break
    }
    case "blocked":
      nextText = openProblem
        ? `Stuck: ${openProblem.description}`
        : "Stuck. Continue when the work can go on."
      break
    case "ready_for_handoff":
      nextText = `${signOff ? "Ready for the customer to check" : `Ready for ${job.customerName || "the customer"}`}.${
        job.balanceDueMinor > 0
          ? ` ${formatPrice(job.balanceDueMinor, job.currencyCode)} still to pay.`
          : " Fully paid."
      }`
      break
    case "completed":
      nextText = `${signOff ? "Completed" : "Handed over"}${
        job.handedOffAt ? ` ${formatWhen(job.handedOffAt).toLowerCase()}` : ""
      }.`
      break
    default:
      nextText = "This work was cancelled."
  }

  const nextButtons: Array<{ label: string; onClick: () => void }> = []
  if (next) {
    nextButtons.push({
      label:
        next.action === "handover" && job.balanceDueMinor > 0 && !signOff
          ? `Collect ${formatPrice(job.balanceDueMinor, job.currencyCode)} and hand over`
          : next.action === "approve"
            ? "Approve the start"
            : next.action === "start"
              ? "Start work"
              : next.label,
      onClick: () =>
        next.action === "start" || next.action === "ready"
          ? void quick.run(job, next.action).then(refresh)
          : goTo(next.action),
    })
  }
  if (job.summary === "in_progress" || job.summary === "partially_ready")
    nextButtons.push({ label: "Mark stuck", onClick: () => goTo("stuck") })
  if (job.summary === "queued" && !jobGate(job) && canManage)
    nextButtons.push({
      label: who ? "Give to someone else" : "Give to someone",
      onClick: () => goTo("assign"),
    })
  if (
    job.summary === "queued" &&
    jobGate(job) === "PENDING_PAYMENT" &&
    canManage
  )
    nextButtons.push({
      label: "Start without payment",
      onClick: () => goTo("approve"),
    })
  if (job.summary === "blocked" && canManage)
    nextButtons.push({ label: "Change due date", onClick: () => goTo("due") })
  if (job.summary === "ready_for_handoff" && canManage)
    nextButtons.push({
      label: "Tell the customer",
      onClick: () => goTo("message"),
    })

  const nextTone =
    job.summary === "blocked"
      ? "border-warning-border bg-warning text-warning-foreground"
      : job.summary === "ready_for_handoff"
        ? "border-primary/30 bg-primary/5"
        : "border-border bg-card"

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={cn("rounded-full", toneClass(stage.tone))}>
          {stage.label}
        </Badge>
        {late ? (
          <span className="border border-destructive px-1 text-xs font-semibold text-destructive">
            Late
          </span>
        ) : null}
        {job.priority === "urgent" ? (
          <span className="text-xs font-semibold tracking-wide uppercase">
            Urgent
          </span>
        ) : null}
      </div>

      <section className={cn("grid gap-3 border p-4", nextTone)}>
        <p className="text-sm font-medium">{nextText}</p>
        {nextButtons.length ? (
          <div className="flex flex-wrap gap-2">
            {nextButtons.map((button, index) => (
              <Button
                key={button.label}
                type="button"
                variant={index === 0 ? "default" : "outline"}
                disabled={quick.isPending}
                onClick={button.onClick}
              >
                {button.label}
              </Button>
            ))}
          </div>
        ) : null}
      </section>

      <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Customer</dt>
        <dd>{job.customerName || "Walk-in customer"}</dd>
        <dt className="text-muted-foreground">Who is doing it</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <span className={cn(!who && "text-muted-foreground")}>
            {who ?? "Not assigned"}
          </span>
          {canManage ? (
            <LinkButton onClick={() => goTo("assign")}>Change</LinkButton>
          ) : null}
        </dd>
        <dt className="text-muted-foreground">Due</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              !job.dueCommitmentAt && "text-muted-foreground",
              late && "font-medium text-destructive",
            )}
          >
            {formatWhen(job.dueCommitmentAt)}
          </span>
          {canManage ? (
            <LinkButton onClick={() => goTo("due")}>Change</LinkButton>
          ) : null}
        </dd>
      </dl>

      <SummarySection title="Work">
        <ul className="grid border border-border">
          {job.lines.map((line) => (
            <WorkLine
              key={line.id}
              line={line}
              multi={job.lines.length > 1}
              canManage={canManage}
              goTo={goTo}
              refresh={refresh}
            />
          ))}
        </ul>
      </SummarySection>

      <SummarySection title="Money">
        <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Total</dt>
          <dd>{formatPrice(job.orderTotalMinor, job.currencyCode)}</dd>
          <dt className="text-muted-foreground">Paid</dt>
          <dd>{formatPrice(job.amountPaidMinor, job.currencyCode)}</dd>
          <dt className="text-muted-foreground">Still to pay</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {formatPrice(job.balanceDueMinor, job.currencyCode)}
            </span>
            {job.balanceDueMinor > 0 ? (
              <LinkButton onClick={() => goTo("pay")}>Take payment</LinkButton>
            ) : null}
          </dd>
        </dl>
      </SummarySection>

      <SummarySection title="Notes and updates">
        <div className="flex flex-wrap gap-2">
          <ToolButton icon={Note01Icon} onClick={() => goTo("note")}>
            Add note
          </ToolButton>
          <ToolButton icon={Alert02Icon} onClick={() => goTo("problem")}>
            Report a problem
          </ToolButton>
          <ToolButton icon={Camera01Icon} onClick={() => goTo("photo")}>
            Add photo
          </ToolButton>
          {canManage ? (
            <>
              <ToolButton icon={Message01Icon} onClick={() => goTo("message")}>
                Message customer
              </ToolButton>
              <ToolButton icon={Link01Icon} onClick={() => goTo("track")}>
                Tracking link
              </ToolButton>
            </>
          ) : null}
        </div>
        <JobActivity
          job={job}
          canManage={canManage}
          onPublish={(evidenceId) => publish.mutate({ evidenceId })}
          onRevoke={(evidenceId) =>
            revoke.mutate({ evidenceId, reason: "Hidden from the job sheet" })
          }
        />
      </SummarySection>
    </div>
  )
}

function WorkLine({
  line,
  multi,
  canManage,
  goTo,
  refresh,
}: {
  line: Line
  multi: boolean
  canManage: boolean
  goTo: (step: string | null) => void
  refresh: () => Promise<void>
}) {
  const trpc = useTRPC()
  const stage = lineStage(line.status, line.catalogItemName)
  const authorized = line.authorizationStatus === "AUTHORIZED"
  const transition = useMutation(
    trpc.services.transitionLine.mutationOptions({
      onError: (failure) => toast(failure.message),
      onSuccess: async () => {
        await refresh()
      },
    }),
  )
  const quickTo =
    !multi || !authorized
      ? null
      : line.status === "QUEUED"
        ? { to: "in_progress" as const, label: "Start" }
        : line.status === "IN_PROGRESS"
          ? { to: "ready_for_handoff" as const, label: "Mark ready" }
          : null
  const canStick = line.status === "QUEUED" || line.status === "IN_PROGRESS"
  const canSplit =
    canManage &&
    Number(line.allocatedQuantity) > 1 &&
    (line.status === "QUEUED" || line.status === "IN_PROGRESS")
  const canRedo =
    canManage &&
    (line.status === "READY_FOR_HANDOFF" || line.status === "COMPLETED")
  const hasMenu = canStick || canSplit || canRedo
  const name =
    line.offeringName && line.offeringName !== line.catalogItemName
      ? `${line.offeringName} · ${line.allocatedQuantity}`
      : line.allocatedQuantity
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t border-border px-3 py-2.5 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{line.catalogItemName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {name}
          {!authorized
            ? line.authorizationStatus === "PENDING_PAYMENT"
              ? " · waiting for payment"
              : " · needs a manager’s OK"
            : ""}
        </p>
      </div>
      <Badge
        className={cn(
          "w-fit rounded-full max-sm:col-start-1",
          toneClass(stage.tone),
        )}
      >
        {stage.label}
      </Badge>
      <div className="flex items-center gap-1 max-sm:col-start-2 max-sm:row-start-1">
        {quickTo ? (
          <SubmitButton
            type="button"
            size="sm"
            variant="outline"
            isSubmitting={transition.isPending}
            disabled={transition.isPending}
            onClick={() =>
              transition.mutate({
                clientCommandId: crypto.randomUUID(),
                expectedRevision: line.revision,
                lineId: line.id,
                schemaVersion: 1,
                source: "dashboard_job_workspace",
                toStatus: quickTo.to,
              })
            }
          >
            {quickTo.label}
          </SubmitButton>
        ) : null}
        {hasMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`More for ${line.catalogItemName}`}
                />
              }
            >
              <HugeiconsIcon icon={MoreVerticalIcon} aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent appearance="dashboard" align="end">
              {canStick ? (
                <DropdownMenuItem onClick={() => goTo(`stuck:${line.id}`)}>
                  Mark stuck
                </DropdownMenuItem>
              ) : null}
              {canSplit ? (
                <DropdownMenuItem onClick={() => goTo(`split:${line.id}`)}>
                  Split the work
                </DropdownMenuItem>
              ) : null}
              {canRedo ? (
                <DropdownMenuItem onClick={() => goTo(`redo:${line.id}`)}>
                  Redo part of it
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </li>
  )
}

type ActivityEntry = { at: Date; icon: typeof Note01Icon; body: ReactNode }

function JobActivity({
  job,
  canManage,
  onPublish,
  onRevoke,
}: {
  job: Job
  canManage: boolean
  onPublish: (evidenceId: string) => void
  onRevoke: (evidenceId: string) => void
}) {
  const entries: ActivityEntry[] = [
    ...job.notes.map((note) => ({
      at: new Date(note.createdAt),
      icon: Note01Icon,
      body: <>{note.body}</>,
    })),
    ...job.exceptions.map((entry) => ({
      at: new Date(entry.occurredAt),
      icon: Alert02Icon,
      body: (
        <>
          <span className="font-medium text-warning-foreground">
            {PROBLEM_LABEL[entry.type.toLowerCase()] ?? "Problem"}
          </span>{" "}
          {entry.description}
        </>
      ),
    })),
    ...job.evidence.map((entry) => {
      const shown = entry.visibility === "PUBLISHED"
      const ready = entry.uploadStatus === "AVAILABLE"
      return {
        at: new Date(entry.capturedAt ?? job.createdAt),
        icon: Camera01Icon,
        body: (
          <>
            <span className="font-medium">Photo</span> {entry.label || ""}{" "}
            <span className="text-muted-foreground">
              ·{" "}
              {shown
                ? "customer can see it"
                : ready
                  ? "private"
                  : entry.uploadStatus === "FAILED"
                    ? "upload failed"
                    : "still uploading"}
            </span>
            {canManage && ready ? (
              <LinkButton
                className="ml-2"
                onClick={() =>
                  shown ? onRevoke(entry.id) : onPublish(entry.id)
                }
              >
                {shown ? "Hide from customer" : "Show to customer"}
              </LinkButton>
            ) : null}
          </>
        ),
      }
    }),
    ...job.notificationIntents.map((intent) => ({
      at: new Date(intent.scheduledFor ?? intent.createdAt),
      icon: Message01Icon,
      body: (
        <>
          <span className="font-medium">
            {CHANNEL_LABEL[intent.channel] ?? "Message"} to customer
          </span>{" "}
          “{intent.renderedMessage}”{" "}
          <span className="text-muted-foreground">
            · {String(intent.status).toLowerCase().replaceAll("_", " ")}
          </span>
        </>
      ),
    })),
    ...job.payments.map((payment) => ({
      at: new Date(payment.recordedAt),
      icon: Wallet01Icon,
      body: (
        <>
          <span className="font-medium">
            {formatPrice(payment.amountMinor, job.currencyCode)}
          </span>{" "}
          paid by {METHOD_LABEL[payment.method.toLowerCase()] ?? "other"}
          {payment.reference ? ` · ${payment.reference}` : ""}
        </>
      ),
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime())

  if (entries.length === 0)
    return <p className="text-sm text-muted-foreground">Nothing yet.</p>
  return (
    <ul className="grid gap-3">
      {entries.map((entry, index) => (
        <li
          key={`${entry.at.getTime()}-${index}`}
          className="grid grid-cols-[16px_1fr] gap-2.5 text-sm"
        >
          <HugeiconsIcon
            icon={entry.icon}
            className="mt-0.5 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="min-w-0 break-words">
            {entry.body}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatWhen(entry.at)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

// ------------------------------------------------------------------- Steps

function JobStepView({
  job,
  canManage,
  step,
  lineId,
  assignees,
  onBack,
  onDone,
  onStep,
}: {
  job: Job
  canManage: boolean
  step: JobStep
  lineId: string | null
  assignees: Array<{ id: string; name: string; role: string }>
  onBack: () => void
  onDone: (message: string) => Promise<void>
  onStep: (step: string) => void
}) {
  const trpc = useTRPC()
  const attachments = useAttachmentAccess(job.id)
  const signOff = usesCustomerSignOff(
    job.lines.map((line) => line.catalogItemName),
  )
  const line = job.lines.find((entry) => entry.id === lineId) ?? null
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [amount, setAmount] = useState(
    job.balanceDueMinor > 0 ? String(job.balanceDueMinor / 100) : "",
  )
  const [method, setMethod] = useState<PaymentMethod>("cash")
  const [reference, setReference] = useState("")
  const [text, setText] = useState("")
  const [why, setWhy] = useState("")
  const [assignee, setAssignee] = useState(job.currentAssigneeUserId ?? "")
  const [dueAt, setDueAt] = useState("")
  const [problemType, setProblemType] =
    useState<(typeof PROBLEM_TYPES)[number]["value"]>("delay")
  const [quantity, setQuantity] = useState("")
  const [channel, setChannel] = useState<"whatsapp" | "sms">("whatsapp")
  const [when, setWhen] = useState<"now" | "later">("now")
  const [sendAt, setSendAt] = useState("")
  const [evidenceLabel, setEvidenceLabel] = useState("")
  const [evidenceReference, setEvidenceReference] = useState("")
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const admission = useRef(false)
  const fail = (failure: { message: string }) => setError(failure.message)

  const recordPayment = useMutation(
    trpc.orders.recordPayment.mutationOptions({ onError: fail }),
  )
  const handoff = useMutation(
    trpc.services.handoff.mutationOptions({ onError: fail }),
  )
  const transition = useMutation(
    trpc.services.transitionLine.mutationOptions({ onError: fail }),
  )
  const exception = useMutation(
    trpc.services.recordException.mutationOptions({ onError: fail }),
  )
  const authorize = useMutation(
    trpc.services.authorizeLine.mutationOptions({ onError: fail }),
  )
  const assign = useMutation(
    trpc.services.assignJob.mutationOptions({ onError: fail }),
  )
  const reschedule = useMutation(
    trpc.services.rescheduleJob.mutationOptions({ onError: fail }),
  )
  const note = useMutation(
    trpc.services.addNote.mutationOptions({ onError: fail }),
  )
  const evidence = useMutation(
    trpc.services.captureEvidence.mutationOptions({ onError: fail }),
  )
  const message = useMutation(
    trpc.serviceCommunications.createIntent.mutationOptions({ onError: fail }),
  )
  const tracking = useMutation(
    trpc.serviceAccess.createTracking.mutationOptions({
      onError: fail,
      onSuccess: (result) => {
        const storefront =
          process.env.NEXT_PUBLIC_STOREFRONT_URL?.replace(/\/$/, "") ?? ""
        setTrackingUrl(`${storefront}/service-tracking/${result.token}`)
      },
    }),
  )
  const split = useMutation(
    trpc.services.splitLine.mutationOptions({ onError: fail }),
  )
  const rework = useMutation(
    trpc.services.createRework.mutationOptions({ onError: fail }),
  )

  const balance = job.balanceDueMinor
  const amountMinor = amount.trim() ? Math.round(Number(amount) * 100) : null
  const moneyError = (full: boolean) => {
    if (balance <= 0) return null
    if (amountMinor === null) return "Enter the amount received."
    if (!Number.isFinite(amountMinor) || amountMinor <= 0)
      return "Enter an amount like 5000 or 5000.50."
    if (amountMinor > balance)
      return `That’s more than the ${formatPrice(balance, job.currencyCode)} still to pay.`
    if (full && amountMinor < balance)
      return `Collect the full ${formatPrice(balance, job.currencyCode)} to hand over.`
    return null
  }

  /** Run a save with field checks first; errors stay on the step. */
  async function save(
    checks: Record<string, string | null | false>,
    run: () => Promise<string>,
  ) {
    setError(null)
    const next = Object.fromEntries(
      Object.entries(checks).filter((entry): entry is [string, string] =>
        Boolean(entry[1]),
      ),
    )
    setFieldErrors(next)
    if (Object.keys(next).length) return
    setPending(true)
    try {
      const done = await run()
      await onDone(done)
    } catch {
      // The mutation onError shows the reason on the step.
    } finally {
      setPending(false)
    }
  }

  const activeLines = (statuses: Line["status"][]) =>
    (line ? [line] : job.lines).filter((entry) =>
      statuses.includes(entry.status),
    )

  let body: ReactNode = null
  let primary: { label: string; onClick: () => void; danger?: boolean } | null =
    null
  let secondaryLabel = "Back"
  let footnote: ReactNode = null

  const amountFields = (full: boolean) =>
    balance > 0 ? (
      <>
        <div className="grid gap-3 sm:grid-cols-2">
          <ControlField
            label={full ? "Collect now" : "Amount received"}
            error={fieldErrors.amount}
          >
            <MoneyInput
              currencyCode={job.currencyCode}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </ControlField>
          <ControlField label="Paid by">
            <SelectControl
              value={method}
              onValueChange={(value) => setMethod(value as PaymentMethod)}
              options={PAYMENT_METHODS}
            />
          </ControlField>
        </div>
        <ControlField
          label={
            <>
              Reference{" "}
              <span className="font-normal text-muted-foreground">
                Optional
              </span>
            </>
          }
        >
          <Input
            placeholder="e.g. bank transfer ID"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </ControlField>
      </>
    ) : null

  const moneyList = (
    <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
      <dt className="text-muted-foreground">Total</dt>
      <dd>{formatPrice(job.orderTotalMinor, job.currencyCode)}</dd>
      <dt className="text-muted-foreground">Paid</dt>
      <dd>{formatPrice(job.amountPaidMinor, job.currencyCode)}</dd>
      <dt className="text-muted-foreground">Still to pay</dt>
      <dd className="font-medium">{formatPrice(balance, job.currencyCode)}</dd>
    </dl>
  )

  switch (step) {
    case "pay": {
      body = (
        <>
          {moneyList}
          {balance > 0 ? (
            amountFields(false)
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing left to pay.
            </p>
          )}
        </>
      )
      footnote =
        amountMinor && amountMinor > 0 && amountMinor < balance
          ? `${formatPrice(balance - amountMinor, job.currencyCode)} will still be left to pay.`
          : null
      primary =
        balance > 0
          ? {
              label:
                amountMinor && amountMinor > 0 && amountMinor <= balance
                  ? `Record ${formatPrice(amountMinor, job.currencyCode)}`
                  : "Record payment",
              onClick: () =>
                void save({ amount: moneyError(false) }, async () => {
                  await recordPayment.mutateAsync({
                    amountMinor: amountMinor ?? 0,
                    clientPaymentId: crypto.randomUUID(),
                    method,
                    orderId: job.commercialOrderId,
                    reference: reference.trim() || undefined,
                  })
                  return `${formatPrice(amountMinor ?? 0, job.currencyCode)} recorded.`
                }),
            }
          : null
      break
    }
    case "handover": {
      const ready = job.summary === "ready_for_handoff" && !job.handedOffAt
      body = (
        <>
          <p className="text-sm">
            {signOff
              ? "Confirm the customer has checked the finished cleaning."
              : `${job.customerName || "The customer"} collects the work.`}
          </p>
          {moneyList}
          {amountFields(true)}
          {balance > 0 ? (
            <p className="text-xs text-muted-foreground">
              Hand over needs the full amount. To take part of it, use Take
              payment and keep the job open.
            </p>
          ) : null}
          {!ready ? (
            <FormFeedback appearance="dashboard">
              Every part must be ready before you hand over.
            </FormFeedback>
          ) : null}
        </>
      )
      primary = ready
        ? {
            label: signOff
              ? "Complete job"
              : balance > 0
                ? `Collect ${formatPrice(amountMinor && amountMinor > 0 ? amountMinor : balance, job.currencyCode)} and hand over`
                : "Hand over",
            onClick: () =>
              void save({ amount: moneyError(true) }, async () => {
                await handoff.mutateAsync({
                  clientCommandId: crypto.randomUUID(),
                  expectedRevision: job.revision,
                  jobId: job.id,
                  note: signOff
                    ? "Cleaning completed after customer sign-off"
                    : "Collected by customer",
                  payment:
                    balance > 0
                      ? {
                          amountMinor: amountMinor ?? 0,
                          method,
                          reference: reference.trim() || undefined,
                        }
                      : undefined,
                })
                return signOff
                  ? "Job completed."
                  : `Handed over to ${job.customerName || "the customer"}.`
              }),
          }
        : null
      break
    }
    case "stuck": {
      const lines = activeLines(["QUEUED", "IN_PROGRESS"])
      body = (
        <>
          {line ? (
            <p className="text-sm text-muted-foreground">
              {line.catalogItemName} · {line.allocatedQuantity}
            </p>
          ) : null}
          <ControlField
            label="What is stopping the work?"
            description="Shown on the job until someone continues it."
            error={fieldErrors.why}
          >
            <Textarea
              placeholder="e.g. Disinfectant ran out"
              value={why}
              onChange={(event) => setWhy(event.target.value)}
            />
          </ControlField>
        </>
      )
      primary = {
        label: "Mark stuck",
        onClick: () =>
          void save(
            {
              why: !why.trim() && "Say what is stopping the work.",
              lines: lines.length === 0 && "Nothing here can be marked stuck.",
            },
            async () => {
              await exception.mutateAsync({
                description: why.trim(),
                jobId: job.id,
                type: "delay",
              })
              for (const entry of lines) {
                await transition.mutateAsync({
                  clientCommandId: crypto.randomUUID(),
                  expectedRevision: entry.revision,
                  lineId: entry.id,
                  reason: why.trim(),
                  schemaVersion: 1,
                  source: "dashboard_job_workspace",
                  toStatus: "blocked",
                })
              }
              return "Marked stuck."
            },
          ),
      }
      break
    }
    case "resume": {
      const lines = activeLines(["BLOCKED"])
      body = (
        <ControlField
          label={
            <>
              What changed?{" "}
              <span className="font-normal text-muted-foreground">
                Optional
              </span>
            </>
          }
        >
          <Textarea
            placeholder="e.g. Disinfectant arrived"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </ControlField>
      )
      primary = {
        label: "Continue work",
        onClick: () =>
          void save({}, async () => {
            for (const entry of lines) {
              await transition.mutateAsync({
                clientCommandId: crypto.randomUUID(),
                expectedRevision: entry.revision,
                lineId: entry.id,
                schemaVersion: 1,
                source: "dashboard_job_workspace",
                toStatus: "in_progress",
              })
            }
            if (text.trim())
              await note.mutateAsync({
                body: text.trim(),
                clientCommandId: crypto.randomUUID(),
                jobId: job.id,
              })
            return "Work continues."
          }),
      }
      footnote = (
        <LinkButton onClick={() => onStep("cancel")}>
          Cancel this work instead
        </LinkButton>
      )
      break
    }
    case "cancel": {
      const lines = activeLines(["BLOCKED"])
      body = (
        <>
          <FormFeedback appearance="dashboard">
            The work stops for good. Money already paid stays on the order;
            refund it from Orders if needed.
          </FormFeedback>
          <ControlField label="Why?" error={fieldErrors.why}>
            <Textarea
              placeholder="e.g. Customer no longer needs it"
              value={why}
              onChange={(event) => setWhy(event.target.value)}
            />
          </ControlField>
        </>
      )
      secondaryLabel = "Keep the work"
      primary = {
        label: "Cancel this work",
        danger: true,
        onClick: () =>
          void save(
            {
              why: !why.trim() && "Say why the work is cancelled.",
              lines:
                lines.length === 0 &&
                "Only stuck work can be cancelled. Mark it stuck first.",
            },
            async () => {
              for (const entry of lines) {
                await transition.mutateAsync({
                  clientCommandId: crypto.randomUUID(),
                  expectedRevision: entry.revision,
                  lineId: entry.id,
                  reason: why.trim(),
                  schemaVersion: 1,
                  source: "dashboard_job_workspace",
                  toStatus: "cancelled",
                })
              }
              return "Work cancelled."
            },
          ),
      }
      break
    }
    case "approve": {
      const waiting = job.lines.filter(
        (entry) =>
          entry.authorizationStatus !== "AUTHORIZED" &&
          entry.status !== "COMPLETED" &&
          entry.status !== "CANCELLED",
      )
      const payment = waiting.some(
        (entry) => entry.authorizationStatus === "PENDING_PAYMENT",
      )
      body = (
        <>
          <p className="text-sm">
            {payment
              ? `This service normally starts after payment. ${formatPrice(balance, job.currencyCode)} is not paid yet.`
              : "This service needs a manager to approve before work starts."}
          </p>
          <ControlField label="Why can it start?" error={fieldErrors.why}>
            <Textarea
              placeholder={
                payment
                  ? "e.g. Regular customer, pays on Friday"
                  : "e.g. Price agreed on the phone"
              }
              value={why}
              onChange={(event) => setWhy(event.target.value)}
            />
          </ControlField>
        </>
      )
      primary = canManage
        ? {
            label: "Approve the start",
            onClick: () =>
              void save(
                { why: !why.trim() && "Say why it can start." },
                async () => {
                  for (const entry of waiting) {
                    await authorize.mutateAsync({
                      clientCommandId: crypto.randomUUID(),
                      expectedRevision: entry.revision,
                      lineId: entry.id,
                      reason: why.trim(),
                      source:
                        entry.authorizationStatus === "PENDING_PAYMENT"
                          ? "payment"
                          : "manual_release",
                    })
                  }
                  return "Approved. Work can start."
                },
              ),
          }
        : null
      break
    }
    case "assign": {
      body = (
        <>
          <ControlField label="Who is doing it" error={fieldErrors.assignee}>
            <SelectControl
              value={assignee}
              onValueChange={setAssignee}
              options={[
                { value: "", label: <>Choose a person</> },
                ...assignees.map((person) => ({
                  value: person.id,
                  label: person.name,
                })),
              ]}
            />
          </ControlField>
          <ControlField
            label={
              <>
                Note{" "}
                <span className="font-normal text-muted-foreground">
                  Optional
                </span>
              </>
            }
          >
            <Input
              placeholder="e.g. Tunde is off today"
              value={why}
              onChange={(event) => setWhy(event.target.value)}
            />
          </ControlField>
        </>
      )
      primary = canManage
        ? {
            label: "Save",
            onClick: () =>
              void save(
                {
                  assignee:
                    (!assignee && "Choose a person.") ||
                    (assignee === job.currentAssigneeUserId &&
                      "They are already doing it. Pick someone else."),
                },
                async () => {
                  await assign.mutateAsync({
                    assigneeUserId: assignee,
                    expectedRevision: job.revision,
                    jobId: job.id,
                    reason: why.trim() || undefined,
                  })
                  const name = assignees.find(
                    (person) => person.id === assignee,
                  )?.name
                  return name ? `Given to ${name}.` : "Saved."
                },
              ),
          }
        : null
      break
    }
    case "due": {
      body = (
        <>
          <p className="text-sm text-muted-foreground">
            Now due: {formatWhen(job.dueCommitmentAt)}
          </p>
          <ControlField label="New due date" error={fieldErrors.dueAt}>
            <DateControl
              type="datetime-local"
              value={dueAt}
              onValueChange={setDueAt}
            />
          </ControlField>
          <ControlField label="Why is it changing?" error={fieldErrors.why}>
            <Input
              placeholder="e.g. Waiting for disinfectant"
              value={why}
              onChange={(event) => setWhy(event.target.value)}
            />
          </ControlField>
        </>
      )
      primary = canManage
        ? {
            label: "Change due date",
            onClick: () =>
              void save(
                {
                  dueAt: !dueAt && "Pick the new date and time.",
                  why: !why.trim() && "Say why it is changing.",
                },
                async () => {
                  await reschedule.mutateAsync({
                    expectedRevision: job.revision,
                    jobId: job.id,
                    promisedAt: new Date(dueAt),
                    reason: why.trim(),
                  })
                  return "Due date changed."
                },
              ),
          }
        : null
      break
    }
    case "note": {
      body = (
        <ControlField
          label="Note"
          description="Only your team sees this."
          error={fieldErrors.text}
        >
          <Textarea
            rows={4}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </ControlField>
      )
      primary = {
        label: "Add note",
        onClick: () =>
          void save(
            { text: !text.trim() && "Write the note first." },
            async () => {
              await note.mutateAsync({
                body: text.trim(),
                clientCommandId: crypto.randomUUID(),
                jobId: job.id,
              })
              return "Note added."
            },
          ),
      }
      break
    }
    case "problem": {
      body = (
        <>
          <ControlField label="What went wrong?">
            <SelectControl
              value={problemType}
              onValueChange={(value) =>
                setProblemType(value as typeof problemType)
              }
              options={[...PROBLEM_TYPES]}
            />
          </ControlField>
          <ControlField label="What happened?" error={fieldErrors.why}>
            <Textarea
              placeholder="e.g. 20 birds missed, will finish tomorrow"
              value={why}
              onChange={(event) => setWhy(event.target.value)}
            />
          </ControlField>
        </>
      )
      primary = {
        label: "Report problem",
        onClick: () =>
          void save({ why: !why.trim() && "Say what happened." }, async () => {
            await exception.mutateAsync({
              description: why.trim(),
              jobId: job.id,
              type: problemType,
            })
            return "Problem recorded."
          }),
      }
      break
    }
    case "photo": {
      body = (
        <>
          {attachments.dialog}
          <ControlField
            label={
              <>
                What it shows{" "}
                <span className="font-normal text-muted-foreground">
                  Optional
                </span>
              </>
            }
          >
            <Input
              placeholder="e.g. Layer pen after vaccination"
              disabled={attachments.knownFree}
              value={evidenceLabel}
              onChange={(event) => setEvidenceLabel(event.target.value)}
            />
          </ControlField>
          <ControlField
            label={
              <>
                File reference{" "}
                <span className="font-normal text-muted-foreground">
                  Optional
                </span>
              </>
            }
            description="Only if your photo storage gives you one."
          >
            <Input
              disabled={attachments.knownFree}
              value={evidenceReference}
              onChange={(event) => setEvidenceReference(event.target.value)}
            />
          </ControlField>
          <p className="text-xs text-muted-foreground">
            Photos stay private to your team. A manager can show one to the
            customer after it passes the safety check.
          </p>
        </>
      )
      primary = {
        label: attachments.knownFree ? "Add photo · Locked" : "Add photo",
        onClick: () =>
          void save({}, async () => {
            if (admission.current) throw new Error("busy")
            admission.current = true
            try {
              if (!(await attachments.allow())) throw new Error("not allowed")
              await evidence.mutateAsync({
                assetReference: evidenceReference.trim() || undefined,
                capturedAt: new Date(),
                clientEvidenceId: crypto.randomUUID(),
                jobId: job.id,
                label: evidenceLabel.trim() || undefined,
                mediaType: "photo",
                purpose: "progress",
                uploadStatus: "local",
              })
              return "Photo added. Only your team can see it."
            } finally {
              admission.current = false
            }
          }),
      }
      break
    }
    case "message": {
      body = (
        <>
          <ControlField label="Send by">
            <ChoiceButtons
              label="Send by"
              value={channel}
              onChange={setChannel}
              options={[
                { value: "whatsapp", label: "WhatsApp" },
                { value: "sms", label: "SMS" },
              ]}
            />
          </ControlField>
          <ControlField
            label="Message"
            description={`To ${job.customerName || "the customer"}`}
            error={fieldErrors.text}
          >
            <Textarea
              rows={4}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </ControlField>
          <ControlField label="When">
            <ChoiceButtons
              label="When"
              value={when}
              onChange={setWhen}
              options={[
                { value: "now", label: "Send now" },
                { value: "later", label: "Send later" },
              ]}
            />
          </ControlField>
          {when === "later" ? (
            <ControlField label="Send at" error={fieldErrors.sendAt}>
              <DateControl
                type="datetime-local"
                value={sendAt}
                onValueChange={setSendAt}
              />
            </ControlField>
          ) : null}
        </>
      )
      primary = canManage
        ? {
            label: when === "later" ? "Schedule message" : "Send message",
            onClick: () =>
              void save(
                {
                  text: !text.trim() && "Write the message first.",
                  sendAt:
                    when === "later" && !sendAt && "Pick when to send it.",
                },
                async () => {
                  await message.mutateAsync({
                    audienceKey: job.orderNumber,
                    businessEventKey: `${job.id}:${crypto.randomUUID()}`,
                    channel,
                    jobId: job.id,
                    renderedMessage: text.trim(),
                    scheduledFor:
                      when === "later" && sendAt ? new Date(sendAt) : undefined,
                    templatePurpose: "manual_update",
                  })
                  return when === "later"
                    ? "Message scheduled."
                    : "Message sent."
                },
              ),
          }
        : null
      break
    }
    case "track": {
      body = (
        <>
          <p className="text-sm">
            Send the customer a page that shows progress and the due date.
            Notes, problems and private photos stay hidden.
          </p>
          {trackingUrl ? (
            <div className="flex items-center gap-3 border border-border px-3 py-2.5">
              <a
                className="min-w-0 flex-1 text-sm break-all text-primary underline"
                href={trackingUrl}
                rel="noreferrer"
                target="_blank"
              >
                {trackingUrl}
              </a>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  void navigator.clipboard.writeText(trackingUrl).then(
                    () => toast("Link copied."),
                    () => toast("Select the link to copy it."),
                  )
                }
              >
                Copy link
              </Button>
            </div>
          ) : null}
        </>
      )
      secondaryLabel = trackingUrl ? "Done" : "Back"
      primary =
        canManage && !trackingUrl
          ? {
              label: "Create tracking link",
              onClick: () =>
                tracking.mutate({
                  customerScopeKey: job.orderNumber,
                  jobId: job.id,
                }),
            }
          : null
      break
    }
    case "split":
    case "redo": {
      const target = line ?? job.lines[0]
      const isSplit = step === "split"
      const total = Number(target?.allocatedQuantity ?? 0)
      const qty = Number(quantity)
      body = target ? (
        <>
          <p className="text-sm text-muted-foreground">
            {target.catalogItemName} · {target.allocatedQuantity} ·{" "}
            {lineStage(target.status, target.catalogItemName).label}
          </p>
          <ControlField
            label={
              isSplit ? "How many to move to a new part" : "How many to redo"
            }
            description={
              isSplit
                ? "Use this when part of the work goes at a different pace, e.g. 100 today and the rest tomorrow."
                : "Adds a new part to this job for the work to redo. The customer is not charged again."
            }
            error={fieldErrors.quantity}
          >
            <Input
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </ControlField>
          <ControlField label="Why?" error={fieldErrors.why}>
            <Input
              placeholder={
                isSplit ? "e.g. Second pen on Friday" : "e.g. 10 birds missed"
              }
              value={why}
              onChange={(event) => setWhy(event.target.value)}
            />
          </ControlField>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          This part is no longer on the job.
        </p>
      )
      footnote =
        isSplit && qty > 0 && qty < total
          ? `${total - qty} stay here · ${qty} move to a new part`
          : null
      primary =
        canManage && target
          ? {
              label: isSplit ? "Split" : "Add redo",
              onClick: () =>
                void save(
                  {
                    quantity:
                      (!quantity.trim() && "Enter how many.") ||
                      ((!Number.isFinite(qty) || qty <= 0) &&
                        "Enter a number like 50.") ||
                      (isSplit &&
                        qty >= total &&
                        `Must be less than ${total}.`) ||
                      (!isSplit &&
                        qty > total &&
                        `Can’t be more than ${total}.`),
                    why: !why.trim() && "Say why.",
                  },
                  async () => {
                    if (isSplit)
                      await split.mutateAsync({
                        clientCommandId: crypto.randomUUID(),
                        expectedRevision: target.revision,
                        lineId: target.id,
                        quantity: quantity.trim(),
                        reason: why.trim(),
                      })
                    else
                      await rework.mutateAsync({
                        clientCommandId: crypto.randomUUID(),
                        lineId: target.id,
                        quantity: quantity.trim(),
                        reason: why.trim(),
                      })
                    return isSplit
                      ? `Split: ${quantity.trim()} moved to a new part.`
                      : `${quantity.trim()} added to redo.`
                  },
                ),
            }
          : null
      break
    }
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
      {fieldErrors.lines ? (
        <FormFeedback appearance="dashboard">{fieldErrors.lines}</FormFeedback>
      ) : null}
      {body}
      <FormActions>
        {footnote ? (
          <span className="mr-auto text-sm text-muted-foreground">
            {footnote}
          </span>
        ) : null}
        <Button type="button" variant="outline" onClick={onBack}>
          {secondaryLabel}
        </Button>
        {primary ? (
          <SubmitButton
            type="button"
            variant={primary.danger ? "destructive" : "default"}
            isSubmitting={pending || tracking.isPending}
            disabled={pending || tracking.isPending}
            onClick={primary.onClick}
          >
            {primary.label}
          </SubmitButton>
        ) : null}
      </FormActions>
    </div>
  )
}

// ----------------------------------------------------------------- Helpers

function SummarySection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="grid gap-3 border-t border-border pt-4">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

function LinkButton({
  children,
  className,
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "text-sm font-medium text-primary underline-offset-4 hover:underline",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function ToolButton({
  children,
  icon,
  onClick,
}: {
  children: ReactNode
  icon: typeof Note01Icon
  onClick: () => void
}) {
  return (
    <Button type="button" size="sm" variant="outline" onClick={onClick}>
      <HugeiconsIcon icon={icon} data-icon="inline-start" aria-hidden="true" />
      {children}
    </Button>
  )
}
