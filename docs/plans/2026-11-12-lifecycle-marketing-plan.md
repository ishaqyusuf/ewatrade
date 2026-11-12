# Lifecycle marketing: upgrade nudges, adoption prompts and automated email

Date: 12 November 2026. Source audited: current `main` checkout.

Status: planning only. Nothing here is implemented or approved. Prices, payer scope and
the WhatsApp quota are owner decisions that are still open (see the last section).

## 1. Short answer: what exists today

No. EwaTrade has no lifecycle marketing. It has good parts we can reuse.

| Area | What exists | What is missing |
| --- | --- | --- |
| Email sending | Resend + React Email in `packages/email` with 20 transactional templates (OTP, welcome, staff invite, order reminders, template-update emails) | No marketing or lifecycle templates. No unsubscribe or consent model, except the storefront template-update email |
| Delivery tracking | Resend webhooks for staff invites and account privacy (`apps/api/src/staff/resend-webhook.ts`, `apps/api/src/account-privacy/resend-webhook.ts`) | No delivered, opened, clicked or bounced tracking for marketing mail |
| Scheduling | One gated Trigger.dev cadence (`packages/jobs/src/tasks/scheduled-cadences.ts`) with `sweep()` and `start(task, hasWork)` steps. The prelaunch cadence runs every 30 min | No lifecycle sweep |
| Durable "send once" | The template-update email pattern: a `BusinessActivityEvent` with a unique key, plus an outbox consumer | Not generalised for marketing plays |
| Plans and limits | `packages/db/src/queries/retail-ops-subscription-plans.ts`: Free / Starter ₦5k / Growth ₦15k / Pro ₦30k, with limits on products, staff, businesses, orders per month, storefront items and report history | Paid checkout is off. New businesses default to Starter during launch (`RETAIL_OPS_LAUNCH_DEFAULT_PLAN_ID`). An upgrade nudge has nowhere to send people yet |
| Usage limits | The General assistant has 5M tokens per business per month | The 1,000 WhatsApp replies per month cap and top-ups are a plan only (`docs/plans/2026-11-09-whatsapp-response-quota.md`) |
| Product analytics | Logly (marketing, storefront and app events) and the `ProductAnalyticsEvent` table | No per-business health snapshot, activation score or funnel for upgrades |
| In-app surfaces | Notifications bell, Home guided journey, locked-feature "See plans" sheets, progressive feature reveal | No targeted in-app message driven by usage |
| Internal ops | Oversight / internal office app | No growth dashboard |

**Conclusion:** we need one small system that does four things. It computes a daily
snapshot of each business. It decides which "play" (nudge) applies. It records the play
once in a ledger. It delivers the play by email or in the app, and tracks clicks and
conversions. Everything else already exists.

## 2. Principles for a small team

1. **Build it in-house and keep it thin.** All the signals live in Postgres, and the
   send-once outbox and cadence patterns already exist. A tool such as Customer.io,
   Loops or HubSpot would need a sync pipeline of user and usage data, which costs more
   to run than the feature. Revisit this only if a non-engineer has to author campaigns
   every week.
2. **No new crons and no per-event Trigger runs** (Trigger.dev budget). One daily
   `sweep()` in the existing cadence. Send inline where possible, and leave failures
   PENDING in the outbox for the next sweep.
3. **Triggered, not batch-and-blast.** Every message is caused by something the
   business did or reached. Product announcements are the only broadcasts, sent by
   hand through Resend Broadcasts.
4. **One message, one action.** Show their own numbers. Plain founder-voice email with
   a single button.
5. **Measure lift, not opens.** Keep a 10% holdout per play so we know whether the
   nudge caused the upgrade.
6. **Consent and caps are built in from the first release.** This covers unsubscribe,
   frequency caps and quiet hours.

## 3. Lifecycle model (the marketing strategy)

Use one stage model for every business. Each stage has one goal metric.

| Stage | Definition (computed) | Goal | Main plays |
| --- | --- | --- | --- |
| 1. Signed up | Business created, fewer than 3 catalog items or no order | First sale recorded within 7 days | Welcome series, "add 3 products", "record first sale" |
| 2. Activated | First order recorded, plus 3+ items | 3 active days in week 2 | Habit tips: assistant on WhatsApp/Telegram, day close, reports |
| 3. Habit | Active on 8+ of the last 28 days | Adopt depth features | Site setup, money accounts, staff, customer messages |
| 4. Expanding | Hits 80% of any plan limit, or reaches a success milestone | Upgrade or buy a top-up | Tier upgrade, WhatsApp top-up or Telegram, second business |
| 5. Paying | On a paid plan (once billing is live) | Retain and expand | Monthly value report, annual plan offer (later) |
| 6. At risk | Was in Habit, now 0 active days in the last 10 | Reactivate | "We miss you" with their last-month numbers |
| 7. Dormant | No activity for 30+ days | Win back or close cleanly | One win-back email, then stop |

