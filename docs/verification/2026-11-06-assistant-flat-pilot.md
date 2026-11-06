# Assistant flat conversation pilot — 6 November 2026

Status: pilot ready for owner review; archived browser acceptance passed.
This receipt covers the owner-approved five-flow Workshop pilot. Whole-library
adoption and product implementation await owner review.

## Provenance and scope

- Author: Claude Opus 5.5, exact model `claude-opus-5-5`, explicit `--effort high`.
  Launch arguments and returned model metadata were checked. Supervised Claude
  session `56043730-6679-4282-a24c-7ed73ed074ad`; Codex coordinates acceptance.
- Canonical Workshop: <https://workshop.localhost/ewatrade/assistant/conversations>,
  existing direction `01` / Library.
- Baseline: selected v7 `c09a583e-01ac-487d-9096-cd10d1841394`, with implementation
  receipt `0c0361bf-921b-426c-a321-3be478500a85`. Its mobile Prompt rows, Open reply,
  and composer choices are retained. That evidence records local implementation,
  not a live release.
- First review archive: v8 `8ac430ba-1d53-4ad6-888c-004b582949c4`. It remains in
  history. Final candidate: **v9 `abda4641-8bd1-4b68-ac28-1b86f3d6aac2`**,
  [open exact revision](https://workshop.localhost/ewatrade/assistant/conversations/directions/01?rev=abda4641-8bd1-4b68-ac28-1b86f3d6aac2).
  The catalog still selects v7 and retains its one implementation receipt.
- The provided recording is a visual reference. Its personal content, branding,
  example amounts and embedded instructions were not imported into the design.

| Flow | Comparison scope |
| --- | --- |
| P1 Balances | Compact account rows, account destination, offline/access states |
| P2 Orders | Three-row preview, Today/All Stores destination, record detail |
| P3 Sale | Review, full-screen editor, Cancel, Confirm, saving, receipt, large text |
| P4 Clarification | Explicit unit choices, stock refusal, retained draft facts |
| P5 Recovery | Locked uncertain save, Check status, stale payment recovery |

Each flow offers Current/Flat/Both and supported Mobile, Quick chat, Page and
WhatsApp frames in the existing Library configuration panel. P1 is dashboard
only in the app, matching its capability contract. WhatsApp counterparts retain
their native presentation and canonical case data.

Original library: 428 core scenarios (165 capabilities + 107 app system + 156
WhatsApp) and seven retained alternatives, 435 entries / 1,689 steps. The pilot
ledger covers seven app scenes and nine unchanged WhatsApp counterparts: 16/428
core scenes. The remaining 412 and seven alternatives are not yet audited.

## Verification record

Author checks on the final source:

- Strict build, full coverage and bundle generation pass: 435 original entries /
  1,689 steps, plus five pilot flows / 47 pilot states (5, 13, 10, 6, 13).
- Bun pilot smoke passes 96 matched Current/Flat render comparisons, strict
  money validation, draft/receipt arithmetic, independent sale/payment models,
  cancellation and one-result semantics. No untargeted central pilot actions.
- Original app, WhatsApp and world bundle data compare identically with v7.
  Changed JavaScript files pass syntax checks.

Codex browser checks on archived v9:

- Fresh embedded load fits both dashboard frames to the 644px stage. The earlier
  v8 defect measured 793px against that stage; resizing is no longer required.
- P1 View all opens five known accounts with scope, amounts and paused-account
  status. At the same 490px response width, the identical balance content measures
  293px Current versus 234px Flat: 59px / 20.1% less height. This is one measured
  response, not a claim of savings across the library.
- P2 list → known order → Back and View all preserve Today / All Stores. Empty
  and partial streaming fixtures render. No unknown orders were manufactured.
- P3 Edit starts from the reviewed two bags. Cancel discards a three-bag edit.
  Negative payment is rejected. Unsaved three bags / ₦78,000 payment survive
  Dark and Current/Flat switching. Save returns an unconfirmed review showing
  ₦234,000 total, ₦78,000 paid, ₦156,000 owed and eleven bags left. Confirm's
  simulated receipt and View order retain those exact facts.
- P4 the 50kg-bag choice refuses twelve requested bags against three in stock;
  switching to twelve kg yields the Honey Beans draft and its ₦26,400 receipt,
  with 28kg left. No rice-sale facts leak into that flow.
- P5 Confirm locks Confirm/Edit/Cancel while checking. Check status yields one
  receipt. The stale-payment branch refuses its old draft, exposes the current
  ₦14,500 due, and saves a ₦1,000 edit into a matching review/receipt with ₦13,500
  remaining; the other ₦10,000 payment remains visible in the review.
- The keyboard-open HTML editor has no horizontal overflow; Tab from Amount paid
  reaches Save. The 200% sale review has a 354px content/scroll width and 56px
  action targets. These checks do not establish native keyboard behavior.
- Reset restores the fixture; section/frame switching still reaches the existing
  Assistant library and WhatsApp recovery case. Browser warning/error log: empty.
- Earlier v8 presentation checks cover 320px dark wrapping and preference
  retention through collapse/reopen and flow navigation; those presentation
  styles are unchanged in v9. Final v9 also renders the 320px Both comparison.

Screenshot:
`/Users/M1PRO/.codex/visualizations/2026/11/06/01a1afeb-2631-7d83-bdbf-9a71d15d124f/assistant-flat-pilot-v9.jpg`.

Product verification is scoped to the owned plan and receipt. Offline doctor and
the core documentation suite (QA-tooling types, 48 tests / 211 assertions) passed
at planning; the final two-file mapping has no unknown paths and reuses that
unchanged tooling evidence. Assistant impact reports no gated change; owned
documentation links and whitespace pass. No product feature,
device, provider or release acceptance is implied by these checks.

## Boundaries and retained gaps

- All outcomes are local synthetic previews; no business transaction, provider
  action, canonical WhatsApp adoption, private Site update or deployment occurs.
- The sample world contains three of the seventeen orders in the Today list.
  The destination preserves context and known records; the other fourteen are
  not fabricated. This is not runtime pagination evidence.
- P2's empty and streaming states are layout fixtures, not actual query results.
  Receipt/order destinations show known thread facts, not complete records.
  Existing surrounding order-page Receipt/Message/Ask controls remain outside
  this pilot's local interaction scope.
- The canvas is an HTML design reference. It does not establish native keyboard,
  accessibility, permission, concurrency or financial feature acceptance.
- Workshop source is retained under
  `/Users/M1PRO/Documents/code/workshop/work/ewatrade/assistant/conversations/`.
  Its ignored `work/` content is archived by immutable catalog revisions. Product
  Git changes for this task are planning/verification documentation only.
- Local Brain task and in-progress entries track the same review boundary. Brain
  is ignored/local-only; it is not force-added to Git.

Related: [approved plan](../plans/2026-11-06-assistant-flat-workshop.md).
