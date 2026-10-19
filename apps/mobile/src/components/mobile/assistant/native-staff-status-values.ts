import {
  type GeneralStaffStatusAction,
  staffStatusAction,
  staffStatusReviewInput,
} from "@ewatrade/assistant/general/staff-status"
import type { z } from "zod"
import { nativeValidationMessage } from "./native-validation-copy"

const fieldsSchema = staffStatusReviewInput.omit({ membershipId: true })
export type NativeStaffStatusFields = z.infer<typeof fieldsSchema>
export type NativeStaffStatusInput = z.infer<typeof staffStatusReviewInput>
export type NativeStaffStatusReview = {
  membershipId: string
  nextStatus: string
  reason: string | null
  expectedRevision: number
}

export function nativeStaffStatusInput(
  initial: GeneralStaffStatusAction,
  fields: unknown,
): NativeStaffStatusInput {
  return staffStatusReviewInput.parse({
    membershipId: staffStatusAction.parse(initial).membershipId,
    ...fieldsSchema.parse(fields),
  })
}

export function nativeStaffStatusCandidate(
  input: NativeStaffStatusInput,
  review: NativeStaffStatusReview,
): GeneralStaffStatusAction {
  const current = staffStatusReviewInput.parse(input)
  if (
    review.membershipId !== current.membershipId ||
    review.nextStatus !== current.status.toUpperCase() ||
    review.reason !== current.reason
  )
    throw Error("The staff review changed. Review this choice again.")
  return staffStatusAction.parse({
    action: "staff_status",
    ...current,
    expectedRevision: review.expectedRevision,
  })
}

/** One mounted draft owns its read-only review requests and callbacks. */
export function createNativeStaffStatusSave(options: {
  initial: GeneralStaffStatusAction
  isCurrent: () => boolean
  fetchReview: (
    input: NativeStaffStatusInput,
  ) => Promise<NativeStaffStatusReview>
  onSave: (payload: GeneralStaffStatusAction) => void
}) {
  let active = true
  let generation = 0
  let pending = false
  return {
    activate() {
      active = true
    },
    invalidate() {
      active = false
      generation += 1
      pending = false
    },
    async save(fields: unknown) {
      if (!active || !options.isCurrent() || pending)
        return { state: "ignored" as const }
      pending = true
      const request = generation
      let stage: "input" | "review" = "input"
      const current = () =>
        active && request === generation && options.isCurrent()
      try {
        const input = nativeStaffStatusInput(options.initial, fields)
        stage = "review"
        const review = await options.fetchReview(input)
        if (!current()) return { state: "ignored" as const }
        const payload = nativeStaffStatusCandidate(input, review)
        options.onSave(payload)
        return { state: "saved" as const }
      } catch (cause) {
        if (!current()) return { state: "ignored" as const }
        return {
          state: "error" as const,
          stage,
          error: nativeValidationMessage(
            cause,
            "The current staff review is unavailable.",
          ),
        }
      } finally {
        if (request === generation) pending = false
      }
    },
  }
}
