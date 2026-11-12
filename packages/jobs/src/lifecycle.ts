// Lifecycle marketing engine (plan §4, workstream W1).
//
// Daily (once per UTC day, after 07:00 WAT, inside the existing hourly
// cadence — no new cron, no per-event runs):
//   1. build today's BusinessGrowthSnapshot rows;
//   2. evaluate LIFECYCLE_PLAYS against them;
//   3. apply policy (consent, caps, priority, holdout) and write the ledger;
//   4. send the new email rows inline;
//   5. conversion check: `convertedAt` via each play's `success.achieved`.
// Every hourly tick inside 08:00–20:00 WAT also sends leftover pending email
// older than ~2 minutes (inline senders and real-time plays write those).
//
// Gate: GROWTH_LIFECYCLE_ENABLED=true (default off). Optional staged rollout:
// GROWTH_LIFECYCLE_PLAYS=P04_site_setup,P06_money_accounts.

import { prisma } from "@ewatrade/db/client"
import { featureIntentTapsForTenant } from "@ewatrade/db/growth-intent"
import {
  type GrowthSnapshotRow,
  buildGrowthSnapshots,
  growthSnapshotDay,
  listGrowthRecipients,
  listGrowthSnapshotsForDay,
  pruneGrowthSnapshots,
  readGrowthBillingCountries,
  readGrowthSalesHistory,
  readGrowthSnapshots,
} from "@ewatrade/db/growth-snapshot"
import {
  type LifecycleMessagePayload,
  claimLifecycleMessage,
  finishLifecycleMessageUnsent,
  insertLifecycleMessageIfAbsent,
  listLifecycleConversionCandidates,
  listPendingLifecycleMessages,
  markLifecycleMessageConverted,
  markLifecycleMessageSent,
  readLifecycleHistory,
  readLifecycleRecipient,
  readMarketingPreference,
  readMarketingPreferences,
  releaseLifecycleMessage,
} from "@ewatrade/db/lifecycle-messages"
import {
  type EmailTransport,
  LIFECYCLE_ADOPTION_TEMPLATES,
  LIFECYCLE_REVENUE_TEMPLATES,
  type LifecycleTemplate,
  createLifecycleEmailMessage,
  createManagedQaEmailMessages,
  getDefaultEmailTransport,
  getTestEmailRouting,
  lifecycleEmailReplyTo,
  lifecycleEmailSender,
} from "@ewatrade/email"
import type {
  ConsentCategory,
  GrowthSnapshot,
  LifecyclePlay,
  PlayContext,
} from "@ewatrade/growth/contract"
import {
  lifecycleEmailLinks,
  lifecycleLinkSecret,
} from "@ewatrade/growth/links"
import {
  type EligiblePlay,
  consentAllows,
  emailSendWindowOpen,
  planLifecycleMessages,
} from "@ewatrade/growth/policy"
import { LIFECYCLE_PLAYS } from "@ewatrade/growth/registry"
import { isLifecycleCheckoutAvailable } from "@ewatrade/growth/revenue/checkout-availability"
import { featureIntentSummaryFromTaps } from "@ewatrade/growth/revenue/feature-intent"
import { computeStage } from "@ewatrade/growth/stage"
import { getQaPolicyEnvironment } from "@ewatrade/utils/qa-policy-server"
import { assertQaJobProviderAllowed } from "./qa-provider-guard"

type Db = typeof prisma
type Env = Partial<Record<string, string | undefined>>

/** The daily evaluation runs once per UTC day at or after 07:00 WAT (06:00 UTC). */
export const LIFECYCLE_DAILY_START_UTC_HOUR = 6
const LAST_RUN_KEY = "growth.lifecycle.lastDailyRun"
const DAY_MS = 86_400_000

export const LIFECYCLE_TEMPLATES: Readonly<Record<string, LifecycleTemplate>> =
  {
    ...LIFECYCLE_ADOPTION_TEMPLATES,
    ...LIFECYCLE_REVENUE_TEMPLATES,
  }

