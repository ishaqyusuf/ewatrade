// Real-time P08: the handler the db limit hooks call inside the write
// transaction (packages/db/src/queries/lifecycle-limit-hooks.ts). The API
// installs it once at startup; the hooks themselves check
// GROWTH_LIFECYCLE_ENABLED and run this inside a savepoint.
//
// Same decision as the daily sweep (`limitPressureDecision`), same send
// policy (`planLifecycleMessages`), same ledger keys, so whichever path runs
// first wins and the other is a no-op on the unique key.

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
import type { LifecyclePlay } from "../../contract"
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

export function createLimitPressureHandler(
  env: Record<string, string | undefined> = process.env,
): LimitPressureHandler {
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

    // The threshold decides consent and channel; give the policy that view.
    const play: LifecyclePlay = {
      ...limitPressurePlay,
      consent: playDecision.consent ?? limitPressurePlay.consent,
      channels: playDecision.channels ?? limitPressurePlay.channels,
    }
    const { planned } = planLifecycleMessages({
      now: usage.now,
      tenantId: usage.tenantId,
      eligible: [{ play, decision: playDecision }],
      recipients,
      enabledPlays: enabledPlays(env),
    })
    for (const row of planned)
      await insertLifecycleMessageIfAbsent(tx, {
        tenantId: row.tenantId,
        userId: row.userId,
        playId: row.playId,
        periodKey: row.periodKey,
        variant: row.variant,
        channel: row.channel,
        status: row.status,
        suppressedReason: row.suppressedReason,
        now: usage.now,
      })
  }
}

/** Call once at process start (API). */
export function installLimitPressureHook(
  env: Record<string, string | undefined> = process.env,
) {
  setLimitPressureHandler(createLimitPressureHandler(env))
}
