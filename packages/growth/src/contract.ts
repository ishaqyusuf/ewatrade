// Shared contract for lifecycle marketing plays.
// Plan: docs/plans/2026-11-12-lifecycle-marketing-plan.md
//
// Pure types and constants only: no database, email or runtime imports, so
// every workstream (engine, adoption plays, revenue plays, metrics) can build
// against this file in parallel.

export const GROWTH_STAGES = [
  "signed_up",
  "activated",
  "habit",
  "expanding",
  "paying",
  "at_risk",
  "dormant",
] as const
export type GrowthStage = (typeof GROWTH_STAGES)[number]

export type GrowthPlanId = "free" | "starter" | "growth" | "pro"

/** Monthly WhatsApp assistant replies per plan (owner decision, 12 Nov 2026). */
export const WHATSAPP_REPLIES_PER_MONTH: Record<GrowthPlanId, number> = {
  free: 200,
  starter: 1000,
  growth: 1000,
  pro: 1000,
}

/**
 * One business on one UTC day. Mirrors the `BusinessGrowthSnapshot` row with
 * plain JS types. The engine (W1) builds it; plays only read it.
 */
export type GrowthSnapshot = {
  tenantId: string
  /** UTC day, `YYYY-MM-DD`. */
  day: string
  stage: GrowthStage
  planId: GrowthPlanId
  businessCreatedAt: Date
  activeDays28: number
  ordersLast7: number
  ordersThisMonth: number
  ordersTotal: number
  /** Integer minor units (kobo for NGN). */
  salesMinorThisMonth: bigint
  currencyCode: string
  catalogItems: number
  staffCount: number
  businessesOwned: number
  moneyAccounts: number
  storefrontPublished: boolean
  customDomain: boolean
  whatsappLinked: boolean
  telegramLinked: boolean
  /** Null until the WhatsApp quota ledger exists. */
  waRepliesUsed: number | null
  waRepliesCap: number | null
  /** used / limit for each finite plan limit, e.g. `{ products: 0.85 }`. */
  limitPressure: Partial<Record<GrowthLimitName, number>>
  lastActiveAt: Date | null
}

export type GrowthLimitName =
  | "products"
  | "staff"
  | "businesses"
  | "ordersPerMonth"
  | "storefrontItems"
  | "offlineDevices"

export type LifecycleChannel = "email" | "in_app" | "whatsapp" | "telegram"

/** The consent bucket a play's email falls under (`MarketingPreference`). */
export type ConsentCategory =
  | "productTips"
  | "offers"
  | "monthlyReport"
  /** Limit reached / service notices: not blocked by opt-out, still deduped. */
  | "transactional"

export type PlayFamily = "adoption" | "revenue" | "retention"

/** Stable play ids, P01–P15 in the plan. */
export const PLAY_IDS = [
  "P01_welcome",
  "P02_first_sale",
  "P03_assistant_channel",
  "P04_site_setup",
  "P05_custom_domain",
  "P06_money_accounts",
  "P07_staff",
  "P08_limit",
  "P09_success",
  "P10_whatsapp_80",
  "P11_whatsapp_exhausted",
  "P12_second_business",
  "P13_monthly_report",
  "P14_at_risk",
  "P15_win_back",
  /** Third "See plans" tap on locked-feature sheets (W3, not in the v1 table). */
  "P16_feature_intent",
] as const
export type PlayId = (typeof PLAY_IDS)[number]

/**
 * When several plays are eligible for one recipient on one day, the earliest
 * here wins (plan §4.3). Plays not listed rank after these, in PLAY_IDS order.
 */
export const PLAY_PRIORITY: readonly PlayId[] = [
  "P11_whatsapp_exhausted",
  "P08_limit",
  "P10_whatsapp_80",
  "P02_first_sale",
  "P04_site_setup",
  "P06_money_accounts",
  "P03_assistant_channel",
]

export type PlayContext = {
  now: Date
  snapshot: GrowthSnapshot
  /** Snapshot from 7 days earlier when one exists (for trends and milestones). */
  weekAgo: GrowthSnapshot | null
  /** True when Paystack web checkout is live for this business's territory. */
  checkoutAvailable: boolean
  /**
   * Monthly sales history before the current month (P09). Undefined or null
   * when the engine has not loaded it; plays that need it stay dormant.
   */
  salesHistory?: SalesHistory | null
  /** "See plans" taps on locked-feature sheets (P16). Null = not loaded. */
  featureIntent?: FeatureIntentSummary | null
}

export type SalesHistory = {
  /** Completed calendar months with at least one order, before this month. */
  priorMonths: number
  /** Highest completed-month sales, integer minor units. */
  bestPriorMonthMinor: bigint
  /** Median completed-month sales, integer minor units. */
  medianPriorMonthMinor: bigint
}

export type FeatureIntentSummary = {
  /** Lifetime "See plans" taps on locked-feature sheets for this business. */
  taps: number
  /** When the third tap happened; null below three taps. */
  thirdTapAt: Date | null
  /** Locked features tapped, most recent first (plan catalogue feature keys). */
  features: readonly string[]
}

/** Values a template may interpolate. Never free text from users. */
export type PlayTemplateData = Record<string, string | number | boolean | null>

export type PlayDecision = {
  /**
   * Dedupe window: one message per (tenant, recipient, ledger play id,
   * periodKey). E.g. `"2026-11"`, `"products:2026-11"`, `"once"`.
   */
  periodKey: string
  /** Ledger play id when a play has sub-variants, e.g. `"P08_limit:products"`. */
  ledgerPlayId?: string
  /** Email template key in `packages/email` (e.g. `"lifecycle-site-setup"`). */
  templateKey: string
  /** In-app card copy key, when the play has an in-app surface. */
  inAppKey?: string
  data: PlayTemplateData
  /** App-relative path the CTA opens (wrapped by the signed `/go/:token` redirect). */
  ctaPath: string
  /**
   * Overrides the play's static consent for this one decision, e.g. P08 is
   * `offers` below 100% of a limit and `transactional` at 100%.
   */
  consent?: ConsentCategory
  /** Overrides the play's channels for this one decision (P08 per threshold). */
  channels?: readonly LifecycleChannel[]
}

export type LifecyclePlay = {
  id: PlayId
  family: PlayFamily
  consent: ConsentCategory
  /** Channels this play may use; policy picks per caps and consent. */
  channels: readonly LifecycleChannel[]
  /**
   * Real-time plays are also inserted by the command that crosses the
   * threshold (e.g. a limit check), not only by the daily sweep.
   */
  realtime: boolean
  /** Return a decision when the play applies today, else null. Must be pure. */
  eligible: (ctx: PlayContext) => PlayDecision | null
  success: {
    /** Days after send in which a conversion is attributed to this play. */
    windowDays: number
    /** True once the business did what the play asked. Pure. */
    achieved: (sentOn: GrowthSnapshot, current: GrowthSnapshot) => boolean
  }
}

/** Holdout share kept unsent per play to measure lift (plan §2). */
export const HOLDOUT_PERCENT = 10

/** `YYYY-MM` of a date in UTC; the default monthly period key. */
export function monthKey(date: Date) {
  return date.toISOString().slice(0, 7)
}
