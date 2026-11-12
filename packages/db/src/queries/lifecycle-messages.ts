// Lifecycle marketing ledger (docs/plans/2026-11-12-lifecycle-marketing-plan.md §4).
//
// One `LifecycleMessage` row per (tenant, recipient, playId, periodKey). The row
// is the dedupe key, the outbox and the metrics record at once:
//   pending  → claimed for email (status "sending") → sent → delivered/clicked
//   holdout  → never sent; conversion still measured against it
//   suppressed → policy said no (consent, cap, quiet hours); kept for metrics
//   failed   → three preparation failures, or a provider outcome we cannot know
//
// House send pattern (memory: trigger-dev-cost-budget): the writer sends inline
// after its commit; a failure before the provider call releases the row back to
// pending; the daily sweep sends leftovers older than ~2 minutes. The claim fence
// (status + claimedAt) makes sure only one sender ever reaches the provider.

import type { Prisma, PrismaClient } from "../../generated/prisma/client"

type Db = PrismaClient | Prisma.TransactionClient

export const LIFECYCLE_STATUSES = [
  "pending",
  "sending",
  "sent",
  "suppressed",
  "failed",
  "holdout",
] as const
export type LifecycleMessageStatus = (typeof LIFECYCLE_STATUSES)[number]
export type LifecycleMessageChannel =
  | "email"
  | "in_app"
  | "whatsapp"
  | "telegram"

/** Rows younger than this are left to the inline sender. */
export const LIFECYCLE_SWEEP_MIN_AGE_MS = 2 * 60_000
/** A claim older than this has an unknown provider outcome. */
export const LIFECYCLE_CLAIM_TTL_MS = 5 * 60_000
export const LIFECYCLE_MAX_ATTEMPTS = 3
/** In-app nudges stop showing after this many days even if never dismissed. */
export const LIFECYCLE_IN_APP_TTL_DAYS = 14

export type LifecycleMessageInsert = {
  tenantId: string
  userId: string
  playId: string
  periodKey: string
  variant: string
  channel: LifecycleMessageChannel
  /** pending (email to send), sent (in-app, visible now), holdout or suppressed. */
  status: Extract<
    LifecycleMessageStatus,
    "pending" | "sent" | "holdout" | "suppressed"
  >
  suppressedReason?: string | null
  senderUserId?: string | null
  /** Email template key from the play decision. */
  templateKey?: string | null
  /** Frozen decision the sender renders from: plain values only. */
  payload?: LifecycleMessagePayload | null
  now?: Date
}

export type LifecycleMessagePayload = {
  data: Record<string, string | number | boolean | null>
  ctaPath: string
  inAppKey?: string | null
  /** Effective consent category when the decision overrode the play's. */
  consent?: string | null
}

/**
 * Insert the ledger row unless (tenant, user, playId, periodKey) exists.
 * Safe under concurrent sweeps: `ON CONFLICT DO NOTHING`, never a failed insert
 * that would abort the caller's transaction.
 */
export async function insertLifecycleMessageIfAbsent(
  db: Db,
  input: LifecycleMessageInsert,
) {
  const now = input.now ?? new Date()
  const created = await db.lifecycleMessage.createManyAndReturn({
    data: [
      {
        tenantId: input.tenantId,
        userId: input.userId,
        playId: input.playId,
        periodKey: input.periodKey,
        variant: input.variant,
        channel: input.channel,
        status: input.status,
        suppressedReason: input.suppressedReason ?? null,
        senderUserId: input.senderUserId ?? null,
        templateKey: input.templateKey ?? null,
        ...(input.payload ? { payload: input.payload } : {}),
        // An in-app nudge is "sent" the moment it becomes visible.
        sentAt: input.status === "sent" ? now : null,
        createdAt: now,
      },
    ],
    skipDuplicates: true,
    select: { id: true, status: true },
  })
  const row = created[0]
  return row
    ? { created: true as const, id: row.id, status: row.status }
    : { created: false as const }
}

