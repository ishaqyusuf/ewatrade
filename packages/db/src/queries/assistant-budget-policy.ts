export type AssistantBudgetLimits = {
  /** Omitted for token-only GENERAL; other workflows retain their existing limits. */
  maxRequests?: number
  maxTokens: number
  windowMs: number
}

/** Admission uses counted usage; a missing reply ceiling never disables the token ceiling. */
export function assistantBudgetAdmission(
  usage: { requests: number; tokens: number },
  limits: AssistantBudgetLimits,
) {
  const tokensLeft = Math.max(0, limits.maxTokens - usage.tokens)
  if (
    tokensLeft <= 0 ||
    (limits.maxRequests !== undefined && usage.requests >= limits.maxRequests)
  )
    return { allowed: false as const, remainingRequests: 0 }
  return {
    allowed: true as const,
    // Deprecated numeric transport marker for installed clients. Not a reply allowance.
    remainingRequests:
      limits.maxRequests === undefined
        ? tokensLeft
        : limits.maxRequests - usage.requests - 1,
  }
}