function httpsOrigin(value: string | undefined) {
  if (!value?.trim()) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === "https:" && !url.username && !url.password
      ? url.origin
      : null
  } catch {
    return null
  }
}

function isProductionRuntime(env: Env) {
  const profile = (env.APP_ENV ?? env.DEV_PROFILE ?? "").toLowerCase()
  return profile === "production" || profile === "prod"
}

export function lifecycleRuntime(env: Env = process.env) {
  const enabled = env.GROWTH_LIFECYCLE_ENABLED === "true"
  const from = lifecycleEmailSender(env)
  const secret = lifecycleLinkSecret(env)
  const dashboardOrigin = httpsOrigin(
    env.NEXT_PUBLIC_DASHBOARD_URL ??
      `https://dash.${env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com"}`,
  )
  const apiOrigin = httpsOrigin(
    env.LIFECYCLE_API_URL ?? env.NEXT_PUBLIC_API_URL ?? env.API_URL,
  )
  const enabledPlays = env.GROWTH_LIFECYCLE_PLAYS?.trim()
    ? new Set(
        env.GROWTH_LIFECYCLE_PLAYS.split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      )
    : null
  return {
    enabled,
    from,
    replyTo: lifecycleEmailReplyTo(env),
    secret,
    dashboardOrigin,
    apiOrigin,
    enabledPlays,
    production: isProductionRuntime(env),
    emailReady: Boolean(
      enabled && from && secret && dashboardOrigin && apiOrigin,
    ),
  }
}

export type LifecycleDeps = {
  db: Db
  env: Env
  now: () => Date
  plays: readonly LifecyclePlay[]
  templates: Readonly<Record<string, LifecycleTemplate>>
  transport: EmailTransport
  assertProviderAllowed: (input: {
    tenantId: string
    qaEmailRouted: boolean
  }) => Promise<unknown>
}

export function defaultLifecycleDeps(
  overrides: Partial<LifecycleDeps> = {},
): LifecycleDeps {
  return {
    db: prisma,
    env: process.env,
    now: () => new Date(),
    plays: LIFECYCLE_PLAYS,
    templates: LIFECYCLE_TEMPLATES,
    transport: overrides.transport ?? getDefaultEmailTransport(),
    assertProviderAllowed: (input) =>
      assertQaJobProviderAllowed({ operation: "email", ...input }),
    ...overrides,
  }
}

/** `P08_limit:products` → `P08_limit`. */
export function basePlayId(playId: string) {
  return playId.split(":")[0] ?? playId
}

function findPlayIn(plays: readonly LifecyclePlay[], playId: string) {
  const base = basePlayId(playId)
  return plays.find((play) => play.id === base) ?? null
}

function parsePayload(value: unknown): LifecycleMessagePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const payload = value as Partial<LifecycleMessagePayload>
  if (typeof payload.ctaPath !== "string") return null
  const data =
    payload.data && typeof payload.data === "object" ? payload.data : {}
  return {
    data,
    ctaPath: payload.ctaPath,
    inAppKey: payload.inAppKey ?? null,
    consent: typeof payload.consent === "string" ? payload.consent : null,
  }
}

export type LifecycleSendOutcome =
  | "sent"
  | "skipped"
  | "deferred"
  | "suppressed"
  | "retry"
  | "unknown"

/**
 * Send one pending lifecycle email. Called inline right after the row is
 * committed (sweep, real-time plays) and by the hourly leftover sweep. The
 * claim fence makes concurrent callers safe; an ambiguous provider outcome is
 * never retried.
 */