export type LifecycleClaim = { id: string; claimedAt: Date }

/**
 * Claim one pending email row for sending. Returns the fence token, or null
 * when another sender holds it, it was already sent, or attempts ran out.
 */
export async function claimLifecycleMessage(
  db: Db,
  id: string,
  now = new Date(),
): Promise<LifecycleClaim | null> {
  const claimed = await db.lifecycleMessage.updateMany({
    where: {
      id,
      channel: "email",
      status: "pending",
      attempts: { lt: LIFECYCLE_MAX_ATTEMPTS },
    },
    data: { status: "sending", claimedAt: now, attempts: { increment: 1 } },
  })
  return claimed.count === 1 ? { id, claimedAt: now } : null
}

/**
 * The provider accepted the message. Fenced on the claim so a stale sender
 * cannot overwrite a newer outcome.
 */
export async function markLifecycleMessageSent(
  db: Db,
  claim: LifecycleClaim,
  input: { providerMessageId: string; now?: Date },
) {
  const updated = await db.lifecycleMessage.updateMany({
    where: { id: claim.id, status: "sending", claimedAt: claim.claimedAt },
    data: {
      status: "sent",
      sentAt: input.now ?? new Date(),
      providerMessageId: input.providerMessageId,
      claimedAt: null,
    },
  })
  return updated.count === 1
}

/**
 * Release a claim after a failure that happened before the provider call
 * (render error, recipient lookup). The row goes back to pending for the sweep,
 * or to failed when attempts are exhausted.
 */
export async function releaseLifecycleMessage(
  db: Db,
  claim: LifecycleClaim,
  reason = "preparation_failed",
) {
  const row = await db.lifecycleMessage.findUnique({
    where: { id: claim.id },
    select: { attempts: true },
  })
  const exhausted = (row?.attempts ?? 0) >= LIFECYCLE_MAX_ATTEMPTS
  const updated = await db.lifecycleMessage.updateMany({
    where: { id: claim.id, status: "sending", claimedAt: claim.claimedAt },
    data: exhausted
      ? { status: "failed", suppressedReason: reason, claimedAt: null }
      : { status: "pending", claimedAt: null },
  })
  return updated.count === 1
}

/**
 * Settle a claim without sending: the recipient lost consent or role between
 * the decision and the send, or the provider call had an unknown outcome.
 */
export async function finishLifecycleMessageUnsent(
  db: Db,
  claim: LifecycleClaim,
  input: { status: "suppressed" | "failed"; reason: string },
) {
  const updated = await db.lifecycleMessage.updateMany({
    where: { id: claim.id, status: "sending", claimedAt: claim.claimedAt },
    data: {
      status: input.status,
      suppressedReason: input.reason,
      claimedAt: null,
    },
  })
  return updated.count === 1
}

/**
 * Leftover email rows for the sweep. First settles rows that can never be
 * sent safely:
 * - an expired claim has an unknown provider outcome: failed, never resent;
 * - pending rows that used up their attempts: failed.
 */
