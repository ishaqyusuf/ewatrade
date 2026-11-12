// P10 (80% of the monthly WhatsApp replies used) and P11 (cap reached).
//
// Offers depend on the plan (owner decision, 12 Nov 2026):
//   Free:  1. Starter (5× the replies)  2. Telegram
//   Paid:  1. Top-up pack               2. Telegram
// Growth and Pro get the same 1,000 replies as Starter, so a tier upgrade only
// fixes the cap for Free. Top-up pricing is undecided: until a top-up product
// exists, paid plans offer Telegram only.
//
// Telegram replies do not count against the WhatsApp cap: Telegram has its
// own runtime and outbox and never goes through the WhatsApp turn path where
// the quota hook sits.
//
// Dormant until the WhatsApp quota ledger exists: the snapshot carries
// `waRepliesUsed` / `waRepliesCap` as null and neither play is eligible.

import {
  type GrowthPlanId,
  type GrowthSnapshot,
  type LifecyclePlay,
  type PlayContext,
  type PlayDecision,
  WHATSAPP_REPLIES_PER_MONTH,
  monthKey,
} from "../../contract"
import {
  TELEGRAM_CONNECT_PATH,
  catalogPlan,
  nextMonthStartLabel,
  upgradeCta,
  upgradedSince,
} from "./plans"

/** Flip once a WhatsApp top-up product exists (pricing still open). */
export const WHATSAPP_TOP_UP_AVAILABLE = false
export const WHATSAPP_TOP_UP_PATH = "/settings/billing?topup=whatsapp"

export type WhatsAppCapOffer = "upgrade_starter" | "top_up" | "telegram"

/** Offers in the order the message presents them. */
export function whatsappCapOffers(
  planId: GrowthPlanId,
  options: { hasTopUp: boolean },
): WhatsAppCapOffer[] {
  if (planId === "free") return ["upgrade_starter", "telegram"]
  return options.hasTopUp ? ["top_up", "telegram"] : ["telegram"]
}

export type WhatsAppCapStage = "warning" | "exhausted"

const EPSILON = 1e-9

/**
 * Where WhatsApp usage stands, or null when the play must stay quiet: no
 * quota ledger yet (null counts), no cap, or WhatsApp not linked. A
 * Telegram-only business is never linked to WhatsApp, so it never qualifies.
 */
export function whatsappCapStage(
  snapshot: Pick<
    GrowthSnapshot,
    "waRepliesUsed" | "waRepliesCap" | "whatsappLinked"
  >,
): WhatsAppCapStage | null {
  const { waRepliesUsed: used, waRepliesCap: cap } = snapshot
  if (used === null || cap === null || cap <= 0) return null
  if (!snapshot.whatsappLinked) return null
  if (used >= cap) return "exhausted"
  if (used / cap + EPSILON >= 0.8) return "warning"
  return null
}

function decision(
  ctx: PlayContext,
  stage: WhatsAppCapStage,
): PlayDecision | null {
  const { snapshot } = ctx
  if (whatsappCapStage(snapshot) !== stage) return null
  const used = snapshot.waRepliesUsed ?? 0
  const cap = snapshot.waRepliesCap ?? 0
  const offers = whatsappCapOffers(snapshot.planId, {
    hasTopUp: WHATSAPP_TOP_UP_AVAILABLE,
  })
  const starter = catalogPlan("starter")
  const primary = offers[0]
  let cta: { ctaPath: string; ctaLabel: string }
  if (primary === "upgrade_starter")
    cta = upgradeCta({
      plan: starter,
      checkoutAvailable: ctx.checkoutAvailable,
      playId:
        stage === "warning" ? "P10_whatsapp_80" : "P11_whatsapp_exhausted",
    })
  else if (primary === "top_up")
    cta = { ctaPath: WHATSAPP_TOP_UP_PATH, ctaLabel: "Top up replies" }
  else
    cta = {
      ctaPath: TELEGRAM_CONNECT_PATH,
      ctaLabel: snapshot.telegramLinked ? "Open Telegram" : "Connect Telegram",
    }
  return {
    periodKey: monthKey(ctx.now),
    templateKey:
      stage === "warning"
        ? "lifecycle-whatsapp-warning"
        : "lifecycle-whatsapp-exhausted",
    inAppKey:
      stage === "warning" ? "whatsapp-cap-warning" : "whatsapp-cap-exhausted",
    ctaPath: cta.ctaPath,
    data: {
      used,
      cap,
      left: Math.max(cap - used, 0),
      resetsOn: nextMonthStartLabel(ctx.now),
      planName: catalogPlan(snapshot.planId).name,
      offers: offers.join(","),
      starterReplies: WHATSAPP_REPLIES_PER_MONTH.starter,
      starterMultiple:
        WHATSAPP_REPLIES_PER_MONTH.starter / WHATSAPP_REPLIES_PER_MONTH.free,
      starterPriceLabel: starter.priceLabel,
      telegramLinked: snapshot.telegramLinked,
      telegramPath: TELEGRAM_CONNECT_PATH,
      checkoutAvailable: ctx.checkoutAvailable,
      ctaLabel: cta.ctaLabel,
    },
  }
}

/** Upgraded (Free), linked Telegram, or got back under the cap via a top-up. */
function capSolved(sentOn: GrowthSnapshot, current: GrowthSnapshot) {
  return (
    upgradedSince(sentOn.planId, current.planId) ||
    (!sentOn.telegramLinked && current.telegramLinked) ||
    (current.waRepliesCap ?? 0) > (sentOn.waRepliesCap ?? 0)
  )
}

export const whatsappWarningPlay: LifecyclePlay = {
  id: "P10_whatsapp_80",
  family: "revenue",
  consent: "offers",
  channels: ["whatsapp", "in_app", "email"],
  realtime: true,
  eligible: (ctx) => decision(ctx, "warning"),
  success: { windowDays: 7, achieved: capSolved },
}

export const whatsappExhaustedPlay: LifecyclePlay = {
  id: "P11_whatsapp_exhausted",
  family: "revenue",
  // Running out is a service notice: opt-out does not hide it.
  consent: "transactional",
  channels: ["whatsapp", "email"],
  realtime: true,
  eligible: (ctx) => decision(ctx, "exhausted"),
  success: { windowDays: 3, achieved: capSolved },
}
