# Lifecycle marketing: upgrade nudges, adoption prompts and automated email

Date: 12 November 2026. Source audited: current `main` checkout.

Status: planning only. Nothing is implemented yet. The owner answered most decisions
on 12 November 2026 (Section 8). Two remain open: top-up pack pricing and the sending
subdomain.

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
| P10 | **WhatsApp cap: 80%** | 80% of the plan's monthly replies used (160 of 200 on Free, 800 of 1,000 on paid) | WhatsApp footer + in-app + email to owner | "40 replies left, resets on 1 Dec" | Free: Upgrade / Use Telegram. Paid: Top up / Use Telegram | Upgrade, top-up or Telegram link |
| P11 | **WhatsApp cap: exhausted** | Cap reached (the final-notice reply from the quota plan) | Final WhatsApp reply + email | Free: Starter gives 5× the replies, or use Telegram. Paid: top-up pack or Telegram. Telegram is not counted against the WhatsApp cap | Upgrade / Top up / Connect Telegram | Any option within 72h |
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
- **Checkout is being switched on now** (Paystack web subscriptions, in a separate
  session). Upgrade plays link straight to checkout. As a safety net, if checkout is
  unavailable when a play fires, the CTA falls back to Plan and billing. It never
  shows a dead button.
- **New businesses start on Free.** This applies once the owner-billing switch is on.
  In code, `ownerBillingRuntime()` stamps new businesses into the Free cohort. With the
  switch off, they fall back to `RETAIL_OPS_LAUNCH_DEFAULT_PLAN_ID = "starter"`.
  Businesses created before the switch stay on the Starter launch default until the
  owner decides how to move them.

### WhatsApp cap playbook (P10, P11)

Monthly WhatsApp replies by plan (owner decision, 12 Nov 2026):

| Plan | Replies per month |
| --- | --- |
| Free | 200 |
| Starter | 1,000 (assumed: the "normal usage" figure) |
| Growth | 1,000 |
| Pro | 1,000 |

Growth and Pro do not get more replies, so a tier upgrade only solves the cap for Free
businesses. The order of the offer depends on the plan:

- **Free:** (1) Upgrade to Starter (5× the replies, plus every paid feature). This is
  the strongest Free→paid lever in the whole catalogue. (2) Telegram.
- **Paid:** (1) Top-up pack, the cheapest decision, keeps them on WhatsApp. (2) Telegram.
- **Telegram** is presented as "keep working tonight", not as a downgrade.

**Telegram is outside the WhatsApp cap (verified 12 Nov 2026).** Telegram has its own
runtime and outbox (`apps/api/src/assistant/telegram-runtime.ts`,
`packages/db/src/queries/assistant-telegram/*`). It does not go through the WhatsApp
turn path (`channel-turn.ts`, `assistant-whatsapp/*`), which is where the quota plan
puts its admission hook. Telegram does share the business's General token budget (5M
tokens per month), so very heavy Telegram use can still hit the token ceiling. The
quota implementation must keep its hook WhatsApp-only and add a test proving a
Telegram turn leaves the WhatsApp count unchanged.

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

## 7. Implementation: four workstreams

The seven phases are regrouped into four workstreams so they can run in parallel.
W1 goes first, but only its first day blocks the others: the schema plus the play
contract. After that, W2, W3 and W4 touch different files and can be built at the same
time by separate sessions.

```
W1 day 1: schema + play contract ──┬──► W2 Adoption & retention plays
W1 days 2–4: engine, consent,      ├──► W3 Revenue plays (needs checkout; cap plays need quota)
             tracking, email layout└──► W4 Metrics & Oversight dashboard
```

### W1. Foundation and email plumbing (4 days, first)

| Day | Deliverable | Files |
| --- | --- | --- |
| 1 | `growth.prisma` (`BusinessGrowthSnapshot`, `LifecycleMessage`, `MarketingPreference`) and migration. Play contract type (`id`, `periodKey()`, `eligible(snapshot)`, `successPredicate`, `channels`, `priority`, template key). Snapshot fixture builder for tests | `packages/db/prisma/models/growth.prisma`, `packages/growth/src/contract.ts`, `packages/growth/src/fixtures.ts` |
| 2 | Snapshot builder (paged grouped reads, reusing plan-limit and feature-availability queries). Daily `sweep("growth-lifecycle")` step in the existing cadence, behind `GROWTH_LIFECYCLE_ENABLED` | `packages/db/src/queries/growth-snapshot.ts`, `packages/jobs/src/tasks/scheduled-cadences.ts` |
| 3 | Policy (caps, quiet hours, priority, stable 10% holdout, consent). Ledger insert-if-absent, claim and send fence. Inline send after commit, with leftovers sent by the sweep | `packages/growth/src/policy.ts`, `packages/db/src/queries/lifecycle-messages.ts` |
| 4 | Lifecycle email layout signed "Ishaq from EwaTrade" with `List-Unsubscribe` headers. Signed `/go/:token` click redirect. Resend webhook join for delivered, bounced and complained. One-click unsubscribe page and Account preference toggles | `packages/email/components/lifecycle-layout.tsx`, API route, Resend webhook handler, Dashboard route |

