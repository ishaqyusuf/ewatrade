import {
  type ServiceWorkEditorAction,
  type ServiceWorkEditorContext,
  serviceWorkEditorActionSchema,
  serviceWorkEditorContextSchema,
} from "@ewatrade/assistant/general/contracts"
import { z } from "zod"

export const nativeServiceWorkActions = [
  "service_job_assign",
  "service_job_reschedule",
  "service_job_line_transition",
  "service_work_note",
  "service_work_exception",
  "service_work_rework",
  "service_work_handoff",
] as const
export type NativeServiceWorkScope = {
  tenantId: string
  storeId: string
  actorUserId: string
  role: string
  accessMode?: string
}
const id = z.string().trim().min(1).max(128)
const tenantProjection = z.object({
  tenant: z.object({ id }),
  activeStore: z.object({ id, status: z.literal("ACTIVE") }),
  actorUserId: id,
  membership: z.object({
    tenantId: id,
    role: z.string(),
    staffAccessMode: z.string().optional(),
  }),
  staffAccess: z
    .object({ status: z.literal("ACTIVE"), mode: z.string() })
    .optional(),
})
const reviewProjection = z
  .object({
    tenantId: id,
    storeId: id,
    actorUserId: id,
    jobId: id,
    lineId: id.nullable(),
    target: z
      .object({ id, revision: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict(),
    lines: z.array(z.string().min(1)).min(1),
  })
  .strict()

export function nativeServiceWorkTarget(action: ServiceWorkEditorAction) {
  return {
    jobId: action.jobId,
    lineId: "lineId" in action ? action.lineId : undefined,
  }
}

/** Compare a fresh protected tenant.current result with the current native profile. */
export function nativeServiceWorkScope(
  raw: unknown,
  expected: NativeServiceWorkScope,
) {
  const current = tenantProjection.parse(raw)
  const mode = current.membership.staffAccessMode ?? current.staffAccess?.mode
  if (
    current.tenant.id !== expected.tenantId ||
    current.membership.tenantId !== expected.tenantId ||
    current.activeStore.id !== expected.storeId ||
    current.actorUserId !== expected.actorUserId ||
    current.membership.role !== expected.role ||
    (expected.accessMode !== undefined && mode !== expected.accessMode) ||
    !["OWNER", "ADMIN", "MANAGER"].includes(current.membership.role) ||
    (current.membership.role === "MANAGER" && mode !== "LEGACY")
  )
    throw Error(
      "The current business, Store or service access changed. Review again.",
    )
  return expected
}

export function nativeServiceWorkContext(
  raw: unknown,
  scope: NativeServiceWorkScope,
  action: ServiceWorkEditorAction,
): ServiceWorkEditorContext {
  const context = serviceWorkEditorContextSchema.parse(raw)
  const target = nativeServiceWorkTarget(action)
  if (
    context.tenantId !== scope.tenantId ||
    context.storeId !== scope.storeId ||
    context.actorUserId !== scope.actorUserId ||
    context.job.id !== target.jobId ||
    (context.line?.id ?? null) !== (target.lineId ?? null) ||
    new Set(context.assignees.map((row) => row.id)).size !==
      context.assignees.length
  )
    throw Error(
      "The selected saved Job, Line or current service choices changed. Review again.",
    )
  return context
}

/** Payload schemas keep all seven intentions exact; timestamps/quantities stay strings. */
export function nativeServiceWorkDraft(
  initial: ServiceWorkEditorAction,
  raw: unknown,
): ServiceWorkEditorAction {
  const before = serviceWorkEditorActionSchema.parse(initial)
  const draft = serviceWorkEditorActionSchema.parse(raw)
  if (
    before.action !== draft.action ||
    before.jobId !== draft.jobId ||
    ("lineId" in before ? before.lineId : undefined) !==
      ("lineId" in draft ? draft.lineId : undefined)
  )
    throw Error(
      "The selected saved Job, Line or action changed. Open a new draft.",
    )
  return draft
}

export function nativeServiceWorkCandidate(
  initial: ServiceWorkEditorAction,
  raw: unknown,
  context: unknown,
  scope: NativeServiceWorkScope,
) {
  const draft = nativeServiceWorkDraft(initial, raw)
  const current = nativeServiceWorkContext(context, scope, draft)
  if (
    draft.action === "service_job_assign" &&
    (!current.assigneesComplete ||
      !current.assignees.some((row) => row.id === draft.assigneeUserId))
  )
    throw Error(
      "Choose an eligible assignee from the complete current Store choices.",
    )
  return draft
}

/** Contact labels never broaden the complete canonical Store eligibility list. */
export function nativeServiceWorkAssignees(
  context: ServiceWorkEditorContext,
  raw: unknown,
) {
  const rows = z
    .array(z.object({ id, name: z.string().min(1), email: z.string().min(1) }))
    .parse(raw)
  if (!context.assigneesComplete)
    throw Error("The complete eligible Store staff choices are unavailable.")
  return context.assignees.map((eligible) => {
    const matches = rows.filter((row) => row.id === eligible.id)
    const match = matches[0]
    if (matches.length !== 1 || !match)
      throw Error(
        "Reload the current staff identities for these Store choices.",
      )
    return match
  })
}

/** The unique protected request owns the exact intent; its DTO must match scope/target. */
export function nativeServiceWorkReview(
  raw: unknown,
  scope: NativeServiceWorkScope,
  action: ServiceWorkEditorAction,
) {
  const review = reviewProjection.parse(raw)
  const target = nativeServiceWorkTarget(action)
  const targetId =
    action.action === "service_work_rework"
      ? action.jobId
      : (target.lineId ?? action.jobId)
  if (
    review.tenantId !== scope.tenantId ||
    review.storeId !== scope.storeId ||
    review.actorUserId !== scope.actorUserId ||
    review.jobId !== target.jobId ||
    review.lineId !== (target.lineId ?? null) ||
    review.target.id !== targetId
  )
    throw Error(
      "The fresh service review does not match this saved work and scope.",
    )
  return review
}

/** Single-flight ownership survives cleanup/re-activation without accepting old work. */
export function createNativeServiceWorkSave(options: {
  initial: ServiceWorkEditorAction
  scope: NativeServiceWorkScope
  isCurrent: () => boolean
  fetchTenant: () => Promise<unknown>
  fetchContext: (
    target: ReturnType<typeof nativeServiceWorkTarget>,
  ) => Promise<unknown>
  fetchAssignees: () => Promise<unknown>
  fetchReview: (draft: ServiceWorkEditorAction) => Promise<unknown>
  onSave: (draft: ServiceWorkEditorAction) => void
}) {
  let active = true
  let generation = 0
  let pending: object | null = null
  return {
    activate() {
      active = true
    },
    invalidate() {
      active = false
      generation++
      pending = null
    },
    async save(raw: unknown, intentIsCurrent: () => boolean = () => true) {
      if (!active || pending || !options.isCurrent() || !intentIsCurrent())
        return { state: "ignored" as const }
      const owner = {}
      const lifetime = generation
      pending = owner
      const current = () =>
        active &&
        generation === lifetime &&
        pending === owner &&
        options.isCurrent() &&
        intentIsCurrent()
      let stage: "input" | "review" = "input"
      try {
        const candidate = nativeServiceWorkDraft(options.initial, raw)
        stage = "review"
        const tenant = await options.fetchTenant()
        if (!current()) return { state: "ignored" as const }
        nativeServiceWorkScope(tenant, options.scope)
        const context = await options.fetchContext(
          nativeServiceWorkTarget(candidate),
        )
        if (!current()) return { state: "ignored" as const }
        const draft = nativeServiceWorkCandidate(
          options.initial,
          candidate,
          context,
          options.scope,
        )
        if (draft.action === "service_job_assign") {
          const identities = await options.fetchAssignees()
          if (!current()) return { state: "ignored" as const }
          nativeServiceWorkAssignees(
            nativeServiceWorkContext(context, options.scope, draft),
            identities,
          )
        }
        const review = await options.fetchReview(draft)
        if (!current()) return { state: "ignored" as const }
        nativeServiceWorkReview(review, options.scope, draft)
        options.onSave(draft)
        return { state: "saved" as const }
      } catch (cause) {
        if (!current()) return { state: "ignored" as const }
        return {
          state: "error" as const,
          stage,
          error:
            cause instanceof z.ZodError
              ? (cause.issues[0]?.message ??
                "Check this service draft and review again.")
              : cause instanceof Error
                ? cause.message
                : "The current service review is unavailable.",
        }
      } finally {
        if (generation === lifetime && pending === owner) pending = null
      }
    },
  }
}