export async function sendLifecycleEmail(
  id: string,
  deps: LifecycleDeps = defaultLifecycleDeps(),
): Promise<LifecycleSendOutcome> {
  const runtime = lifecycleRuntime(deps.env)
  if (!runtime.emailReady) return "skipped"
  const now = deps.now()
  // Quiet hours: leave it pending; the next tick inside the window sends it.
  if (!emailSendWindowOpen(now)) return "deferred"
  const { db } = deps
  const row = await db.lifecycleMessage.findUnique({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      userId: true,
      playId: true,
      channel: true,
      status: true,
      templateKey: true,
      payload: true,
    },
  })
  if (!row || row.channel !== "email" || row.status !== "pending")
    return "skipped"
  if (runtime.enabledPlays && !runtime.enabledPlays.has(basePlayId(row.playId)))
    return "deferred"

  const claim = await claimLifecycleMessage(db, row.id, now)
  if (!claim) return "skipped"
  let started = false
  try {
    const settle = async (status: "suppressed" | "failed", reason: string) => {
      await finishLifecycleMessageUnsent(db, claim, { status, reason })
      return "suppressed" as const
    }
    const play = findPlayIn(deps.plays, row.playId)
    if (!play) return settle("failed", "play_missing")
    const recipient = await readLifecycleRecipient(db, row)
    if (!recipient) return settle("suppressed", "recipient_ineligible")
    const payload = parsePayload(row.payload)
    // The decision's consent (frozen in the payload) wins over the play's.
    const category = (payload?.consent ?? play.consent) as ConsentCategory
    const preference = await readMarketingPreference(db, row.userId)
    if (!consentAllows(preference, category, "email"))
      return settle(
        "suppressed",
        preference.unsubscribedAllAt ? "unsubscribed" : "consent",
      )
    const template = row.templateKey ? deps.templates[row.templateKey] : null
    if (!template || !payload) return settle("failed", "template_missing")

    const env = await getQaPolicyEnvironment(deps.env)
    const routing = getTestEmailRouting({ to: recipient.email, env })
    // Outside Production, lifecycle mail only ever reaches QA inboxes.
    if (!runtime.production && !routing.routed)
      return settle("suppressed", "non_qa_recipient")
    if (routing.recipients.length !== 1)
      return settle("failed", "ambiguous_recipient")

    const links = lifecycleEmailLinks({
      apiOrigin: runtime.apiOrigin ?? "",
      dashboardOrigin: runtime.dashboardOrigin ?? "",
      secret: runtime.secret ?? "",
      messageId: row.id,
      userId: row.userId,
      ctaPath: payload.ctaPath,
    })
    const rendered = template({
      data: payload.data,
      businessName: recipient.businessName,
      firstName: recipient.name,
      ctaHref: links.ctaHref,
      unsubscribeUrl: links.unsubscribeUrl,
      preferencesUrl: links.preferencesUrl,
    })
    const message = createLifecycleEmailMessage({
      from: runtime.from ?? "",
      to: recipient.email,
      replyTo: runtime.replyTo,
      subject: rendered.subject,
      content: rendered.content,
      oneClickUnsubscribeUrl: links.oneClickUnsubscribeUrl,
      messageId: row.id,
      playId: row.playId,
    })
    await deps.assertProviderAllowed({
      tenantId: row.tenantId,
      qaEmailRouted: routing.routed,
    })
    const messages = await createManagedQaEmailMessages(message, {
      env: deps.env,
    })
    if (messages.length !== 1 || !messages[0])
      return settle("failed", "ambiguous_recipient")
    started = true
    const receipt = await deps.transport.send(messages[0])
    if (!receipt?.providerMessageId?.trim())
      throw new Error("Email acceptance is unconfirmed.")
    await markLifecycleMessageSent(db, claim, {
      providerMessageId: receipt.providerMessageId,
      now: deps.now(),
    })
    return "sent"
  } catch (error) {
    console.error("[lifecycle] send failed", {
      id: row.id,
      started,
      error: error instanceof Error ? error.message : "unknown",
    })
    if (started) {
      await finishLifecycleMessageUnsent(db, claim, {
        status: "failed",
        reason: "outcome_unknown",
      })
      return "unknown"
    }
    await releaseLifecycleMessage(db, claim)
    return "retry"
  }
}