**North-star metric:** weekly active selling businesses (WASB). This counts businesses
with at least 1 order or service job recorded in the last 7 days.

### Plays catalogue (version 1)

Every play is a code-defined rule: `eligible(snapshot) -> message`. Timing is the
earliest send after the condition becomes true, then normal caps apply.

| # | Play | Trigger (from snapshot) | Channel | Message angle | CTA | Success metric (7–14 day window) |
| --- | --- | --- | --- | --- | --- | --- |
| P01 | Welcome | Business created | Email (already exists as `09-workspace-welcome`) | What to do first | Add products | First item within 48h |
| P02 | First sale nudge | 3+ items, 0 orders, 2 days after signup | Email + Home card | "Record today's first sale in 10 seconds" | Record a sale | First order |
| P03 | Assistant channel | Activated, no WhatsApp/Telegram link after 5 days | Email + in-app | "Run your shop from WhatsApp or Telegram" | Connect | Channel linked |
| P04 | **Site setup** | 5+ sellable items, no published storefront | Email + Home card | "Your 12 products could be online today, free" | Publish my site | Site published |
| P05 | **Custom domain** | Site published 14+ days with visits, no custom domain | Email | "Make it yourbusiness.com.ng" | Get a domain | Domain order paid |
| P06 | **Money accounts** | 10+ orders, only 1 money account (or none) | In-app + email | "See cash and bank separately, like at the end of the day" | Add accounts | 2+ active asset accounts |
| P07 | Staff | 30+ orders a month and 0 staff, or the owner records 90% of orders while working 6+ days a week | Email | "Let a sales rep record sales; you keep control" | Invite staff | Invitation accepted |
| P08 | **Tier upgrade: limit** | Any limit at 80% or more (products 80/100, staff 2/2, orders 40/50 on Free, storefront items) | In-app banner at 80%, email at 90%, and a block screen with plan comparison at 100% | "You've added 85 of 100 products" | See plans | Plan change |
| P09 | **Tier upgrade: success** | Milestone: 100th order, best month so far, or monthly sales at the 3× median | Email | Congratulate with their numbers, then show what Growth adds (more staff, 180-day history, customer messages) | See Growth | Plan change, or a click if billing is off |
| P10 | **WhatsApp cap: 80%** | 800 of 1,000 replies used this month | WhatsApp footer + in-app + email to owner | "200 replies left, resets on 1 Dec" | Top up / Use Telegram | Top-up or Telegram link |
| P11 | **WhatsApp cap: exhausted** | Cap reached (the final-notice reply from the quota plan) | Final WhatsApp reply + email | Three options: top-up pack, higher tier, or Telegram (not counted against the WhatsApp cap) | Top up / Upgrade / Connect Telegram | Any of the three within 72h |
| P12 | Second business | Growth trigger: 2+ stores' worth of orders, or the owner asks the assistant about another shop | Email | "Run your second shop from the same account" | Add business | Second business created |
| P13 | Monthly value report | Day 1 of each month, Habit stage and above | Email | Last month's sales, top items, time saved | Open report | Open rate, and retention as a proxy |
| P14 | At risk | Was Habit, now 10 days inactive | Email | Their last numbers plus one tip | Open app | Active again within 7 days |
| P15 | Win-back | 30 days dormant (once only) | Email | What's new, plus "reply if something didn't work" | Open app | Reactivation |

**Bold** marks the plays you named. P09 and P11 are the main revenue plays. P04, P06 and
P03 are the main retention plays, because businesses that use depth features churn less.

### Upgrade logic

- **Limit-based (P08)** is the strongest signal because the need is concrete. Warn at
  80% in the app. Email at 90%. At 100%, never block silently: show what they hit,
  what the next tier gives, and the price.
- **Success-based (P09)** works because the owner is in a good mood and can see the value.
  Lead with their numbers and keep the pitch to one line.
- **Feature-intent-based:** the existing locked-feature sheets (attachments, finance,
  customer messages) already explain the plan. Log each "See plans" tap as an intent
  signal, and send one email within 24h of the third tap.
