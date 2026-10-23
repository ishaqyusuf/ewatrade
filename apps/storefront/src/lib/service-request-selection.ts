export function serviceOfferingHint(value: unknown) {
  if (typeof value !== "string") return null
  const id = value.trim()
  return id.length > 0 && id.length <= 191 ? id : null
}

export function serviceRequestFormHref(input: {
  publicToken: string
  conversationId: string
  offeringId?: string | null
}) {
  const query = new URLSearchParams({ conversationId: input.conversationId })
  if (input.offeringId) query.set("serviceOfferingId", input.offeringId)
  return `/r/${encodeURIComponent(input.publicToken)}/service?${query}`
}

// A navigation hint can select only an offering in the current server-owned form.
export function selectedRequestOffering<T extends { id: string }>(
  offerings: readonly T[],
  hint: unknown,
) {
  const id = serviceOfferingHint(hint)
  return id ? (offerings.find((offering) => offering.id === id) ?? null) : null
}
