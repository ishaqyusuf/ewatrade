import { randomBytes } from "node:crypto"

const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

/** A matching hint only. Never use this reference to authorize or identify cash. */
export function createManualPaymentReference() {
  return `EWA-${Array.from(randomBytes(10), (byte) => alphabet[byte & 31]).join("")}`
}

export function normalizePaymentNarration(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase()
}

export function paymentReferenceMatches(reference: string, narration: string) {
  const expected = normalizePaymentNarration(reference)
  const observed = normalizePaymentNarration(narration)
  // Preserve punctuation and token boundaries: partial/truncated narration is unknown.
  return observed.split(" ").includes(expected)
}
