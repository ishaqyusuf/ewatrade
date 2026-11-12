// Real-time P08: the handler the db limit hooks call inside the write
// transaction (packages/db/src/queries/lifecycle-limit-hooks.ts). The API
// installs it once at startup; the hooks themselves check
// GROWTH_LIFECYCLE_ENABLED and run this inside a savepoint.
//
// Same decision as the daily sweep (`limitPressureDecision`), same send
// policy (`planLifecycleMessages`), same ledger keys and frozen payload, so
// whichever path runs first wins and the other is a no-op on the unique key.
//
// Inline send: the handler runs inside the caller's transaction and cannot
// see its commit, so each new email row is handed to `sendEmail` a moment
// later. If the transaction has not committed (or rolled back) by then, the
// sender finds no pending row and skips; the hourly lifecycle sweep sends any
// row left pending. The sender is injected because @ewatrade/jobs depends on
// this package.

import {
  type LimitPressureHandler,
  setLimitPressureHandler,
} from "@ewatrade/db/lifecycle-limit-hooks"
import {
  DEFAULT_MARKETING_PREFERENCE,
  insertLifecycleMessageIfAbsent,
  readLifecycleHistory,
  readMarketingPreferences,
} from "@ewatrade/db/lifecycle-messages"
import {
  LIFECYCLE_RECIPIENT_ROLES,
  type PolicyRecipient,
  planLifecycleMessages,
} from "../../policy"
import { isLifecycleCheckoutAvailable } from "./checkout-availability"
import { limitPressureDecision, limitPressurePlay } from "./limit-pressure"

/** Staged rollout: comma-separated play ids, or unset for all plays. */
function enabledPlays(env: Record<string, string | undefined>) {
  const raw = env.GROWTH_LIFECYCLE_PLAYS?.trim()
  if (!raw) return null
  return new Set(raw.split(",").map((id) => id.trim()))
}

export type LimitPressureHookOptions = {
  /** `sendLifecycleEmail` from @ewatrade/jobs/lifecycle. Omit to leave rows to the sweep. */
  sendEmail?: (id: string) => Promise<unknown>
  /** Wait before the inline send so the caller's transaction can commit. */
  sendDelayMs?: number
  schedule?: (run: () => void, delayMs: number) => void
}

export const LIMIT_PRESSURE_SEND_DELAY_MS = 3_000

export function createLimitPressureHandler(
  env: Record<string, string | undefined> = process.env,
  options: LimitPressureHookOptions = {},
): LimitPressureHandler {
  const schedule =
    options.schedule ??
    ((run: () => void, delayMs: number) => {
      setTimeout(run, delayMs)
    })
  return async (tx, usage) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: usage.tenantId },
      select: { countryCode: true, currencyCode: true },
    })
    if (!tenant) return
    const decision = limitPressureDecision({
      planId: usage.planId,
      limit: usage.limit,
      used: usage.used,
      now: usage.now,
      checkoutAvailable: isLifecycleCheckoutAvailable(
        { business: tenant },
        env,
      ),
    })
    if (!decision) return
    const { stage: _stage, ...playDecision } = decision

    const members = await tx.membership.findMany({
      where: {
        tenantId: usage.tenantId,
        status: "ACTIVE",
        role: { in: [...LIFECYCLE_RECIPIENT_ROLES] },
        user: { emailVerified: true },
      },
      select: { role: true, userId: true },
    })
    if (members.length === 0) return
    const userIds = members.map((member) => member.userId)
    const [consent, history] = await Promise.all([
      readMarketingPreferences(tx, userIds),
      readLifecycleHistory(tx, userIds, usage.now),
    ])
    const recipients: PolicyRecipient[] = members.map((member) => ({
      userId: member.userId,
      role: member.role,
      consent: consent.get(member.userId) ?? DEFAULT_MARKETING_PREFERENCE,
      history: history.get(member.userId) ?? {
        emailSentAt: [],
        inAppVisible: false,
      },
    }))

    // The policy applies the threshold's consent and channel overrides.
    const { planned } = planLifecycleMessages({
      now: usage.now,
      tenantId: usage.tenantId,
      eligible: [{ play: limitPressurePlay, decision: playDecision }],
      recipients,
      enabledPlays: enabledPlays(env),
    })
    const emailIds: string[] = []
    for (const row of planned) {
      const inserted = await insertLifecycleMessageIfAbsent(tx, {
        tenantId: row.tenantId,
        userId: row.userId,
        playId: row.playId,
        periodKey: row.periodKey,
        variant: row.variant,
        channel: row.channel,
        status: row.status,
        suppressedReason: row.suppressedReason,
        templateKey: row.decision.templateKey,
        payload: {
          data: row.decision.data,
          ctaPath: row.decision.ctaPath,
          inAppKey: row.decision.inAppKey ?? null,
          consent: row.consent,
        },
        now: usage.now,
      })
      if (
        inserted.created &&
        row.channel === "email" &&
        row.status === "pending"
      )
        emailIds.push(inserted.id)
    }
    const send = options.sendEmail
    if (!send) return
    for (const id of emailIds)
      schedule(() => {
        send(id).catch((error: unknown) => {
          console.error("lifecycle limit-pressure inline send failed", {
            id,
            error: error instanceof Error ? error.message : String(error),
          })
        })
      }, options.sendDelayMs ?? LIMIT_PRESSURE_SEND_DELAY_MS)
  }
}

/** Call once at process start (API), passing the lifecycle email sender. */
export function installLimitPressureHook(
  env: Record<string, string | undefined> = process.env,
  options: LimitPressureHookOptions = {},
) {
  setLimitPressureHandler(createLimitPressureHandler(env, options))
}