/** Leftover pending email older than ~2 minutes. */
export async function sendPendingLifecycleEmails(
  deps: LifecycleDeps = defaultLifecycleDeps(),
) {
  const runtime = lifecycleRuntime(deps.env)
  if (!runtime.emailReady || !emailSendWindowOpen(deps.now()))
    return { pending: 0, outcomes: {} }
  const rows = await listPendingLifecycleMessages(deps.db, {
    now: deps.now(),
  })
  const outcomes: Partial<Record<LifecycleSendOutcome, number>> = {}
  for (const row of rows) {
    const outcome = await sendLifecycleEmail(row.id, deps)
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1
  }
  return { pending: rows.length, outcomes }
}

export function toContractSnapshot(
  snapshot: Omit<GrowthSnapshotRow, "day" | "limitPressure"> & {
    day: string
    limitPressure: GrowthSnapshot["limitPressure"]
  },
): GrowthSnapshot {
  return {
    ...snapshot,
    stage: snapshot.stage as GrowthSnapshot["stage"],
    planId: snapshot.planId as GrowthSnapshot["planId"],
  }
}

function eligiblePlays(
  plays: readonly LifecyclePlay[],
  ctx: PlayContext,
): EligiblePlay[] {
  const eligible: EligiblePlay[] = []
  for (const play of plays) {
    try {
      const decision = play.eligible(ctx)
      if (decision) eligible.push({ play, decision })
    } catch (error) {
      console.error("[lifecycle] play threw", {
        playId: play.id,
        tenantId: ctx.snapshot.tenantId,
        error: error instanceof Error ? error.message : "unknown",
      })
    }
  }
  return eligible
}

