export function effectiveAssistantAllowance(
  budget: { tokens: number; requests: number; windowStartedAt: Date } | null,
  limits: { maxTokens: number; maxRequests: number; windowMs: number },
  now = new Date(),
) {
  const active =
    budget && now.getTime() - budget.windowStartedAt.getTime() < limits.windowMs
      ? budget
      : null
  const tokensUsed = active?.tokens ?? 0
  const requestsUsed = active?.requests ?? 0
  return {
    tokensUsed,
    tokensRemaining: Math.max(0, limits.maxTokens - tokensUsed),
    tokenLimit: limits.maxTokens,
    requestsUsed,
    requestsRemaining: Math.max(0, limits.maxRequests - requestsUsed),
    requestLimit: limits.maxRequests,
    resetsAt: active
      ? new Date(active.windowStartedAt.getTime() + limits.windowMs)
      : null,
    exhausted:
      tokensUsed >= limits.maxTokens || requestsUsed >= limits.maxRequests,
    windowDays: limits.windowMs / 86400000,
  }
}
