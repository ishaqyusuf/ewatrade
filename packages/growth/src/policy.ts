// Lifecycle send policy (plan §4.3). Pure: no database, clock or env reads.
//
// Given the plays that are eligible for one business today, decide for each
// Owner/Admin recipient which ledger rows to write:
//   - consent by ConsentCategory against MarketingPreference
//     (`transactional` bypasses opt-out but is still deduped);
//   - at most 1 lifecycle email per 3 days and 2 per 7 days per user;
//   - at most 1 visible in-app nudge per user;
//   - priority by `playRank`;
//   - a stable 10% holdout per (business, play), written as `status: holdout`.
// Quiet hours (08:00–20:00 WAT) gate the *send*, not the decision: email rows
// are written as pending and only leave the outbox inside the window
// (`emailSendWindowOpen`).

import {
  type ConsentCategory,
  HOLDOUT_PERCENT,
  type LifecycleChannel,
  type LifecyclePlay,
  type PlayDecision,
} from "./contract"
import { playRank } from "./registry"

export type MarketingConsent = {
  productTips: boolean
  offers: boolean
  monthlyReport: boolean
  unsubscribedAllAt: Date | null
}

export type RecipientHistory = {
  /** Lifecycle email send (or queue) times in the last 7 days. */
  emailSentAt: readonly Date[]
  /** An undismissed, unexpired in-app nudge is showing now. */
  inAppVisible: boolean
}

export type PolicyRecipient = {
  userId: string
  /** Membership role; only OWNER and ADMIN receive lifecycle messages. */
  role: string
  consent: MarketingConsent
  history: RecipientHistory
}

export type EligiblePlay = { play: LifecyclePlay; decision: PlayDecision }

export type PolicyInput = {
  now: Date
  tenantId: string
  eligible: readonly EligiblePlay[]
  recipients: readonly PolicyRecipient[]
  /** True when (user, ledger play id, periodKey) already has a ledger row. */
  alreadyRecorded?: (
    userId: string,
    playId: string,
    periodKey: string,
  ) => boolean
  /** Staged rollout: when set, only these play ids may be written. */
  enabledPlays?: ReadonlySet<string> | null
}

export type PlannedLifecycleMessage = {
  tenantId: string
  userId: string
  /** Ledger play id (`decision.ledgerPlayId ?? play.id`). */
  playId: string
  periodKey: string
  variant: "control" | "a"
  channel: LifecycleChannel
  status: "pending" | "sent" | "holdout" | "suppressed"
  suppressedReason: string | null
  /** Effective consent category (`decision.consent ?? play.consent`). */
  consent: ConsentCategory
  play: LifecyclePlay
  decision: PlayDecision
}

export type DeferredLifecycleMessage = {
  userId: string
  playId: string
  reason: "email_cap" | "nudge_visible" | "no_channel"
}

export const LIFECYCLE_RECIPIENT_ROLES = ["OWNER", "ADMIN"] as const
export const EMAIL_CAP_3_DAYS = 1
export const EMAIL_CAP_7_DAYS = 2
/** West Africa Time is UTC+1 all year (no DST). */
export const WAT_OFFSET_MINUTES = 60
export const QUIET_HOURS = { startHour: 8, endHour: 20 } as const

/** Channels the engine can deliver today. WhatsApp/Telegram footers come later. */
const DELIVERABLE_CHANNELS: readonly LifecycleChannel[] = ["email", "in_app"]

const DAY_MS = 86_400_000