export async function listPendingLifecycleMessages(
  db: Db,
  input: { now?: Date; limit?: number; minAgeMs?: number } = {},
) {
  const now = input.now ?? new Date()
  await db.lifecycleMessage.updateMany({
    where: {
      status: "sending",
      claimedAt: { lte: new Date(now.getTime() - LIFECYCLE_CLAIM_TTL_MS) },
    },
    data: {
      status: "failed",
      suppressedReason: "outcome_unknown",
      claimedAt: null,
    },
  })
  await db.lifecycleMessage.updateMany({
    where: {
      status: "pending",
      attempts: { gte: LIFECYCLE_MAX_ATTEMPTS },
    },
    data: { status: "failed", suppressedReason: "preparation_failed" },
  })
  return db.lifecycleMessage.findMany({
    where: {
      channel: "email",
      status: "pending",
      attempts: { lt: LIFECYCLE_MAX_ATTEMPTS },
      createdAt: {
        lte: new Date(
          now.getTime() - (input.minAgeMs ?? LIFECYCLE_SWEEP_MIN_AGE_MS),
        ),
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: input.limit ?? 50,
    select: lifecycleMessageSendSelect,
  })
}

export const lifecycleMessageSendSelect = {
  id: true,
  tenantId: true,
  userId: true,
  playId: true,
  periodKey: true,
  variant: true,
  channel: true,
  templateKey: true,
  payload: true,
  createdAt: true,
} satisfies Prisma.LifecycleMessageSelect

export type LifecycleMessageForSend = Prisma.LifecycleMessageGetPayload<{
  select: typeof lifecycleMessageSendSelect
}>

/**
 * Current recipient for a lifecycle email: an active Owner/Admin of an active
 * business, with a verified email. Read again right before sending so a role or
 * email change between decision and send is respected.
 */
export async function readLifecycleRecipient(
  db: Db,
  input: { tenantId: string; userId: string },
) {
  const member = await db.membership.findFirst({
    where: {
      tenantId: input.tenantId,
      userId: input.userId,
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
      tenant: { isActive: true },
      user: { emailVerified: true },
    },
    select: {
      role: true,
      tenant: { select: { id: true, name: true, dataClassification: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  })
  if (!member?.user.email) return null
  return {
    tenantId: member.tenant.id,
    businessName: member.tenant.name,
    dataClassification: member.tenant.dataClassification,
    userId: member.user.id,
    email: member.user.email,
    name: member.user.name,
    role: member.role,
  }
}

/** Resend `email.delivered`. Returns false when the id is not a lifecycle message. */
export async function markLifecycleMessageDelivered(
  db: Db,
  providerMessageId: string,
  at = new Date(),
) {
  const updated = await db.lifecycleMessage.updateMany({
    where: { providerMessageId, deliveredAt: null },
    data: { deliveredAt: at },
  })
  return updated.count === 1
}

/** Resend `email.opened` (indicative only; image blocking makes it unreliable). */
export async function markLifecycleMessageOpened(
  db: Db,
  providerMessageId: string,
  at = new Date(),
) {
  const updated = await db.lifecycleMessage.updateMany({
    where: { providerMessageId, openedAt: null },
    data: { openedAt: at },
  })
  return updated.count === 1
}

/**
 * First click through the signed `/go/:token` redirect. Returns the play id for
 * the UTM campaign, or null when the message does not exist. A click also
 * implies delivery and open.
 */
export async function markLifecycleMessageClicked(
  db: Db,
  id: string,
  at = new Date(),
) {
  const row = await db.lifecycleMessage.findUnique({
    where: { id },
    select: {
      id: true,
      playId: true,
      clickedAt: true,
      deliveredAt: true,
      openedAt: true,
      channel: true,
    },
  })
  if (!row) return null
  if (!row.clickedAt) {
    await db.lifecycleMessage.updateMany({
      where: { id, clickedAt: null },
      data: {
        clickedAt: at,
        ...(row.channel === "email" && !row.deliveredAt
          ? { deliveredAt: at }
          : {}),
        ...(row.channel === "email" && !row.openedAt ? { openedAt: at } : {}),
      },
    })
  }
  return { id: row.id, playId: row.playId }
}

/** The owner closed an in-app nudge. Scoped to the recipient. */
export async function markLifecycleMessageDismissed(
  db: Db,
  input: { id: string; tenantId: string; userId: string; now?: Date },
) {
  const updated = await db.lifecycleMessage.updateMany({
    where: {
      id: input.id,
      tenantId: input.tenantId,
      userId: input.userId,
      dismissedAt: null,
    },
    data: { dismissedAt: input.now ?? new Date() },
  })
  return updated.count === 1
}

/**
 * Resend `email.bounced` (hard) or `email.complained`: mark the message failed
 * and stop all lifecycle mail to that user. Returns the user id, or null when
 * the provider id is not a lifecycle message.
 */
export async function recordLifecycleMessageBounce(
  db: PrismaClient,
  input: {
    providerMessageId: string
    kind: "bounced" | "complained"
    at?: Date
  },
) {
  const at = input.at ?? new Date()
  const row = await db.lifecycleMessage.findUnique({
    where: { providerMessageId: input.providerMessageId },
    select: { id: true, userId: true },
  })
  if (!row) return null
  await db.$transaction([
    db.lifecycleMessage.update({
      where: { id: row.id },
      data:
        input.kind === "bounced"
          ? { status: "failed", suppressedReason: "bounced" }
          : { suppressedReason: "complained" },
    }),
    db.marketingPreference.upsert({
      where: { userId: row.userId },
      create: { userId: row.userId, unsubscribedAllAt: at },
      update: { unsubscribedAllAt: at },
    }),
  ])
  return row.userId
}

/** The one visible in-app nudge for this recipient, newest first. */
export async function getActiveInAppNudge(
  db: Db,
  tenantId: string,
  userId: string,
  now = new Date(),
) {
  return db.lifecycleMessage.findFirst({
    where: {
      tenantId,
      userId,
      channel: "in_app",
      status: "sent",
      dismissedAt: null,
      convertedAt: null,
      sentAt: {
        gte: new Date(now.getTime() - LIFECYCLE_IN_APP_TTL_DAYS * 86_400_000),
      },
    },
    orderBy: [{ sentAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      playId: true,
      periodKey: true,
      variant: true,
      sentAt: true,
    },
  })
}

/**
 * Frequency-cap history for the policy: email send times in the last 7 days and
 * whether an in-app nudge is visible, per user. Pending/sending email counts as
 * sent so the sweep never stacks a second email behind an unsent first one.
 */
export async function readLifecycleHistory(
  db: Db,
  userIds: readonly string[],
  now = new Date(),
) {
  const history = new Map<
    string,
    { emailSentAt: Date[]; inAppVisible: boolean }
  >()
  if (userIds.length === 0) return history
  for (const userId of userIds)
    history.set(userId, { emailSentAt: [], inAppVisible: false })
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000)
  const rows = await db.lifecycleMessage.findMany({
    where: {
      userId: { in: [...userIds] },
      OR: [
        {
          channel: "email",
          OR: [
            { status: "sent", sentAt: { gte: weekAgo } },
            {
              status: { in: ["pending", "sending"] },
              createdAt: { gte: weekAgo },
            },
          ],
        },
        {
          channel: "in_app",
          status: "sent",
          dismissedAt: null,
          convertedAt: null,
          sentAt: {
            gte: new Date(
              now.getTime() - LIFECYCLE_IN_APP_TTL_DAYS * 86_400_000,
            ),
          },
        },
      ],
    },
    select: {
      userId: true,
      channel: true,
      sentAt: true,
      createdAt: true,
    },
  })
  for (const row of rows) {
    const entry = history.get(row.userId)
    if (!entry) continue
    if (row.channel === "in_app") entry.inAppVisible = true
    else entry.emailSentAt.push(row.sentAt ?? row.createdAt)
  }
  return history
}

/**
 * Sent and holdout rows still inside a conversion window, for the conversion
 * check. `since` is the oldest send date worth checking (now - max windowDays).
 */
export async function listLifecycleConversionCandidates(
  db: Db,
  input: { since: Date; limit?: number; cursor?: string },
) {
  return db.lifecycleMessage.findMany({
    where: {
      convertedAt: null,
      OR: [
        { status: "sent", sentAt: { gte: input.since } },
        { status: "holdout", createdAt: { gte: input.since } },
      ],
      ...(input.cursor ? { id: { gt: input.cursor } } : {}),
    },
    orderBy: { id: "asc" },
    take: input.limit ?? 500,
    select: {
      id: true,
      tenantId: true,
      playId: true,
      status: true,
      sentAt: true,
      createdAt: true,
    },
  })
}

export async function markLifecycleMessageConverted(
  db: Db,
  input: { id: string; at?: Date; conversionRef?: string | null },
) {
  const updated = await db.lifecycleMessage.updateMany({
    where: { id: input.id, convertedAt: null },
    data: {
      convertedAt: input.at ?? new Date(),
      conversionRef: input.conversionRef ?? null,
    },
  })
  return updated.count === 1
}

export type MarketingPreferenceValues = {
  productTips: boolean
  offers: boolean
  monthlyReport: boolean
  unsubscribedAllAt: Date | null
}

export const DEFAULT_MARKETING_PREFERENCE: MarketingPreferenceValues = {
  productTips: true,
  offers: true,
  monthlyReport: true,
  unsubscribedAllAt: null,
}

/** Preferences for many users; users without a row get the defaults. */
export async function readMarketingPreferences(
  db: Db,
  userIds: readonly string[],
) {
  const rows = userIds.length
    ? await db.marketingPreference.findMany({
        where: { userId: { in: [...userIds] } },
        select: {
          userId: true,
          productTips: true,
          offers: true,
          monthlyReport: true,
          unsubscribedAllAt: true,
        },
      })
    : []
  const map = new Map<string, MarketingPreferenceValues>()
  for (const userId of userIds) map.set(userId, DEFAULT_MARKETING_PREFERENCE)
  for (const { userId, ...values } of rows) map.set(userId, values)
  return map
}

export async function readMarketingPreference(db: Db, userId: string) {
  return (
    (await readMarketingPreferences(db, [userId])).get(userId) ??
    DEFAULT_MARKETING_PREFERENCE
  )
}

/**
 * Update preferences. `unsubscribeAll: true` sets the global opt-out;
 * turning any category back on clears it (the user chose to hear from us).
 */
export async function setMarketingPreference(
  db: Db,
  userId: string,
  input: Partial<
    Pick<MarketingPreferenceValues, "productTips" | "offers" | "monthlyReport">
  > & {
    unsubscribeAll?: boolean
    now?: Date
  },
) {
  const { unsubscribeAll, now, ...categories } = input
  const enabling = Object.values(categories).some((value) => value === true)
  const unsubscribedAllAt = unsubscribeAll
    ? (now ?? new Date())
    : enabling || unsubscribeAll === false
      ? null
      : undefined
  const row = await db.marketingPreference.upsert({
    where: { userId },
    create: {
      userId,
      ...categories,
      ...(unsubscribedAllAt !== undefined ? { unsubscribedAllAt } : {}),
    },
    update: {
      ...categories,
      ...(unsubscribedAllAt !== undefined ? { unsubscribedAllAt } : {}),
    },
    select: {
      productTips: true,
      offers: true,
      monthlyReport: true,
      unsubscribedAllAt: true,
    },
  })
  return row
}

/** Erase every lifecycle record of one user (account deletion / privacy erasure). */
export async function eraseLifecycleDataForUser(db: Db, userId: string) {
  const messages = await db.lifecycleMessage.deleteMany({ where: { userId } })
  const preferences = await db.marketingPreference.deleteMany({
    where: { userId },
  })
  return { messages: messages.count, preferences: preferences.count }
}

/** Erase every lifecycle record of one business (business erasure). */
export async function eraseLifecycleDataForTenant(db: Db, tenantId: string) {
  const messages = await db.lifecycleMessage.deleteMany({ where: { tenantId } })
  const snapshots = await db.businessGrowthSnapshot.deleteMany({
    where: { tenantId },
  })
  return { messages: messages.count, snapshots: snapshots.count }
}
