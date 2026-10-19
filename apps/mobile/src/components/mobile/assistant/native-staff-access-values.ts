import {
  type GeneralStaffAccessAction,
  staffAccessAction,
  staffAccessReviewInput,
} from "@ewatrade/assistant/general/staff-access"
import type { z } from "zod"

const editsSchema = staffAccessReviewInput.omit({ membershipId: true }).strict()
export type NativeStaffAccessEdits = z.infer<typeof editsSchema>
export type NativeStaffAccessReview = {
  membershipId: string
  expectedRevision: number
  availableStoresCoverage: string
  availableStores: { id: string; name: string }[]
  requiresLegacyCutoverConfirmation: boolean
  after: Omit<NativeStaffAccessEdits, "confirmLegacyCutover"> & {
    accessMode?: string
  }
}
export function nativeStaffAccessEdits(
  initial: GeneralStaffAccessAction,
): NativeStaffAccessEdits {
  return {
    assignments: initial.assignments.map((row) => ({ ...row })),
    defaultStoreId: initial.defaultStoreId,
    catalogEditor: initial.catalogEditor,
    // Each Edit visit requires a fresh, explicit legacy acknowledgment.
    confirmLegacyCutover: false,
  }
}
export function nativeStaffAccessFields(
  initial: GeneralStaffAccessAction,
  edits: NativeStaffAccessEdits,
  review: Pick<
    NativeStaffAccessReview,
    | "membershipId"
    | "availableStoresCoverage"
    | "availableStores"
    | "requiresLegacyCutoverConfirmation"
  >,
) {
  staffAccessAction.parse(initial)
  const fields = staffAccessReviewInput.parse({
    ...editsSchema.parse(edits),
    membershipId: initial.membershipId,
  })
  if (
    review.membershipId !== initial.membershipId ||
    review.availableStoresCoverage !== "complete"
  )
    throw Error("Reload the complete Store access review for this person.")
  const ids = fields.assignments.map((row) => row.storeId)
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !review.availableStores.some((store) => store.id === id))
  )
    throw Error("Choose each available Store only once.")
  if (
    ids.length === 0
      ? fields.defaultStoreId !== null
      : !fields.defaultStoreId || !ids.includes(fields.defaultStoreId)
  )
    throw Error("Choose a starting Store from the selected assignments.")
  if (
    fields.catalogEditor &&
    !fields.assignments.some((row) => row.role === "MANAGER")
  )
    throw Error("Catalog editing requires a Manager Store assignment.")
  if (review.requiresLegacyCutoverConfirmation && !fields.confirmLegacyCutover)
    throw Error("Acknowledge replacing the existing business-wide access.")
  return fields
}
export function nativeStaffAccessCandidate(
  initial: GeneralStaffAccessAction,
  edits: NativeStaffAccessEdits,
  review: NativeStaffAccessReview,
): GeneralStaffAccessAction {
  const fields = nativeStaffAccessFields(initial, edits, review)
  const canonical = (rows: { storeId: string; role: string }[]) =>
    JSON.stringify(
      rows
        .map(({ storeId, role }) => ({ storeId, role }))
        .sort((a, b) => a.storeId.localeCompare(b.storeId)),
    )
  if (
    canonical(fields.assignments) !== canonical(review.after.assignments) ||
    fields.defaultStoreId !== review.after.defaultStoreId ||
    fields.catalogEditor !== review.after.catalogEditor
  )
    throw Error("The fresh review does not match this draft. Review again.")
  return staffAccessAction.parse({
    action: "staff_access",
    ...fields,
    expectedRevision: review.expectedRevision,
  })
}