/** Evaluate plays for today's snapshots and write ledger rows. */
export async function evaluateLifecyclePlays(
  deps: LifecycleDeps,
  input: { day?: Date; tenantIds?: readonly string[] } = {},
) {
  const { db } = deps
  const runtime = lifecycleRuntime(deps.env)
  const now = deps.now()
  const day = input.day ?? growthSnapshotDay(now)
  const createdEmailIds: string[] = []
  const counts = { tenants: 0, planned: 0, created: 0, deferred: 0 }
  let cursor: string | null = null
  for (;;) {
    const page = await listGrowthSnapshotsForDay(db, { day, cursor })
    if (page.length === 0) break
    cursor = page.at(-1)?.snapshot.tenantId ?? null
    const rows = input.tenantIds
      ? page.filter((row) => input.tenantIds?.includes(row.snapshot.tenantId))
      : page
    const tenantIds = rows.map((row) => row.snapshot.tenantId)
    const recipientsByTenant = await listGrowthRecipients(db, tenantIds)
    const userIds = [
      ...new Set(
        [...recipientsByTenant.values()].flat().map((entry) => entry.userId),
      ),
    ]
    const [preferences, history, salesHistory, countries, featureTaps] =
      await Promise.all([
        readMarketingPreferences(db, userIds),
        readLifecycleHistory(db, userIds, now),
        readGrowthSalesHistory(db, tenantIds, now),
        readGrowthBillingCountries(db, tenantIds),
        Promise.all(
          tenantIds.map(
            async (tenantId) =>
              [
                tenantId,
                await featureIntentTapsForTenant(db, tenantId),
              ] as const,
          ),
        ),
      ])
    const featureIntent = new Map(featureTaps)

    const decided = rows.map((row) => {
      const snapshot = toContractSnapshot(row.snapshot)
      const ctx: PlayContext = {
        now,
        snapshot,
        weekAgo: row.weekAgo ? toContractSnapshot(row.weekAgo) : null,
        checkoutAvailable: isLifecycleCheckoutAvailable(
          {
            business: countries.get(snapshot.tenantId) ?? {
              countryCode: null,
              currencyCode: snapshot.currencyCode,
            },
          },
          deps.env,
        ),
        salesHistory: salesHistory.get(snapshot.tenantId) ?? null,
        featureIntent: featureIntentSummaryFromTaps(
          featureIntent.get(snapshot.tenantId) ?? [],
        ),
      }
      return {
        tenantId: snapshot.tenantId,
        eligible: eligiblePlays(deps.plays, ctx),
      }
    })
    const pairs = new Map<string, { playId: string; periodKey: string }>()
    for (const { eligible } of decided)
      for (const { play, decision } of eligible) {
        const playId = decision.ledgerPlayId ?? play.id
        pairs.set(`${playId}|${decision.periodKey}`, {
          playId,
          periodKey: decision.periodKey,
        })
      }
    const existing = new Set(
      pairs.size && tenantIds.length
        ? (
            await db.lifecycleMessage.findMany({
              where: {
                tenantId: { in: tenantIds },
                OR: [...pairs.values()],
              },
              select: {
                tenantId: true,
                userId: true,
                playId: true,
                periodKey: true,
              },
            })
          ).map(
            (row) =>
              `${row.tenantId}|${row.userId}|${row.playId}|${row.periodKey}`,
          )
        : [],
    )

    for (const { tenantId, eligible } of decided) {
      counts.tenants += 1
      if (eligible.length === 0) continue
      const recipients = (recipientsByTenant.get(tenantId) ?? []).map(
        (recipient) => ({
          ...recipient,
          consent: preferences.get(recipient.userId) ?? {
            productTips: true,
            offers: true,
            monthlyReport: true,
            unsubscribedAllAt: null,
          },
          history: history.get(recipient.userId) ?? {
            emailSentAt: [],
            inAppVisible: false,
          },
        }),
      )
      const { planned, deferred } = planLifecycleMessages({
        now,
        tenantId,
        eligible,
        recipients,
        enabledPlays: runtime.enabledPlays,
        alreadyRecorded: (userId, playId, periodKey) =>
          existing.has(`${tenantId}|${userId}|${playId}|${periodKey}`),
      })
      counts.deferred += deferred.length
      for (const message of planned) {
        counts.planned += 1
        const result = await insertLifecycleMessageIfAbsent(db, {
          tenantId: message.tenantId,
          userId: message.userId,
          playId: message.playId,
          periodKey: message.periodKey,
          variant: message.variant,
          channel: message.channel,
          status: message.status,
          suppressedReason: message.suppressedReason,
          templateKey: message.decision.templateKey,
          payload: {
            data: message.decision.data,
            ctaPath: message.decision.ctaPath,
            inAppKey: message.decision.inAppKey ?? null,
            consent: message.consent,
          },
          now,
        })
        if (!result.created) continue
        counts.created += 1
        // Keep the in-run history current for later tenants of the same user.
        const entry = history.get(message.userId)
        if (entry && message.status !== "holdout") {
          if (message.channel === "email" && message.status === "pending")
            entry.emailSentAt.push(now)
          if (message.channel === "in_app" && message.status === "sent")
            entry.inAppVisible = true
        }
        if (message.channel === "email" && message.status === "pending")
          createdEmailIds.push(result.id)
      }
    }
    if (page.length < 200) break
  }
  return { ...counts, createdEmailIds }
}

