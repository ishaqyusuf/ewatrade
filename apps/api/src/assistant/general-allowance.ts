import type { AssistantScope } from "@ewatrade/db/assistant"
import type { TRPCContext } from "../trpc/init"
export const GENERAL_BUDGET_LIMITS = {
  maxRequests: 100,
  maxTokens: 600_000,
  windowMs: 32 * 24 * 60 * 60 * 1000,
}
export function generalBudgetScopeKey(
  scope: Pick<AssistantScope, "tenantId">,
  now = new Date(),
) {
  return `assistant:${scope.tenantId}:GENERAL:${now.toISOString().slice(0, 7)}`
}
export async function readGeneralAllowance(
  db: TRPCContext["db"],
  scope: AssistantScope,
) {
  const row = await db.assistantBudget.findUnique({
    where: { scopeKey: generalBudgetScopeKey(scope) },
    select: { requests: true, tokens: true },
  })
  const now = new Date()
  return {
    remainingRequests: Math.max(
      0,
      GENERAL_BUDGET_LIMITS.maxRequests - (row?.requests ?? 0),
    ),
    remainingTokens: Math.max(
      0,
      GENERAL_BUDGET_LIMITS.maxTokens - (row?.tokens ?? 0),
    ),
    resetsAt: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    ).toISOString(),
  }
}
