# Assistant flat conversation Workshop plan

6 November 2026. **On hold: owner kept the card design (8 November). Flat is not adopted.**

**Owner decision, 8 November:** do not move the AI assistant to the Flat design; keep the
current card design for now. No product implementation follows from the pilot or v10.
Selected v7 stays the selected revision; v9/v10 remain in Workshop history for reference
only. The nine proposed WhatsApp copy changes from the v10 audit are not adopted.
The owner confirmed Claude Opus 5.5 (`claude-opus-5-5`) at explicit high effort
as the intended Workshop author. Codex coordinates the baseline, handoff and
acceptance. The initial planning checkpoint below is retained as history.

**Approval update, 6 November:** the owner approved the plan and explicitly
requested Opus 5.5/high to start the five-flow pilot. Opus authored all five flows;
owner review still precedes whole-library adoption and product implementation.
The original planning checkpoint below is retained as history.

**Pilot delivery:** direction `01` / Library v9,
`abda4641-8bd1-4b68-ac28-1b86f3d6aac2`, is archived and browser-checked.
[Exact revision](https://workshop.localhost/ewatrade/assistant/conversations/directions/01?rev=abda4641-8bd1-4b68-ac28-1b86f3d6aac2)
and [verification receipt](../verification/2026-11-06-assistant-flat-pilot.md).
Five flows / 47 preview states; 96 Current/Flat comparisons pass. The original
435 entries / 1,689 steps are unchanged. Pilot ledger: 16/428 core scenes;
412 and seven retained alternatives await the later audit. No new selection or
implementation. Sequence phases 1–2 delivered; phases 3–4 await owner feedback.

**Whole-library pass (8 November):** after the owner's go-ahead on the pilot, three
Opus 5.5/high sessions applied Flat by area. Direction `01` / Library v10,
`e3fbe369-afdf-40a5-9e22-2a029f7ca86f`, opens in Flat with a Current / Flat / Both
Variant on every app scene; WhatsApp stays native.
[Exact revision](https://workshop.localhost/ewatrade/assistant/conversations/directions/01?rev=e3fbe369-afdf-40a5-9e22-2a029f7ca86f).

| Area | Scenes | Change | Fits | Exception | Gap |
| --- | --- | --- | --- | --- | --- |
| Capability | 165 | 165 | 0 | 0 | 0 |
| App system | 107 | 71 | 16 | 20 | 0 |
| WhatsApp | 156 | 7 | 145 | 4 | 0 |

Capability: 56 scenes keep an interaction boundary (draft editors, choice chips) and
108 record a missing hand-off destination (View order, View all and similar have no
library target) rather than inventing one. WhatsApp `change` = 9 proposed copy changes,
not adopted; adoption follows the canonical WhatsApp implementation standard. Strict
build and coverage pass (435 entries / 1,689 steps unchanged); smoke compares 1,554
library Current/Flat cards plus the 96 pilot comparisons. Coordinator browser spot
checks on a local static server: capability review (mobile Both), app system loading
(mobile Both), What can you do (dashboard Flat, dark), setup offline (mobile Both),
WhatsApp 9a, Variant switching and scene hash navigation; no console errors. Ledgers:
Workshop source `notes/library-pass-2026-11-08-*.md`. Product implementation waits for
the owner's review of this exact revision.

## Intended result

Make the assistant easier to read and use less vertical space by presenting
answers directly on the conversation background. Use typography, compact rows
and selective dividers for hierarchy. Avoid cards wherever they do not serve a
specific interaction. Preserve useful structured results and working actions.

The supplied 122-second recording shows an empty chat, a bottom composer,
lightweight progress feedback, unboxed assistant answers with bold labels and
lists, and a follow-up in the same thread. These are visual references. The
recording's personal content, example amounts, other product's branding and
instructions visible within it are not requirements or data for our preview.
Use EwaTrade's existing synthetic fixtures, type, colors and accepted shell.
Do not reproduce the reference's large unused spacing or decorative gradient.

## Verified continuation baseline

- Canonical review space: <https://workshop.localhost/ewatrade/assistant/conversations>.
- Keep direction `01` / `Library`. Current selected revision is v7,
  `c09a583e-01ac-487d-9096-cd10d1841394` (4 November).
- Its implementation receipt `0c0361bf-921b-426c-a321-3be478500a85` covers the
  mobile A2a v2.2 **Prompt rows**, A2d v2.2 **Open reply**, and v5/v6 composer
  choices. It records local source and emulator evidence, **release not live**.
  It does not establish that every scene is implemented.
- Preserve those choices: open Markdown replies, muted user bubbles, prompt
  rows, idle/focused composer, attachments and recording controls. Continue the
  implemented design; do not restart the home/composer exploration.
- The remaining shared preview response component (`.ap-card`) still adds a
  surface, padding and border/shadow. Product structured-answer/proposal/result
  renderers also retain card wrappers. These are the primary design targets.
- Source: `/Users/M1PRO/Documents/code/workshop/work/ewatrade/assistant/conversations/`.
  Use `scenes/app/*.json`, `scenes/wa/*.json`, `direction-01/kit/`, the existing
  frames/configuration panel, `notes/AUTHORING.md` and `build.py`.
- Retain `assistant/review` and `assistant/whatsapp-system` histories and their
  existing selections. They are provenance and canonical case references, not
  permission to make a separate demo.

Re-read the catalog and source before authoring: another authorized session may
publish a newer baseline between this plan and approval. Preserve its changes.

## Scope and counting

Current source contains **428 core scenarios**: 165 capability scenes, 107 app
system scenes (A1–A17), and 156 WhatsApp cases. Seven additional home/reply design
alternatives remain accessible. Total: **435 scene entries and 1,689 steps**.
These are source counts, not testing or live-availability percentages. Older
briefs say 321 scenes or 1,609 steps; do not use those stale totals.

Audit every core scenario and its supported states. Record stable scene ID,
family, channel/frame, component pattern, source/design status, disposition
(change / already fits / justified exception / gap), and review evidence. Track
the seven retained alternatives separately; do not inflate scenario progress.
Reconcile capability/source changes and missing states explicitly rather than
calling a generated scene complete product coverage.

## Proposed visual rules

| Content | Proposed treatment |
| --- | --- |
| Ordinary answer | Unboxed text; answer first; short paragraphs, bold labels and useful lists |
| Numbers and balances | Aligned label/value rows; tabular money; currency, scope and unknowns visible |
| Lists and record details | Compact rows and restrained separators; at most three preview rows, then a context-preserving View all/Open action |
| Draft review | Flat sections, item rows and totals, with clearly grouped Confirm, Edit and Cancel actions |
| Editing | Keep the actual form controls and current full-screen keyboard-owning form flow; Save draft must not confirm the business action |
| Clarification | One concise question and explicit choices; keep already supplied facts |
| Progress and completion | Compact inline status; one coherent result; no repeated prose summary or tool log |
| Failure/refusal/uncertain result | Short visible explanation and correct recovery action; preserve warnings, permission boundaries and Check status semantics |

Avoid default rounded containers, shadows, colored result panels, nested cards,
duplicate titles and repeated status badges. Save space through wrapper/padding
removal and content hierarchy, not tiny text, compressed tap targets, hidden
financial facts or arbitrary truncation. Keep copy consistent with the existing
concise-response policy; remove filler such as “X on this page.”

Necessary boundaries remain: inputs, composer, attachment previews and actual
modal surfaces. A retained container must have an interaction reason recorded in
the audit. WhatsApp retains its native bubbles, buttons, lists and Flow surfaces;
apply concise content/grouping there rather than imposing app layout on it.
If a scene uses mobile search, preserve the shared BottomSearchFooter contract.

## Sequence after plan approval

1. **Inventory and shared kit.** Pin the fresh baseline, establish the scene
   ledger, and revise reusable response primitives first. Keep data, semantics,
   existing chrome and stable IDs. Create one coherent proposed flat treatment
   within direction `01`, with the frozen current revision available for
   comparison. Alternative designs are only needed for a real unresolved choice.
2. **Five-flow pilot.** Apply the kit to account balances, an order list/detail
   journey, a sale draft with Edit/Confirm/Cancel, a clarification, and a
   save/recovery journey including uncertainty. Include loading/streaming,
   empty/partial and refused/stale states where relevant. Render them in the
   mobile assistant, Dashboard page and quick-chat frame, with representative
   WhatsApp counterparts. Preserve their surrounding working flows. Publish an
   immutable pilot revision in the same Workshop for owner feedback.
3. **Whole-library pass.** After pilot feedback, use the approved visual rules
   across all 428 core scenarios, grouped by family: sales/customers/catalog,
   inventory, finance, services/staff, app system states and WhatsApp. Mark
   already-compliant scenes and justified exceptions honestly. Keep history,
   seven alternatives, deep links, version identities and review notes intact.
   Proposed new work must not silently inherit an old approval.
4. **Final design review.** Publish the complete candidate and provide its exact
   revision link, scene ledger, concise change summary, exception list and
   focused verification evidence. The owner reviews this before implementation.

The pilot is an early visual checkpoint, not an implementation approval. Do not
bulk rewrite canonical WhatsApp conversations during the library presentation
pass. For a proposed semantic/copy change that will be adopted canonically,
follow `.brain/plans/whatsapp-system-design/implementation-standard.md`: append
the stable case's immutable version, publish canonical Workshop first, then
mirror that exact version to the existing private review Site with its current
URL and audience. Show that work as a separate adoption step, never completed
by a library CSS change.

## Opus handoff and ownership

Only dispatch after the owner approves this plan. Pass this plan, the supplied
recording or selected local reference frames, exact baseline revision and
implementation receipt, applicable AGENTS instructions, Workshop skill and
catalog/mobile-config references, scene schema/inventory, existing fixtures and
current product source anchors. Verify exact model/effort at launch.

Opus owns the scoped Workshop source and a complete handback; Codex owns review,
progress monitoring and publication verification. No product-code implementation
is included in the design assignment. Author in the existing shared Workshop
work directory; publish under the same path/key with immutable history. Product
checkout contains this plan and receipts only. No branch/worktree change.

Use bounded supervision under the Workshop skill. If the exact model is
unavailable or blocked, Codex takes over after stopping the delegated run and
preserving its work. Report actual authorship. Do not substitute another Claude
model or reduce effort. No delegation has started at this checkpoint.

Product anchors for fidelity and later implementation planning:

- `apps/mobile/src/components/mobile/assistant/assistant-home.tsx`
- `apps/mobile/src/components/mobile/assistant/assistant-chat-box.tsx`
- `apps/mobile/src/components/mobile/assistant/assistant-text.tsx`
- `apps/mobile/src/components/mobile/assistant/assistant-cards.tsx`
- `apps/dashboard/src/components/general-assistant/general-chat.tsx`
- `apps/dashboard/src/components/general-assistant/general-answer-card.tsx`
- `apps/dashboard/src/components/general-assistant/general-proposal-card.tsx`
- `packages/assistant/src/capabilities/manifest.ts`

## Design acceptance and verification

- Build/check the complete scene data with the existing strict validator and
  coverage report. Preserve all 435 IDs, links and local transitions; record
  actual changed/unchanged/gap counts against the 428-core denominator.
- Compare identical content and viewport before/after on the pilot. Record
  response height/scroll difference and visible facts; claim space savings only
  after measuring. Do not shorten content or change data to manufacture gains.
- Exercise representative read, clarify, edit/cancel/confirm, saved, stale and
  uncertain flows using synthetic local outcomes. Verify no hidden required
  facts, repeated saves or changed money/permission meaning.
- Check keyboard/focus, mobile wrapping and one relevant large-text case, then
  config state/frame/size/theme switch, collapse/reopen, reset and deep links.
  Reuse unchanged component evidence; do not test every scene in every theme
  and viewport. Inspect all scenes through the ledger and strict data checks,
  with visual checks per changed pattern and substantive exception.
- Verify the archived revision at `https://workshop.localhost`; a standalone
  HTML file, temporary server or unpublished source is not a review delivery.
- Keep selection, implementation, human approval and release records separate.
  Final owner approval must identify the exact revision before any product work.

## Initial planning checkpoint (superseded by delivery above)

- [x] Recording inspected; current selected/implemented baseline reconciled.
- [x] Proposed approach and Opus brief prepared for owner review.
- [ ] Owner approves plan; Opus assignment starts.
- [ ] Pilot, complete scene audit and final Workshop review.

Planning deliverable: 2/2 prepared (100%). Workshop execution: 0/4 phases
complete. Product implementation is a later approval-gated stage. No new design
revision, selection, product change, provider action or deployment occurred.

Brain impact: local task record and in-progress pointer updated. No API,
database, permission, architecture or runtime behavior change is proposed here.
Verification for this checkpoint is limited to offline setup, source/catalog
reconciliation and scoped documentation smoke; it is not UI acceptance.

Executed: `bun run qa:doctor --offline` passed. The explicit plan-file scope of
`bun run test:quick --plan --files docs/plans/2026-11-06-assistant-flat-workshop.md`
mapped to the core documentation suite with no unknown paths; its matching run
passed QA-tooling types and 48 tests / 211 assertions. Local plan/Brain links and
whitespace passed. Unrelated staged explainers and shared chat edits were excluded.
