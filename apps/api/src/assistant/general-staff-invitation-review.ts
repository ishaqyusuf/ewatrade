import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { staffInvitationReviewInput, type StaffInvitationReview } from "@ewatrade/db/queries"

export const generalStaffInvitationReviewInput = staffInvitationReviewInput

export function generalStaffInvitationReviewAnswer(review: StaffInvitationReview): GeneralAnswer {
  const startingStore = review.proposed.assignments.find(row => row.storeId === review.proposed.defaultStoreId)!
  const summary = review.blockers.length
    ? review.blockers.map(row => row.message).join(" ")
    : "No blocker found in this review. Invitation confirmation is still required."
  return {
    id: crypto.randomUUID(),
    title: "Staff invitation review",
    value: review.blockers.length ? "Blocked" : "Review only",
    scope: review.business.name.slice(0, 500),
    asOf: review.asOf,
    detail: `No invitation saved or email requested. This review does not activate staff or authorize a command. Confirmation would request an invitation email to ${review.recipient.email}; ${review.proposed.assignments.length} Store assignment(s); starts at ${startingStore.storeName.slice(0, 100)} as ${startingStore.role}. Catalog editing: ${review.proposed.catalogEditor ? "requested" : "not requested"}. Staff seats: ${review.seats.used}/${review.seats.limit ?? "unlimited"}; additional: ${review.seats.additional}. ${summary} Onboarding would be required for access.`.slice(0, 1000),
  }
}