Done means a fixture play runs end to end on Preview, delivers to QA routing only, and
records delivered and clicked.

### W2. Adoption and retention plays (3–4 days, after W1 day 1)

P02 first sale, P03 assistant channel, P04 site setup, P05 custom domain, P06 money
accounts, P07 staff, P13 monthly value report, P14 at risk, P15 win-back. This also
covers the `growth.activeNudge` read and the Home card on Dashboard and mobile.

Files: `packages/growth/src/plays/adoption/*`, `packages/email/emails/21-…` to `29-…`,
the nudge tRPC procedure and the Home card components.

These plays need no billing. They can go live as soon as W1 ships.

### W3. Revenue plays (3–4 days, after W1 day 1)

| Play | Depends on |
| --- | --- |
| P08 limit pressure (80% banner, 90% email, 100% plan comparison), using a real-time insert in the limit-checking commands | Checkout live (payment session) |
| P09 success milestones and P12 second business | Checkout live |
| Feature-intent email (third "See plans" tap) | W4 intent events |
| P10 and P11 WhatsApp cap, with plan-aware offers (Free → Starter, paid → top-up), and the Telegram connect path | WhatsApp quota ledger with Free 200 / paid 1,000, and top-up pricing |

Files: `packages/growth/src/plays/revenue/*`, `packages/email/emails/30-…` onward, and
the threshold hooks in the order, catalog and staff limit checks.

Build P08, P09 and P12 as soon as checkout is live. Build P10 and P11 straight after
the WhatsApp quota ships. That quota is its own plan
(`docs/plans/2026-11-09-whatsapp-response-quota.md`) and is not part of this workstream.

### W4. Metrics and Oversight (3 days, after W1 day 2)

- Logly intent events: `plan_sheet_opened`, `upgrade_cta_clicked`, `nudge_shown`,
  `nudge_dismissed`, using fixed labels only.
- Oversight Growth page with the Section 5.2 panels: north star, stage funnel,
  activation cohorts, limit pressure, product-qualified leads list, feature adoption,
  WhatsApp usage, per-play scorecard with lift, and MRR once checkout is live.
- Conversion check in the sweep (`convertedAt` via each play's success predicate).

Files: `packages/oversight/src/*`, the Oversight app page, and the analytics event
whitelist.

### Later: Oversight marketing console

This was requested for after the automation is running. Each Oversight login can open
a business's snapshot, choose or approve messages, and send them under the operator's
own name. W1's ledger already stores the channel, play and sender per message, so this
adds a `senderUserId` column and a manual `periodKey`, not a new system. Until then,
everything is automatic and signed by Ishaq.

### Order

1. W1 day 1 lands and is committed.
2. W2, W3 (P08, P09, P12) and W4 run in parallel. W1 days 2–4 continue alongside.
3. Turn on W2 plays first, then W3 once checkout is live.
4. P10 and P11 follow the WhatsApp quota.
5. Review the play scorecard after two weeks.

### Testing

- Unit tests: every play's `eligible()` against snapshot fixtures (boundary cases at
  79/80/90/100%), and policy (caps, quiet hours, holdout stability, opt-out).
- DB integration: insert-if-absent dedupe under concurrent sweeps, and claim/send fence
  (reuse the template-update email tests as the model).
- Email preview fixtures for each new template in the existing gallery.
- QA routing check: lifecycle mail in Preview goes only to QA addresses.

## 8. Owner decisions (answered 12 November 2026)

| # | Question | Decision |
| --- | --- | --- |
| 1 | Sender identity | **"Ishaq from EwaTrade"** for now, fully automated. Later, the Oversight marketing console lets each operator choose messages and send under their own name |
| 2 | Opt-in default | Not answered directly. **Using the recommendation:** product tips on by default, one-click opt-out on every email |
| 3 | WhatsApp replies by tier | **Free 200, Growth 1,000, Pro 1,000.** Starter assumed 1,000. Top-up pack sizes and prices are **still open** |
| 4 | Telegram vs WhatsApp cap | **Confirmed by the owner and verified in code:** Telegram does not count against the WhatsApp cap. It shares the token budget |
| 5 | Upgrade CTA while billing is off | **Checkout is being switched on now**, so upgrade plays link to real checkout |
| 6 | Free plan | **Every business starts on Free.** True in code once the owner-billing switch is on. Businesses created before that stay on the Starter launch default, and the owner still has to decide how to move them |
| 7 | Lifecycle mail subdomain | **Still open.** Recommended: a separate sending subdomain so marketing complaints cannot hurt login-code delivery. Needed before W1 day 4 |

The owner also asked to split the phases into 3–4 workstreams for faster implementation
(Section 7).

## 9. Explicitly out of scope for now

- Third-party marketing automation (Customer.io, HubSpot, Braze) and CDP sync.
- SMS marketing, push notification campaigns, paid ads attribution.
- AI-generated personalised copy per business. Fixed templates with their numbers are
  enough and are safer.
- Discounts and coupons engine. Add it only after pricing is live and a play shows
  price is the blocker.
