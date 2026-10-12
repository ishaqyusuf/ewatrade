import { expect, test } from "bun:test"
import { generalAnswerSchema } from "@ewatrade/assistant/general/contracts"
import { generalStaffInvitationReviewAnswer } from "./general-staff-invitation-review"
import type { StaffInvitationReview } from "@ewatrade/db/queries"

test("blocked invitation answer preserves review-only facts within saved answer bounds", () => {
  const review: StaffInvitationReview = {
    version: 1, asOf: new Date().toISOString(), business: { id: "business", name: "N".repeat(600), slug: "business" },
    recipient: { email: `${"a".repeat(240)}@example.com`, name: null }, currentMembership: null,
    proposed: { status: "INVITED", role: "CASHIER", assignments: [{ storeId: "store", storeName: "S".repeat(600), role: "CASHIER" }], defaultStoreId: "store", catalogEditor: false },
    seats: { used: 2, limit: 2, additional: 1, planName: "Starter" },
    blockers: [{ code: "STAFF_SEAT_LIMIT", message: "No remaining staff seat." }],
    notification: { status: "not_requested", recipientEmail: "amina@example.com", sideEffect: "Email requires confirmation." }, warnings: [],
  }
  const answer = generalAnswerSchema.parse(generalStaffInvitationReviewAnswer(review))
  expect(answer.value).toBe("Blocked")
  expect(answer.detail).toContain("No invitation saved or email requested")
  expect(answer.detail).toContain("does not activate staff or authorize a command")
  expect(answer.target).toBeUndefined()
  expect(generalStaffInvitationReviewAnswer({ ...review, blockers: [] }).value).toBe("Review only")
})