- **Recommend the right tier.** Pick the smallest plan that removes the limit they hit.
  Never offer Pro to someone who only hit the Free order cap.
- **While paid billing is off (today):** run P08 and P09 as "join the Growth early list"
  and count clicks. That gives real willingness-to-pay data before checkout is
  switched on.

### WhatsApp cap playbook (P10, P11)

The order of the offer matters:

1. **Top-up pack.** This is the cheapest decision and keeps them on WhatsApp.
2. **Upgrade tier**, if a higher tier includes more replies. This needs a decision: does
   the reply allowance scale by tier?
3. **Telegram.** Free and unlimited on our side, a good retention escape valve. Present
   it as "keep working tonight", not as a downgrade.

This depends on the quota ledger in the WhatsApp quota plan. The marketing system only
reads `used / cap` from that ledger and never counts replies itself.

## 4. Engineering design

```
                  daily sweep (existing cadence, inside its run)
                                   │
  Postgres facts ──► 1. Snapshot builder ──► BusinessGrowthSnapshot (1 row/business/day)
                                   │
                     2. Play engine (pure, code-defined plays)
                                   │  eligible + consent + caps + holdout
                                   ▼
                     3. LifecycleMessage ledger (unique tenant+play+periodKey)
                                   │
              ┌────────────────────┼─────────────────────┐
         Email (Resend)      In-app card/banner      WhatsApp/Telegram footer
              │                    │                      │
              └──── 4. Tracking: /go/:token redirect, Resend webhooks, conversion check
                                   │
                     5. Growth dashboard (Oversight) + Logly events
```

Real-time triggers (P08 limit reached, P10/P11 cap reached) skip the daily wait. The
command that crosses the threshold inserts the ledger row in the same transaction and
sends inline after commit, using the house outbox pattern. The daily sweep sends any
leftovers.

### 4.1 Data model (new, all in one new file `packages/db/prisma/models/growth.prisma`)

```prisma
model BusinessGrowthSnapshot {
  id                 String   @id @default(cuid())
  tenantId           String
  day                DateTime @db.Date           // UTC day
  stage              String                      // signed_up | activated | habit | expanding | paying | at_risk | dormant
  planId             String
  activeDays28       Int
  ordersLast7        Int
  ordersThisMonth    Int
  salesMinorThisMonth BigInt
  catalogItems       Int
  staffCount         Int
  businessesOwned    Int
  moneyAccounts      Int
  storefrontPublished Boolean
  customDomain       Boolean
  whatsappLinked     Boolean
  telegramLinked     Boolean
  waRepliesUsed      Int?                         // from the quota ledger, once it exists
  waRepliesCap       Int?
  limitPressure      Json                         // { products: 0.85, staff: 1.0, ... }
  createdAt          DateTime @default(now())
  @@unique([tenantId, day])
  @@index([day, stage])
}

model LifecycleMessage {
  id            String   @id @default(cuid())
  tenantId      String
  userId        String                            // recipient (owner/admin)
  playId        String                            // "P08_limit_products"
  periodKey     String                            // dedupe window, e.g. "2026-11" or "once"
  variant       String                            // "control" | "a" | "b"
  channel       String                            // email | in_app | whatsapp | telegram
  status        String                            // pending | sent | suppressed | failed | holdout
  suppressedReason String?                        // unsubscribed | cap | quiet_hours | ...
  providerMessageId String?
  sentAt        DateTime?
  deliveredAt   DateTime?
  openedAt      DateTime?
  clickedAt     DateTime?
  convertedAt   DateTime?
  conversionRef String?                           // plan change id, site id, ...
  createdAt     DateTime @default(now())
  @@unique([tenantId, userId, playId, periodKey])
  @@index([status, createdAt])
  @@index([playId, sentAt])
}

model MarketingPreference {
  userId        String   @id
  productTips   Boolean  @default(true)           // lifecycle and adoption plays
  offers        Boolean  @default(true)           // upgrade and promo plays
  monthlyReport Boolean  @default(true)
  unsubscribedAllAt DateTime?
  updatedAt     DateTime @updatedAt
}
```

Notes:

- Holdout is a row with `status: holdout`. It is never sent, so conversion is still
  measured against it.
- `periodKey` gives the dedupe rule per play. P08 uses `limitName:month`, so one email
  per limit per month. P15 uses `once`.
- Snapshots are kept for 400 days. Tables stay small (businesses × days).

### 4.2 Modules and files