/** Sets `convertedAt` for sent and holdout rows whose play succeeded in its window. */
export async function runLifecycleConversionCheck(deps: LifecycleDeps) {
  const { db } = deps
  const now = deps.now()
  const today = growthSnapshotDay(now)
  const maxWindow = Math.max(
    1,
    ...deps.plays.map((play) => play.success.windowDays),
  )
  const since = new Date(now.getTime() - maxWindow * DAY_MS)
  let cursor: string | undefined
  let checked = 0
  let converted = 0
  for (;;) {
    const rows = await listLifecycleConversionCandidates(db, {
      since,
      cursor,
      limit: 500,
    })
    if (rows.length === 0) break
    cursor = rows.at(-1)?.id
    const inWindow = rows.flatMap((row) => {
      const play = findPlayIn(deps.plays, row.playId)
      const sentAt = row.sentAt ?? row.createdAt
      if (!play) return []
      if (now.getTime() - sentAt.getTime() > play.success.windowDays * DAY_MS)
        return []
      return [{ row, play, sentDay: growthSnapshotDay(sentAt) }]
    })
    const keys = inWindow.flatMap(({ row, sentDay }) => [
      { tenantId: row.tenantId, day: sentDay },
      { tenantId: row.tenantId, day: today },
    ])
    const snapshots = await readGrowthSnapshots(db, keys)
    const dayKey = (tenantId: string, day: Date) =>
      `${tenantId}|${day.toISOString().slice(0, 10)}`
    for (const { row, play, sentDay } of inWindow) {
      const sentOn = snapshots.get(dayKey(row.tenantId, sentDay))
      const current = snapshots.get(dayKey(row.tenantId, today))
      if (!sentOn || !current) continue
      checked += 1
      try {
        if (
          play.success.achieved(
            toContractSnapshot(sentOn),
            toContractSnapshot(current),
          ) &&
          (await markLifecycleMessageConverted(db, { id: row.id, at: now }))
        )
          converted += 1
      } catch (error) {
        console.error("[lifecycle] success predicate threw", {
          playId: play.id,
          error: error instanceof Error ? error.message : "unknown",
        })
      }
    }
    if (rows.length < 500) break
  }
  return { checked, converted }
}

async function claimDailyRun(db: Db, day: string) {
  // Compare-and-set on one SystemConfiguration row: only one run per UTC day,
  // even when two cadence runs overlap.
  const claimed = await db.$executeRaw`
    INSERT INTO "SystemConfiguration" (key, value, revision, "createdAt", "updatedAt")
    VALUES (${LAST_RUN_KEY}, ${JSON.stringify({ day })}::jsonb, 1, now(), now())
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, revision = "SystemConfiguration".revision + 1, "updatedAt" = now()
      WHERE "SystemConfiguration".value->>'day' IS DISTINCT FROM ${day}`
  return claimed === 1
}

/** The daily part: snapshots, plays, ledger, inline sends, conversion check. */
export async function runGrowthLifecycleDaily(
  deps: LifecycleDeps = defaultLifecycleDeps(),
) {
  const now = deps.now()
  const snapshots = await buildGrowthSnapshots(deps.db, {
    now,
    computeStage,
  })
  const pruned = await pruneGrowthSnapshots(deps.db, now)
  const evaluated = await evaluateLifecyclePlays(deps)
  const sent: Partial<Record<LifecycleSendOutcome, number>> = {}
  for (const id of evaluated.createdEmailIds) {
    const outcome = await sendLifecycleEmail(id, deps)
    sent[outcome] = (sent[outcome] ?? 0) + 1
  }
  const conversions = await runLifecycleConversionCheck(deps)
  const { createdEmailIds, ...counts } = evaluated
  return {
    snapshots,
    pruned,
    ...counts,
    emails: createdEmailIds.length,
    sent,
    conversions,
  }
}

/** Hourly cadence step. Idle cost when the flag is off: no SQL at all. */
export async function runGrowthLifecycleSweep(
  deps: LifecycleDeps = defaultLifecycleDeps(),
) {
  const runtime = lifecycleRuntime(deps.env)
  if (!runtime.enabled) return { enabled: false }
  const now = deps.now()
  const day = growthSnapshotDay(now).toISOString().slice(0, 10)
  const daily =
    now.getUTCHours() >= LIFECYCLE_DAILY_START_UTC_HOUR &&
    (await claimDailyRun(deps.db, day))
      ? await runGrowthLifecycleDaily(deps)
      : null
  const leftovers = await sendPendingLifecycleEmails(deps)
  return { enabled: true, daily, leftovers }
}
