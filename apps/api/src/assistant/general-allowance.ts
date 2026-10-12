import type { AssistantScope } from "@ewatrade/db/assistant"
import type { TRPCContext } from "../trpc/init"
const MONTHLY_WINDOW_MS = 32 * 24 * 60 * 60 * 1000
/** Hosted limits guard real model spend per workspace and month. */
const HOSTED_LIMITS = { maxRequests: 100, maxTokens: 600_000 }
/**
 * Local dev runs long QA sessions: usage is still counted, with a higher
 * ceiling (override with ASSISTANT_LOCAL_MAX_REQUESTS / _MAX_TOKENS). Not
 * unlimited, because QA replies still call a paid model.
 */
const LOCAL_LIMITS = { maxRequests: 2_000, maxTokens: 20_000_000 }
const positive = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}
export function generalBudgetLimits(
  environment: Record<string, string | undefined> = process.env,
) {
  if (environment.APP_ENV !== "local")
    return { ...HOSTED_LIMITS, windowMs: MONTHLY_WINDOW_MS }
  return {
    maxRequests: positive(
      environment.ASSISTANT_LOCAL_MAX_REQUESTS,
      LOCAL_LIMITS.maxRequests,
    ),
    maxTokens: positive(
      environment.ASSISTANT_LOCAL_MAX_TOKENS,
      LOCAL_LIMITS.maxTokens,
    ),
    windowMs: MONTHLY_WINDOW_MS,
  }
}
export const GENERAL_BUDGET_LIMITS = generalBudgetLimits()
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
    requestLimit: GENERAL_BUDGET_LIMITS.maxRequests,
    tokenLimit: GENERAL_BUDGET_LIMITS.maxTokens,
    resetsAt: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    ).toISOString(),
  }
}
