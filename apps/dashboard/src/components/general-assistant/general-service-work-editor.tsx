"use client"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"
import {
  type ServiceWorkEditorAction,
  type ServiceWorkEditorContext,
  serviceWorkEditorActionSchema,
  serviceWorkEditorContextSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  Button,
  ControlField,
  FieldGroup,
  Input,
  SelectControl,
  Textarea,
} from "@ewatrade/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { preserveReviewedTimestamp } from "./posting-date"
import { serviceIntakeEditorReadState } from "./service-intake-editor-options"
import {
  type ServiceWorkEditorScope,
  parseServiceWorkEditorDraft,
  serviceWorkEditorContextMatches,
  serviceWorkEditorTarget,
  serviceWorkEditorReviewMatches,
} from "./service-work-editor-state"

type Props = {
  initial: ServiceWorkEditorAction
  disabled: boolean
  onSave: (payload: ServiceWorkEditorAction) => void
  onCancel: () => void
}
function scopeKey(scope: ServiceWorkEditorScope) {
  return `${scope.tenantId}:${scope.storeId}:${scope.actorUserId}`
}
export function GeneralServiceWorkEditor(props: Props) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const context = useQuery(
    trpc.tenant.current.queryOptions(undefined, { retry: false, staleTime: 0 }),
  )
  const contextReady = serviceIntakeEditorReadState([context]) === "ready"
  const scope: ServiceWorkEditorScope | null =
    contextReady && context.data?.activeStore
      ? {
          tenantId: context.data.tenant.id,
          storeId: context.data.activeStore.id,
          actorUserId: context.data.actorUserId,
        }
      : null
  const input = serviceWorkEditorTarget(props.initial)
  const choices = useQuery(
    trpc.serviceAssistantWork.editorContext.queryOptions(input, {
      enabled: Boolean(scope),
      retry: false,
      staleTime: 0,
    }),
  )
  const state = serviceIntakeEditorReadState([context, choices])
  const parsed =
    state === "ready"
      ? serviceWorkEditorContextSchema.safeParse(choices.data)
      : null
  const reviewed =
    parsed?.success &&
    scope &&
    serviceWorkEditorContextMatches(parsed.data, scope, props.initial)
      ? parsed.data
      : null
  const unavailable =
    state === "unavailable" ||
    (state === "ready" && !reviewed) ||
    (contextReady && !scope)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(false)
  const latestScope = useRef<string | null>(null)
  const allowed = useRef(false)
  latestScope.current = scope ? scopeKey(scope) : null
  allowed.current = Boolean(reviewed) && !props.disabled
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const save = async (value: ServiceWorkEditorAction) => {
    if (!reviewed || !scope || !allowed.current || pending) return
    const expectedScope = scopeKey(scope)
    setPending(true)
    setError(null)
    const currentRequest = () =>
      active.current && allowed.current && latestScope.current === expectedScope
    try {
      const fresh = serviceWorkEditorContextSchema.parse(
        await client.fetchQuery(
          trpc.serviceAssistantWork.editorContext.queryOptions(input, {
            retry: false,
            staleTime: 0,
            networkMode: "always",
          }),
        ),
      )
      if (!serviceWorkEditorContextMatches(fresh, scope, props.initial))
        throw new Error(
          "The current business, Store or saved work changed. Review again.",
        )
      const draft = parseServiceWorkEditorDraft(props.initial, value, fresh)
      const review = await client.fetchQuery(
        trpc.serviceAssistantWork.review.queryOptions(draft, {
          retry: false,
          staleTime: 0,
          networkMode: "always",
        }),
      )
      if (!serviceWorkEditorReviewMatches(review, scope, draft))
        throw new Error(
          "The current work review does not match this saved target.",
        )
      if (currentRequest()) props.onSave(draft)
    } catch (cause) {
      if (active.current && latestScope.current === expectedScope)
        setError(
          cause instanceof Error
            ? cause.message
            : "The current work review is unavailable.",
        )
    } finally {
      if (active.current) setPending(false)
    }
  }
  return (
    <GeneralServiceWorkEditorView
      {...props}
      disabled={props.disabled || pending}
      context={reviewed}
      loading={state === "loading" || state === "paused"}
      unavailable={unavailable}
      error={reviewed ? error : null}
      onReviewSave={save}
      onRetry={() => {
        void context.refetch()
        void choices.refetch()
      }}
    />
  )
}