/** Synchronous single-flight and lifetime fence around the actual protected review. */
export function createNativeStaffAccessSaveSession() {
  let disposed = false
  let active: { onBusy: (busy: boolean) => void } | null = null
  let generation = 0
  return {
    activate() {
      disposed = false
    },
    cancel() {
      generation += 1
      const previous = active
      active = null
      if (!disposed) previous?.onBusy(false)
    },
    dispose() {
      disposed = true
      generation += 1
      active = null
    },
    async save(options: {
      initial: GeneralStaffAccessAction
      edits: NativeStaffAccessEdits
      shownReview: NativeStaffAccessReview
      read: (
        fields: z.infer<typeof staffAccessReviewInput>,
      ) => Promise<NativeStaffAccessReview>
      allowed: () => boolean
      onSave: (payload: GeneralStaffAccessAction) => void
      onBusy: (busy: boolean) => void
      onError: (message: string, stage: "fields" | "review") => void
    }) {
      if (disposed || active || !options.allowed()) return
      const token = { onBusy: options.onBusy }
      active = token
      const started = generation
      options.onBusy(true)
      let stage: "fields" | "review" = "fields"
      try {
        const fields = nativeStaffAccessFields(
          options.initial,
          options.edits,
          options.shownReview,
        )
        stage = "review"
        const fresh = await options.read(fields)
        if (disposed || started !== generation || !options.allowed()) return
        options.onSave(
          nativeStaffAccessCandidate(options.initial, options.edits, fresh),
        )
      } catch (cause) {
        if (!disposed && started === generation && options.allowed())
          options.onError(
            cause instanceof Error
              ? cause.message
              : "The current access review is unavailable.",
            stage,
          )
      } finally {
        if (active === token) {
          active = null
          if (!disposed && started === generation && options.allowed())
            options.onBusy(false)
        }
      }
    },
  }
}

/** No stale zero-work claim when the bounded workload receipt is incomplete. */
export function nativeStaffAccessWorkloadReady(
  value: unknown,
  membershipId: string,
): boolean {
  if (!value || typeof value !== "object") return false
  const work = value as Record<string, unknown>
  const identity = (v: unknown) =>
    typeof v === "string" &&
    v.length > 0 &&
    v.length <= 160 &&
    v.trim() === v &&
    Array.from(v).every((character) => character.charCodeAt(0) >= 32)
  const time = (v: unknown) =>
    typeof v === "string" &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString() === v
  if (
    work.membershipId !== membershipId ||
    !identity(membershipId) ||
    work.coverage !== "available" ||
    work.countCoverage !== "complete" ||
    work.attribution !== "current_assignee" ||
    work.scope !== "all_business_stores_current_assignee" ||
    work.storeId !== null ||
    !time(work.asOf) ||
    !Array.isArray(work.jobs) ||
    !Number.isSafeInteger(work.count) ||
    Number(work.count) < 0 ||
    !Number.isInteger(work.limit) ||
    Number(work.limit) < 1 ||
    Number(work.limit) > 50
  )
    return false
  const jobs = work.jobs as unknown[]
  if (
    work.shown !== jobs.length ||
    work.shown !== Math.min(Number(work.count), Number(work.limit)) ||
    work.hasMore !== Number(work.count) > jobs.length ||
    work.detailsCoverage !== (work.hasMore ? "limited" : "complete")
  )
    return false
  const ids = new Set<string>()
  for (const value of jobs) {
    if (!value || typeof value !== "object") return false
    const job = value as Record<string, unknown>
    if (
      !identity(job.jobId) ||
      !identity(job.storeId) ||
      typeof job.storeName !== "string" ||
      !job.storeName.trim() ||
      !["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"].includes(
        String(job.storeStatus),
      ) ||
      !["NORMAL", "URGENT"].includes(String(job.priority)) ||
      !Number.isSafeInteger(job.revision) ||
      Number(job.revision) < 0 ||
      !time(job.createdAt) ||
      ids.has(String(job.jobId))
    )
      return false
    ids.add(String(job.jobId))
  }
  return true
}

/** Parent render changes the scope immediately, before passive child cleanup. */
export function createNativeStaffAccessScopeFence() {
  let current = ""
  let mounted = true
  return {
    update(scope: string) {
      current = scope
    },
    activate() {
      mounted = true
    },
    dispose() {
      mounted = false
    },
    isCurrent(scope: string) {
      return mounted && current === scope
    },
  }
}
