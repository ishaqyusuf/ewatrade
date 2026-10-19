import type { MobileActivityInput } from "@ewatrade/events/mobile-activity"
import { useEffect, useRef } from "react"
import type { SaleStep } from "./create-sale-model"

export type SaleActivityCategory =
  | "catalog"
  | "quick_sale"
  | "additional_cost"
  | "mixed"

type Track = (input: MobileActivityInput) => void

/** Fixed category from the kinds of lines in the draft; null when empty. */
export function saleActivityCategory(
  catalogLines: number,
  freeLineKinds: readonly ("quick_sale" | "additional_cost")[],
): SaleActivityCategory | null {
  const kinds = new Set<SaleActivityCategory>()
  if (catalogLines > 0) kinds.add("catalog")
  for (const kind of freeLineKinds) kinds.add(kind)
  if (kinds.size === 0) return null
  if (kinds.size > 1) return "mixed"
  return [...kinds][0] ?? null
}

/** Builds the activity lifetime from explicit session facts. */
export function saleActivityLifetimeOf(facts: {
  token: string | null | undefined
  profile:
    | {
        id: string
        businessId?: string
        storeId?: string
        role?: string
        staffAccessMode?: string
        status?: string
      }
    | null
    | undefined
  hasBusinessAccess: boolean | null | undefined
  /** Data-cache generation. */
  generation: number
  /** Monotonic session-write generation (defeats an unobserved A→B→A). */
  sessionGeneration: number
  offline: boolean
  /** Monotonic operational-mode generation (offline/business changes). */
  operationalGeneration: number
}) {
  const { profile } = facts
  if (!facts.token || !profile?.id) return null
  return JSON.stringify([
    facts.token,
    profile.id,
    profile.businessId ?? null,
    profile.storeId ?? null,
    profile.role ?? null,
    profile.staffAccessMode ?? null,
    profile.status ?? null,
    facts.hasBusinessAccess ?? null,
    facts.generation,
    facts.sessionGeneration,
    facts.offline,
    facts.operationalGeneration,
  ])
}

export type SaleSubmissionOutcome = "saved" | "queued" | "failed" | "unknown"

const PAYMENT_CATEGORY = {
  cash: "cash",
  bank_transfer: "bank_transfer",
  card: "card",
  pos: "pos",
} as const

export type SaleActivityState = {
  /**
   * The rendered session/actor/business/Store/cache/connection lifetime. A
   * change retires everything observed; null reports nothing.
   */
  lifetime: string | null
  step: SaleStep
  category: SaleActivityCategory | null
  itemCount: number
  /** The model's completion for this lifetime (restored or new). */
  completion: { status: "created" | "queued" } | null
  /**
   * The model's latest accepted confirmation: a private attempt object and
   * its authoritative (saved/queued) or classified (failed/unknown) outcome.
   */
  submission: { attempt: object; outcome?: SaleSubmissionOutcome } | null
  /** The account currently chosen, if any (sole preselection excluded). */
  chosenAccountId: string | null
  paymentMethod: string
}

type Observed = {
  lifetime: string | null
  /** The live session moved on: this render lifetime reports nothing. */
  retired: boolean
  /** A start was reported, or suppressed because the draft was restored. */
  started: boolean
  /** Started by a first line in this lifetime; steps report only then. */
  fresh: boolean
  step: SaleStep | null
  /** Attempts reported as submitted, and attempts whose result reported. */
  attempts: WeakSet<object>
  results: WeakSet<object>
  pendingAccount: string | null
}

/**
 * Observational New sale events (fixed enums only, at most once per real
 * transition). A sale starts when its first line is added; start-funnel steps
 * report after a change; each accepted confirmation attempt reports once, and
 * its first outcome once (saved/queued from the model's completion,
 * failed/unknown from the shared failure classifier). A draft restored with
 * lines reports no start or steps, but its own later submit and result do
 * report; an attempt or completion already showing at a new lifetime never
 * does. A destination account reports only after
 * the user's own choice is applied. Every report first checks the rendered
 * lifetime against the live one; a mismatch retires this lifetime for good.
 * Tracking errors never reach the sale.
 */
