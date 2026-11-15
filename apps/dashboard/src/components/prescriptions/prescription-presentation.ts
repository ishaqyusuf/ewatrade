/**
 * Plain words for the prescription record: statuses, how it came in,
 * pickup or delivery, pharmacist decisions and media states.
 */
const WORDS: Record<string, string> = {
  // Request statuses
  received: "New",
  media_review: "Photo to check",
  needs_clearer_media: "Waiting for a clearer photo",
  transcribing: "Being typed up",
  attendant_verification: "Waiting for an attendant check",
  pharmacist_review: "Waiting for a pharmacist check",
  ready_to_quote: "Ready to price",
  quoted: "Price sent",
  needs_clarification: "Waiting for the customer",
  converted: "Order made",
  declined: "Declined",
  expired: "Expired",
  withdrawn: "Withdrawn",
  // How it came in
  staff_walk_in: "Walk-in at the counter",
  staff_phone: "By phone",
  web: "Website",
  whatsapp: "WhatsApp",
  // Fulfilment
  pickup: "Pickup",
  delivery: "Delivery",
  unspecified: "Not chosen yet",
  // Pharmacist decisions
  released: "Approve",
  // Transcript and media states
  completed: "Done",
  draft: "Draft",
  pending: "Waiting",
  accepted: "Accepted",
  rejected: "Rejected",
  available: "In stock",
  unavailable: "Not in stock",
}

export function formatPrescriptionStatus(value: string) {
  const key = value.toLowerCase()
  const word = WORDS[key]
  if (word) return word
  const plain = key.replaceAll("_", " ")
  return plain.charAt(0).toUpperCase() + plain.slice(1)
}