const workStates = [
  { value: "queued", label: "Queued" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "ready_for_handoff", label: "Ready for handoff" },
  { value: "cancelled", label: "Cancelled" },
]
const exceptionTypes = [
  { value: "delay", label: "Delay" },
  { value: "quality", label: "Quality issue" },
  { value: "failed_attempt", label: "Failed attempt" },
  { value: "customer_rejection", label: "Customer rejection" },
  { value: "other", label: "Other issue" },
]
export function GeneralServiceWorkEditorView({
  initial,
  disabled,
  context,
  loading = false,
  unavailable = false,
  error,
  onReviewSave,
  onCancel,
  onRetry,
}: Omit<Props, "onSave"> & {
  context: ServiceWorkEditorContext | null
  loading?: boolean
  unavailable?: boolean
  error?: string | null
  onReviewSave: (payload: ServiceWorkEditorAction) => void | Promise<void>
  onRetry: () => void
}) {
  const form = useZodForm<ServiceWorkEditorAction>(
    serviceWorkEditorActionSchema,
    { defaultValues: initial },
  )
  const draft = form.watch()
  const [due, setDue] = useState(
    initial.action === "service_job_reschedule"
      ? new Date(initial.promisedAt).toISOString().slice(0, 19)
      : "",
  )
  const ready = !loading && !unavailable && Boolean(context)
  const canAssign =
    draft.action !== "service_job_assign" ||
    Boolean(
      context?.assigneesComplete &&
        context.assignees.some((row) => row.id === draft.assigneeUserId),
    )
  const fieldError = (field: string) =>
    Object.entries(form.formState.errors)
      .find(([key]) => key === field)?.[1]
      ?.message?.toString()
  const save = form.handleSubmit(async (value) => {
    if (ready && canAssign && !disabled && context) {
      try {
        await onReviewSave(parseServiceWorkEditorDraft(initial, value, context))
      } catch (cause) {
        form.setError("root", {
          message:
            cause instanceof Error ? cause.message : "Review unavailable.",
        })
      }
    }
  })
  return (
    <form className="grid gap-5" noValidate onSubmit={save}>
      {!ready ? (
        <div className="grid gap-2" role={loading ? "status" : "alert"}>
          <p>
            {loading
              ? "Loading current Service work review…"
              : "Current Service work is unavailable with this business or Store access."}
          </p>
          {!loading ? (
            <Button type="button" variant="outline" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </div>
      ) : context ? (
        <>
          <div className="grid gap-2 rounded-lg border p-4 text-sm">
            <p className="font-medium">
              {context.job.orderNumber} ·{" "}
              {context.job.customerName ?? "Service customer"}
            </p>
            {context.line ? (
              <>
                <p>
                  {context.line.offeringName} · {context.line.variantName} ·{" "}
                  {context.line.quantity}
                </p>
                <p>
                  Current work:{" "}
                  {context.line.status.toLowerCase().replaceAll("_", " ")}.
                  Authorization:{" "}
                  {context.line.authorizationStatus.toLowerCase()}.
                </p>
              </>
            ) : (
              <p>Whole saved Service Job.</p>
            )}
            {initial.action === "service_job_reschedule" ? (
              <p>Current promise: {context.job.promisedAt ?? "None"}.</p>
            ) : null}
          </div>
          <FieldGroup>
            {draft.action === "service_job_assign" ? (
              <>
                <ControlField
                  label="Assign to"
                  error={fieldError("assigneeUserId")}
                >
                  <SelectControl
                    value={draft.assigneeUserId}
                    disabled={disabled || !context.assigneesComplete}
                    options={[
                      ...(!context.assignees.some(
                        (row) => row.id === draft.assigneeUserId,
                      )
                        ? [
                            {
                              value: draft.assigneeUserId,
                              label: "Selected assignee is unavailable",
                            },
                          ]
                        : []),
                      ...context.assignees.map((row) => ({
                        value: row.id,
                        label: row.name,
                      })),
                    ]}
                    onValueChange={(value) =>
                      form.setValue("assigneeUserId", value, {
                        shouldValidate: true,
                      })
                    }
                  />
                </ControlField>
                {!context.assigneesComplete ? (
                  <p role="alert">
                    The eligible staff list exceeds these bounded choices.
                    Assignment cannot be reviewed here.
                  </p>
                ) : !canAssign ? (
                  <p role="alert">Choose an eligible assignee at this Store.</p>
                ) : null}
              </>
            ) : null}
            {draft.action === "service_work_rework" ? (
              <ControlField
                label="Rework quantity"
                error={fieldError("quantity")}
              >
                <Input
                  value={draft.quantity}
                  inputMode="decimal"
                  disabled={disabled}
                  onChange={(event) =>
                    form.setValue("quantity", event.target.value, {
                      shouldValidate: true,
                    })
                  }
                />
              </ControlField>
            ) : null}
            {draft.action === "service_work_handoff" ? (
              <ControlField
                label="Collection note (optional)"
                error={fieldError("note")}
              >
                <Textarea
                  value={draft.note ?? ""}
                  maxLength={500}
                  disabled={disabled}
                  onChange={(event) =>
                    form.setValue("note", event.target.value, {
                      shouldValidate: true,
                    })
                  }
                />
              </ControlField>
            ) : null}
            {draft.action === "service_job_reschedule" ? (
              <ControlField
                label="Promised date and time (UTC)"
                error={fieldError("promisedAt")}
              >
                <Input
                  type="datetime-local"
                  step={1}
                  required
                  disabled={disabled}
                  value={due}
                  onChange={(event) => {
                    const value = event.target.value
                    setDue(value)
                    const date = new Date(`${value}Z`)
                    form.setValue(
                      "promisedAt",
                      value && Number.isFinite(date.getTime())
                        ? preserveReviewedTimestamp(
                            date,
                            initial.action === "service_job_reschedule"
                              ? initial.promisedAt
                              : "",
                          )
                        : "",
                      { shouldValidate: true },
                    )
                  }}
                />
              </ControlField>
            ) : null}
            {draft.action === "service_job_line_transition" ? (
              <ControlField
                label="Next work state"
                error={fieldError("toStatus")}
              >
                <SelectControl
                  value={draft.toStatus}
                  options={workStates}
                  disabled={disabled}
                  onValueChange={(value) => {
                    const parsed = serviceWorkEditorActionSchema.safeParse({
                      ...draft,
                      toStatus: value,
                    })
                    // Block/cancel require a reason; preserve the chosen state while it is entered.
                    if (workStates.some((row) => row.value === value))
                      form.setValue(
                        "toStatus",
                        value as typeof draft.toStatus,
                        { shouldValidate: true },
                      )
                    if (parsed.success) form.clearErrors("toStatus")
                  }}
                />
              </ControlField>
            ) : null}
            {"reason" in draft ||
            draft.action === "service_job_assign" ||
            draft.action === "service_job_line_transition" ? (
              <ControlField
                label={
                  draft.action === "service_job_reschedule" ||
                  draft.action === "service_work_rework" ||
                  (draft.action === "service_job_line_transition" &&
                    ["blocked", "cancelled"].includes(draft.toStatus))
                    ? "Reason"
                    : "Reason (optional)"
                }
                error={fieldError("reason")}
              >
                <Textarea
                  value={"reason" in draft ? (draft.reason ?? "") : ""}
                  onChange={(event) =>
                    form.setValue(
                      "reason",
                      event.target.value.trim()
                        ? event.target.value
                        : undefined,
                      { shouldValidate: true },
                    )
                  }
                  maxLength={500}
                  disabled={disabled}
                />
              </ControlField>
            ) : null}
            {draft.action === "service_work_note" ? (
              <ControlField
                label="Internal work note"
                error={fieldError("body")}
              >
                <Textarea
                  value={draft.body}
                  onChange={(event) =>
                    form.setValue("body", event.target.value, {
                      shouldValidate: true,
                    })
                  }
                  maxLength={4000}
                  disabled={disabled}
                />
              </ControlField>
            ) : null}
            {draft.action === "service_work_exception" ? (
              <>
                <ControlField
                  label="Exception category"
                  error={fieldError("type")}
                >
                  <SelectControl
                    value={draft.type}
                    options={exceptionTypes}
                    disabled={disabled}
                    onValueChange={(value) => {
                      if (exceptionTypes.some((row) => row.value === value))
                        form.setValue("type", value as typeof draft.type, {
                          shouldValidate: true,
                        })
                    }}
                  />
                </ControlField>
                <ControlField
                  label="What happened?"
                  error={fieldError("description")}
                >
                  <Textarea
                    value={draft.description}
                    onChange={(event) =>
                      form.setValue("description", event.target.value, {
                        shouldValidate: true,
                      })
                    }
                    maxLength={2000}
                    disabled={disabled}
                  />
                </ControlField>
              </>
            ) : null}
          </FieldGroup>
          <p className="text-sm text-muted-foreground">
            The saved Job and Line stay fixed. Save loads a fresh review and
            updates this draft; separate app confirmation is required.
          </p>
          <p className="text-sm text-muted-foreground">
            {draft.action === "service_work_note" ||
            draft.action === "service_work_exception"
              ? "Private work records preserve work, payment and handoff state. Exceptions start open."
              : draft.action === "service_work_rework"
                ? "Creates new queued linked work. Completed original work and any prior handoff stay recorded; no new sale or payment."
                : draft.action === "service_work_handoff"
                  ? "Review requires authorized ready work and a settled balance. Outstanding due reminders are cancelled; no payment or customer update is created."
                  : draft.action === "service_job_reschedule"
                    ? "Review shows the exact replacement or cancellation of due reminders. Provider delivery remains separate."
                    : "Ready is a work milestone. Payment and handoff are separate actions."}
          </p>
          {error || form.formState.errors.root?.message ? (
            <p role="alert" className="text-sm text-destructive">
              {error ?? form.formState.errors.root?.message}
            </p>
          ) : null}
        </>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={disabled || !ready || !canAssign}>
          Save and review
        </Button>
      </div>
    </form>
  )
}