| Piece | Location | Notes |
| --- | --- | --- |
| Snapshot builder | `packages/db/src/queries/growth-snapshot.ts` | A few grouped SQL reads per page of 200 tenants. Reuse the existing plan-limit and feature-availability queries; do not duplicate them |
| Play catalogue | `packages/growth/src/plays.ts` (new small package) or `packages/notifications` | Pure functions plus copy keys. Unit-tested from snapshot fixtures |
| Policy (consent, caps, holdout) | `packages/growth/src/policy.ts` | Pure. Hash `tenantId+playId` → 0–99 for a stable holdout |
| Ledger and outbox | `packages/db/src/queries/lifecycle-messages.ts` | Insert-if-absent, claim, mark sent |
| Sweep | Add a `sweep("growth-lifecycle", …)` step in `scheduled-cadences.ts` that runs once per UTC day after 07:00 WAT | No new cron |
| Email templates | `packages/email/emails/21-…` onward, one per play family, using the shared layout | Founder voice, one CTA, with a `List-Unsubscribe` + `List-Unsubscribe-Post` header (RFC 8058) |
| Click tracking | API route `GET /go/:token`, where the token is a signed `messageId + target` | Sets `clickedAt`, then 302 to the target with `utm_source=lifecycle&utm_campaign=<playId>` |
| Delivery events | Extend the Resend webhook handler to update `LifecycleMessage` by `providerMessageId` | Hard bounce or complaint → set `unsubscribedAllAt` |
| Conversion check | Same sweep: for messages sent in the last 14 days, check the play's success predicate against today's snapshot | Sets `convertedAt` |
| In-app surface | One `growth.activeNudge` read (tRPC). Home card plus banner on Dashboard and mobile | The client never decides eligibility |
| Unsubscribe page | Dashboard public route `/email-preferences?token=` plus an Account settings section | One click, no login needed for the token link |
| Growth dashboard | Oversight app page | Section 5 |

### 4.3 Guardrails

- **Frequency caps:** at most 1 lifecycle email per user per 3 days and 2 per week. At
  most 1 in-app nudge visible at a time. Service and limit-reached messages are exempt
  because they are transactional.
- **Priority** when several plays are eligible: P11 > P08 > P10 > P02 > P04 > P06 > P03
  > others.
- **Quiet hours:** email and WhatsApp only between 08:00 and 20:00 business local time
  (WAT default).
- **Recipients:** Owner and Admin only. Never staff or customers.
- **QA and preview:** reuse `qa-email-routing.ts` and the QA provider guard. Lifecycle
  sending sits behind `GROWTH_LIFECYCLE_ENABLED` (default off), plus a per-play allowlist
  for staged rollout.
- **Legal (NDPA 2023, Nigeria):** product tips to existing customers can rely on
  legitimate interest, but every email must have a working one-click opt-out.
  Transactional mail (OTP, receipts, limit-reached) stays separate and is not affected
  by opt-out.

## 5. Metrics: how they are kept

### 5.1 Three layers

1. **Facts (source of truth):** the existing Postgres tables (orders, catalog, staff,
   subscriptions, sites, channels, quota ledger).
2. **Daily snapshot:** `BusinessGrowthSnapshot`. One row per business per day gives
   trends, cohorts and stage history without heavy queries on live tables.
3. **Message ledger:** `LifecycleMessage`, used for sent, delivered, clicked, converted
   and holdout. Logly keeps UI intent events (`plan_sheet_opened`, `upgrade_cta_clicked`,
   `nudge_dismissed`) using the existing fixed-label pattern with no personal data.

### 5.2 Growth dashboard (Oversight), version 1

| Panel | Definition |
| --- | --- |
| WASB (north star) | Count of businesses with `ordersLast7 > 0`, as a weekly trend |
| Stage funnel | Businesses per stage today, plus movement from last week |
| Activation rate | % of signups that reach Activated within 7 days, by weekly cohort |
| Retention curve | % of each signup-month cohort active in week 1, 4, 8 and 12 |
| Limit pressure | Businesses at 80% or more of each limit. This is the upgrade pipeline |
| Product-qualified leads | Businesses in Expanding. List view with their limit or milestone |
| Feature adoption | % with site published, 2+ money accounts, staff, a channel linked, Telegram |
| WhatsApp usage | Reply distribution per business, % at 80%, % exhausted, top-up and Telegram conversions |
| Per-play scorecard | Sent, delivered %, click %, conversion %, holdout conversion %, **lift** = treated minus holdout |
| Revenue (once billing is live) | MRR, upgrades, downgrades, churn, and the share of upgrades attributed to a play |

