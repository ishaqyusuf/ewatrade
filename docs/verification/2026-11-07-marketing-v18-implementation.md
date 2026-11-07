# Marketing v18 implementation and Logly coverage — 7 November 2026

Owner approved implementation of the reviewed full polish and requested all
important marketing events be tracked with Logly. Implemented in the existing
main checkout, preserving unrelated Agent Chat and staged explainer changes.
No worktree, push, merge, deployment, provider setting or credential change.

## Exact design

Selected before editing: direction 01 Whole Business v18
`06f5bfbf-714e-4c91-8840-6512d15e2214`.
[Approved design](https://workshop.localhost/ewatrade/marketing/complete-business-2026-10-29/directions/01?rev=06f5bfbf-714e-4c91-8840-6512d15e2214).
[Local implementation](https://ewatrade.localhost).
Earlier revisions and v15 implementation history retained.

Codex continues the established Workshop takeover after exact Claude Opus 5.5
with high effort failed authentication before authoring. No model substitution.

The existing React components retain the approved layout/section order and live
signup, contact and assistant integrations. Scoped ivory/sand/terracotta styles,
warm dark mode, heading roles, hero spacing and phone line breaks match v18.
Curated illustrative records replace QA/test wording; product, stock and WhatsApp
examples share names and quantities. Features explain outcomes and link to their
matching walkthrough/state or stock/customer/team detail. Paid CTAs explicitly
say Contact us; allowance/FAQ wording is source-grounded. Native/offline retains
Coming soon. Existing runtime comparison uses canonical MARKETING_OFFERS rather
than duplicating the Workshop's illustrative comparison strings.

Workshop-only embed interception is unnecessary in the React app: native anchors
plus scoped scroll margins clear the sticky header. Historical components remain.
No real business commands run from illustrative controls.

## Logly coverage

Existing packages/events provider and same-origin proxy remain the sole pipeline
for the fixed ewatrade-marketing project. Existing automatic site_visit/page_view,
form lifecycle and public assistant/registration events are reused.

| Interaction | Event / fixed dimensions |
| --- | --- |
| Signup, sign-in, contact, paid-plan contact, WhatsApp launch | marketing_cta_clicked; action, channel, plan/category |
| Header/mobile menu, feature and footer destinations | marketing_demo_interacted; navigation and explicit destination category |
| Walkthrough tabs, including keyboard selection | navigation; timeline and storefront/quotes/orders/finance/reports |
| Demo playback, WhatsApp review/cancel, business movement | existing play/pause/conversation/review/cancel_review labels |
| Phone preview mode, back/next, add sample, variant filter | navigation/previous_step/next_step/add_sample/filter with fixed labels |
| Demo quantity buttons | quantity_increase / quantity_decrease |
| Manual quantity editing and demo search | quantity_edit / search; once per field per landing mount |
| FAQ and pricing comparison | faq/compare; opened/closed; distinct fixed FAQ categories |
| Appearance and mobile menu buttons | theme with light/dark; menu_open/menu_close |
| Contact/lead forms and public assistant registration | existing started/submitted/failed and actual registration outcomes, unchanged |

Closing signup attribution corrected from hero to closing. Autoplay is not
counted as deliberate navigation. Input engagement never reads or sends typed
text, quantity, price, customer/business name, raw link, message or form contents.
Collection failures cannot block actions. Unknown metadata labels are rejected.
Existing QA exclusion, privacy signals, enable flags and server-only keys remain.
A CTA measures intent, not a completed account, payment or provider delivery.

## Verification

- Offline doctor passed. Marketing named-host readiness passed with the existing
  Portless CA; the initial invocation without that CA failed TLS readiness.
  Existing dev stack reused; no service start/restart needed.
- Marketing tsc --noEmit passed.
- Focused analytics/form/demo tests: 14 pass, 322 assertions. Added rendered-control
  coverage checks actual component output, not only helper vocabulary. After adding
  the unchanged business-motion control to that coverage, its focused rerun passes.
- The actual sanitizer and isolated Logly proxy forward accepted labels using the
  Marketing credential/project; unsafe input removed, foreign origins rejected,
  analytics exceptions nonfatal. Network is replaced with a test collector; no
  hosted analytics event or business transaction was manufactured.
- Canonical local browser desktop + 390px/320px: approved visuals, two-line phone
  hero and no horizontal overflow. Features target top about100px/header76px;
  phone customer detail top88px/header64px. Reports opens its matching state;
  keyboard Home returns to the first walkthrough step.
- Pricing comparison opens; warm dark/light appearance works. Phone menu
  navigation, quantity 4→5 (22,500), Proceed/customer step and Back/restore pass.
  Viewport reset, local tab retained, no error-level console messages captured.
- Reduced motion was active in the browser and the motion controls correctly
  disabled. No exhaustive motion/accessibility or native device acceptance claim.
- qa:smoke supports authenticated Dashboard/Android sale journeys, not this
  marketing landing; it was not run against unrelated business data or claimed as
  marketing acceptance. Focused CUA review supplies landing UI evidence.

Hosted Logly persistence and Production rollout are not verified by these local
checks. No collection flag, provider setting, key, origin or deployment changed.

## Brain impact

Updated local .brain/features/marketing-launch-v4.md,
.brain/features/logly-analytics.md and .brain/tasks/2026-11-07-marketing-full-polish.md.
Brain is ignored and not force-added; this tracked receipt preserves the record.
No API, DB or permission contract changes; public merchant capabilities and
assistant authority are unchanged (H02 noAssistantImpact record included).

## Final source checks

- Explicit 17-owned-path fast scope: 259 tests, 1,679 assertions, zero failures;
  QA tooling types and scoped Biome passed; no unknown mappings. Concurrent work
  excluded. This is source smoke, not whole-checkout or release acceptance.
- H01 coverage current with APP_ENV=local (the correct local application mode).
  Initial default-mode run omitted the five local QA procedures and therefore
  differed from the snapshot; no coverage file or capability was changed.
- H02 assistant impact passed with the task's reviewed noAssistantImpact record.
- Final whitespace/source review passed.