/** FNV-1a 32-bit. Stable across runtimes; used for holdout bucketing. */
export function stableHash(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** 0–99 bucket for (business, play). The same business always lands the same way. */
export function holdoutBucket(tenantId: string, playId: string) {
  return stableHash(`${tenantId}:${playId}`) % 100
}

export function isHoldout(tenantId: string, playId: string) {
  return holdoutBucket(tenantId, playId) < HOLDOUT_PERCENT
}

/** Lifecycle email may leave the outbox only 08:00–20:00 business local time. */
export function emailSendWindowOpen(
  now: Date,
  offsetMinutes = WAT_OFFSET_MINUTES,
) {
  const local = new Date(now.getTime() + offsetMinutes * 60_000)
  const hour = local.getUTCHours()
  return hour >= QUIET_HOURS.startHour && hour < QUIET_HOURS.endHour
}

/** Consent for one category and channel. */
export function consentAllows(
  consent: MarketingConsent,
  category: ConsentCategory,
  channel: LifecycleChannel,
) {
  if (category === "transactional") return true
  // A one-click unsubscribe, hard bounce or complaint stops lifecycle email.
  // In-product cards are not email and stay governed by the category toggles.
  if (channel === "email" && consent.unsubscribedAllAt) return false
  return consent[category]
}

/** Email frequency cap: 1 per 3 days, 2 per 7 days. Transactional is exempt. */
export function emailCapAllows(
  history: readonly Date[],
  now: Date,
  category: ConsentCategory,
) {
  if (category === "transactional") return true
  const since3 = now.getTime() - 3 * DAY_MS
  const since7 = now.getTime() - 7 * DAY_MS
  const in3 = history.filter((at) => at.getTime() > since3).length
  const in7 = history.filter((at) => at.getTime() > since7).length
  return in3 < EMAIL_CAP_3_DAYS && in7 < EMAIL_CAP_7_DAYS
}

export function isLifecycleRecipientRole(role: string) {
  return (LIFECYCLE_RECIPIENT_ROLES as readonly string[]).includes(role)
}

/**
 * Decide the ledger rows for one business. Returns rows to write and the
 * deferred decisions (caps, visible nudge) that are retried on a later day
 * because no row is written for them.
 */
export function planLifecycleMessages(input: PolicyInput) {
  const planned: PlannedLifecycleMessage[] = []
  const deferred: DeferredLifecycleMessage[] = []
  const ordered = [...input.eligible]
    .filter(
      ({ play }) => !input.enabledPlays || input.enabledPlays.has(play.id),
    )
    .sort((a, b) => playRank(a.play.id) - playRank(b.play.id))

  for (const recipient of input.recipients) {
    if (!isLifecycleRecipientRole(recipient.role)) continue
    // Per-run copies so a decision earlier in this run counts against the caps.
    const emailHistory = [...recipient.history.emailSentAt]
    let inAppVisible = recipient.history.inAppVisible

    for (const { play, decision } of ordered) {
      const playId = decision.ledgerPlayId ?? play.id
      if (input.alreadyRecorded?.(recipient.userId, playId, decision.periodKey))
        continue

      // A decision may override the play's consent and channels (P08 per threshold).
      const category = decision.consent ?? play.consent
      const channels = (decision.channels ?? play.channels).filter((channel) =>
        DELIVERABLE_CHANNELS.includes(channel),
      )
      const consented = channels.filter((channel) =>
        consentAllows(recipient.consent, category, channel),
      )
      const base = {
        tenantId: input.tenantId,
        userId: recipient.userId,
        playId,
        periodKey: decision.periodKey,
        consent: category,
        play,
        decision,
      }

      if (channels.length === 0) {
        deferred.push({
          userId: recipient.userId,
          playId,
          reason: "no_channel",
        })
        continue
      }
      if (consented.length === 0) {
        // Durable: the recipient opted out. Record it so metrics see it.
        planned.push({
          ...base,
          variant: "a",
          channel: channels[0] ?? "email",
          status: "suppressed",
          suppressedReason: recipient.consent.unsubscribedAllAt
            ? "unsubscribed"
            : "consent",
        })
        continue
      }

      const channel = consented.find((candidate) =>
        candidate === "email"
          ? emailCapAllows(emailHistory, input.now, category)
          : !inAppVisible,
      )
      if (!channel) {
        deferred.push({
          userId: recipient.userId,
          playId,
          reason: consented.includes("email") ? "email_cap" : "nudge_visible",
        })
        continue
      }

      // The holdout takes the slot a send would have taken, so treated and
      // holdout businesses see the same competition between plays.
      if (channel === "email") emailHistory.push(input.now)
      else inAppVisible = true

      if (isHoldout(input.tenantId, play.id)) {
        planned.push({
          ...base,
          variant: "control",
          channel,
          status: "holdout",
          suppressedReason: null,
        })
        continue
      }
      planned.push({
        ...base,
        variant: "a",
        channel,
        // In-app rows are visible as soon as they are written.
        status: channel === "email" ? "pending" : "sent",
        suppressedReason: null,
      })
    }
  }
  return { planned, deferred }
}