**Attribution rule:** a conversion counts toward a play if it happens within that
play's window after the send (7 days for most, 3 days for P11). Lift against the
holdout is the number to decide on. Click-attributed conversions are a secondary view.

### 5.3 Decision rules

- A play is kept if its lift is positive with 100+ treated businesses. It is rewritten
  if click rate is under 2%. It is killed if unsubscribes are above 1% per send.
- Review the scorecard every two weeks. Change one variable at a time (subject, angle
  or timing).

## 6. Email automation in practice

- **Triggered email:** sent by the system above.
- **Broadcasts:** occasional product news to all opted-in owners, sent by hand from
  Resend Broadcasts. Sync is a one-off CSV export of opted-in owners at send time, with
  no continuous sync.
- **Sender:** `Ishaq from EwaTrade <hello@…>`, with replies routed to the support inbox
  (support-email-routing exists). Reply rates count as engagement.
- **Deliverability:** a separate subdomain for lifecycle mail (for example
  `mail.ewatrade…`) so marketing complaints cannot hurt OTP delivery. SPF, DKIM and
  DMARC must be in place on it. Warm it up with the monthly report first.
- **Template rules:** subject under 45 characters, their number in the first line, one
  button, a plain-text alternative, and a mobile-first layout that reuses the email
  design system.

## 7. Phased scope

| Phase | Scope | Est. effort | Depends on |
| --- | --- | --- | --- |
| 0. Decisions + instrumentation | Owner answers in Section 8. Add Logly intent events to locked-feature sheets and plan pages | 1 day | none |
| 1. Foundation | `growth.prisma` (3 models), snapshot builder, daily sweep, ledger, policy (caps, holdout, consent), unsubscribe route + preferences, flag off | 3–4 days | Phase 0 |
| 2. Adoption plays (no billing needed) | P02, P03, P04, P06, P07, P13 with email templates + Home card. Click redirect + Resend webhook join | 3–4 days | Phase 1 |
| 3. Growth dashboard | Oversight page with the Section 5.2 panels (excluding revenue) | 2 days | Phase 1 (data begins accruing) |
| 4. Upgrade plays | P08 real-time thresholds, P09 milestones, P12. While billing is off: "early list" CTA. After billing: plan comparison + checkout link | 2–3 days | Paystack activation for real checkout |
| 5. WhatsApp cap plays | P10, P11 reading the quota ledger, top-up offer, Telegram path | 2 days | WhatsApp quota plan implemented + top-up pricing |
| 6. Retention | P05, P14, P15, variant testing, revenue panel | 2–3 days | Phases 2–4 live for 4+ weeks |

Recommended order: 0 → 1 → 2 → 3, then ship and watch for two weeks before 4 and 5.
Phases 1–3 are valuable today even with billing off: they drive activation and give the
real demand numbers for the pricing decision.

### Testing

- Unit tests: every play's `eligible()` against snapshot fixtures (boundary cases at
  79/80/90/100%), and policy (caps, quiet hours, holdout stability, opt-out).
- DB integration: insert-if-absent dedupe under concurrent sweeps, and claim/send fence
  (reuse the template-update email tests as the model).
- Email preview fixtures for each new template in the existing gallery.
- QA routing check: lifecycle mail in Preview goes only to QA addresses.

## 8. Decisions needed from the owner

1. **Sender identity:** your name ("Ishaq from EwaTrade") or the brand only?
   Founder name usually gets higher reply and open rates.
2. **Opt-in default:** product tips on by default with one-click opt-out (recommended),
   or opt-in only?
3. **WhatsApp allowance by tier:** do Growth and Pro get more than 1,000 replies? Set
   the top-up pack sizes and prices (for example 500 replies for ₦X).
4. **Telegram positioning:** confirm that Telegram replies do not count against the
   WhatsApp cap. They still use the shared token budget.
5. **Upgrade CTA while billing is off:** "join Growth early list" (recommended), or
   hide upgrade plays until Paystack goes live?
6. **Free plan:** new businesses default to Starter during launch, so limit-based
   upgrade pressure on Free mostly appears after launch. Confirm when the launch
   default ends.
7. **Lifecycle mail subdomain:** approve a separate sending subdomain and DNS changes.

## 9. Explicitly out of scope for now

- Third-party marketing automation (Customer.io, HubSpot, Braze) and CDP sync.
- SMS marketing, push notification campaigns, paid ads attribution.
- AI-generated personalised copy per business. Fixed templates with their numbers are
  enough and are safer.
- Discounts and coupons engine. Add it only after pricing is live and a play shows
  price is the blocker.