export function useSaleActivity(
  state: SaleActivityState,
  track: Track,
  /**
   * The session/cache/connection lifetime right now, read from live state
   * rather than these props. A failure counts as a mismatch.
   */
  live: () => string | null = () => state.lifetime,
) {
  const {
    lifetime,
    step,
    category,
    itemCount,
    completion,
    submission,
    chosenAccountId,
    paymentMethod,
  } = state
  const seen = useRef<Observed>({
    lifetime: null,
    retired: false,
    started: false,
    fresh: false,
    step: null,
    attempts: new WeakSet(),
    results: new WeakSet(),
    pendingAccount: null,
  })
  const liveNow = () => {
    try {
      return live()
    } catch {
      return undefined
    }
  }
  /** Retire this observer lifetime for good (A→B→A never revives it). */
  const retire = () => {
    const s = seen.current
    s.retired = true
    s.pendingAccount = null
  }
  /** Current only while this exact rendered lifetime is still the live one. */
  const isLive = () => {
    const s = seen.current
    if (lifetime === null || s.retired || s.lifetime !== lifetime) return false
    if (liveNow() === lifetime) return true
    retire()
    return false
  }
  const emit = (input: MobileActivityInput) => {
    // Checked immediately before every report.
    if (!isLive()) return
    try {
      track(input)
    } catch {
      // Observational only.
    }
  }
  useEffect(() => {
    const s = seen.current
    if (s.lifetime !== lifetime) {
      // A genuinely new rendered lifetime: nothing carries over. An attempt
      // already showing was not seen here and never reports.
      const prior = submission ? [submission.attempt] : []
      seen.current = {
        lifetime,
        retired: false,
        // A draft that already holds lines or a completion is in progress:
        // no start or start-funnel steps, but its own later submit and
        // result still report.
        started: Boolean(category || completion),
        fresh: false,
        step,
        attempts: new WeakSet(prior),
        results: new WeakSet(prior),
        pendingAccount: null,
      }
      return
    }
    // Session, token, profile, cache or connection changed before these
    // props did: nothing is observed or reported for this lifetime again.
    if (!isLive()) return
    if (!s.started && category && !completion && !submission) {
      s.started = true
      s.fresh = true
      emit({ name: "mobile_sale_started", properties: { category } })
    }
    if (s.step !== step) {
      s.step = step
      if (s.fresh && category)
        emit({
          name: "mobile_sale_step_viewed",
          properties: { action: step, category },
        })
    }
    // Keyed by the model's own attempt object, so a confirm whose
    // submitting state was batched away is still seen exactly once.
    if (submission && category && !s.attempts.has(submission.attempt)) {
      s.attempts.add(submission.attempt)
      emit({
        name: "mobile_sale_submitted",
        properties: { category, item_count: Math.min(itemCount, 1000) },
      })
    }
    if (
      submission?.outcome &&
      category &&
      s.attempts.has(submission.attempt) &&
      !s.results.has(submission.attempt)
    ) {
      s.results.add(submission.attempt)
      emit({
        name: "mobile_sale_result",
        properties: { category, status: submission.outcome },
      })
    }
    if (s.pendingAccount && s.pendingAccount === chosenAccountId) {
      s.pendingAccount = null
      emit({
        name: "mobile_payment_account_selected",
        properties: {
          category:
            PAYMENT_CATEGORY[paymentMethod as keyof typeof PAYMENT_CATEGORY] ??
            "other",
        },
      })
    }
  })
  return {
    /** Call with the account id the user just picked. */
    noteAccountChoice(accountId: string) {
      if (!isLive()) return
      seen.current.pendingAccount = accountId
    },
  }
}
