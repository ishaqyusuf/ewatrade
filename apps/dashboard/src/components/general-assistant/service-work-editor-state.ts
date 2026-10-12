import {
  type ServiceWorkEditorAction,
  type ServiceWorkEditorContext,
  serviceWorkEditorActionSchema,
} from "@ewatrade/assistant/general/contracts"

export type ServiceWorkEditorScope = {
  tenantId: string
  storeId: string
  actorUserId: string
}
export function serviceWorkEditorTarget(action: ServiceWorkEditorAction) {
  return {
    jobId: action.jobId,
    lineId: "lineId" in action ? action.lineId : undefined,
  }
}
export function serviceWorkEditorContextMatches(
  context: ServiceWorkEditorContext,
  scope: ServiceWorkEditorScope,
  action: ServiceWorkEditorAction,
) {
  const target = serviceWorkEditorTarget(action)
  return (
    context.tenantId === scope.tenantId &&
    context.storeId === scope.storeId &&
    context.actorUserId === scope.actorUserId &&
    context.job.id === target.jobId &&
    (context.line?.id ?? null) === (target.lineId ?? null)
  )
}
export function serviceWorkEditorReviewMatches(
  review: ServiceWorkEditorScope & { jobId: string; lineId: string | null },
  scope: ServiceWorkEditorScope,
  action: ServiceWorkEditorAction,
) {
  const target = serviceWorkEditorTarget(action)
  return (
    review.tenantId === scope.tenantId &&
    review.storeId === scope.storeId &&
    review.actorUserId === scope.actorUserId &&
    review.jobId === target.jobId &&
    review.lineId === (target.lineId ?? null)
  )
}
/** Exact Job/Line are fixed; changing them requires a different reviewed draft. */
export function parseServiceWorkEditorDraft(
  initial: ServiceWorkEditorAction,
  value: ServiceWorkEditorAction,
  context: ServiceWorkEditorContext,
) {
  const draft = serviceWorkEditorActionSchema.parse(value)
  const before = serviceWorkEditorTarget(initial)
  const after = serviceWorkEditorTarget(draft)
  if (
    initial.action !== draft.action ||
    before.jobId !== after.jobId ||
    before.lineId !== after.lineId ||
    !serviceWorkEditorContextMatches(context, context, draft)
  )
    throw new Error("The selected saved Job or Line changed. Open a new draft.")
  if (
    draft.action === "service_job_assign" &&
    (!context.assigneesComplete ||
      !context.assignees.some((row) => row.id === draft.assigneeUserId))
  )
    throw new Error(
      "Choose an eligible assignee from the complete current Store choices.",
    )
  return draft
}
