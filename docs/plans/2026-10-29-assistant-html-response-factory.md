# Assistant HTML response factory

29 October 2026. Owner requested a navigable HTML Workshop covering the existing
Assistant product and coordinated responses, including WhatsApp. This replaces
the screenshot-led default review experience; it does not approve changes to
product responses or release configuration.

## Review authority and baseline

Extend `https://workshop.localhost/ewatrade/assistant/review`, direction `01`.
Retain the complete immutable history, including the former screenshot index
v19, revision `bf433a3e-50a3-4f8a-a9e5-c1a370ebbb1d`. Earlier selections and
implementation records in linked domain workshops remain authoritative.

Use the existing banking HTML navigation as the interaction reference:
`finance/business-banking`, direction `02` v18,
`9a15dd1d-5612-4d02-8835-e7547d0d6d8e`. Reuse existing HTML scene assets and the
current product's response shapes, labels, controls and relationships. Historical
HTML reproductions need explicit provenance; their existence does not establish
parity with today's source.

WhatsApp stays at `assistant/whatsapp-system`. Latest direction `03` v38 at
discovery is `2a937d66-b440-4861-a340-6cbb81a6a70b`; selection remains `03` v32,
`6eb39236-823c-4fe6-85b6-eea22a1a4699`. Its 156 stable cases and 409 case versions
are reused with focused HTML replay/navigation. Indexing them does not change
their semantics, versions, selection or private Site mirror. Future conversation
changes follow `.brain/plans/whatsapp-system-design/implementation-standard.md`,
including Workshop-first publication and the same private Site mirror.

## Required experience

- Render actual designed HTML screens and conversations. Screenshot grids are
  not response scenes. Product logos/photos remain appropriate inside designs.
- Show one scene at a time, with domain, case, channel and meaningful state
  navigation, previous/next, reset and a direct scene address.
- Preserve a continuous conversation through the requested task, clarification,
  review, edit/cancel, simulated result and original-record/back states where
  these exist. A list of feature names is not coverage.
- Dashboard and mobile show the existing app structure; WhatsApp shows its
  existing conversation engine. Show one device variant at a time.
- Reuse the floating, collapsible left mobile configuration panel. Size, theme
  and scene changes retain preferences and draft context. Provide visible focus,
  keyboard access and reduced-motion support.
- Keep the canvas limited to the page/numbered scene titles, necessary controls
  and the designed product. Source evidence, review notes and coverage belong in
  review controls or exported metadata, never in simulated customer replies.

## Coverage contract

The source inventory at discovery contains 165 capabilities and 373 declared
capability/client pairs. Inventory is generated from
`packages/assistant/src/capabilities/manifest.ts`, including each capability's
examples, tool/action, canonical procedures, clients and rollout status.

Every declared pair must map to an exact HTML scene with source evidence, or an
explicit missing/planned preview entry. Unsupported channels remain unsupported.
Do not map one generic card to unrelated actions and call them covered. Counts of
inventory rows, designed scenes, current-source matches and verified flows remain
separate. Adding a capability changes the declared denominator visibly.

Represent the applicable normal, empty, incomplete, ambiguous, unavailable,
permission, stale and failure states. Write flows preserve the distinction among
draft preparation, review, confirmation and canonically saved results. Existing
planned capabilities may have design previews without executable availability.

Use synthetic data only. Current-formatter samples must run the actual pure
response functions and WhatsApp renderer, carry source hashes and keep their
original wording. This includes missing order-line units, no recorded payments,
customer-credit/refund distinctions and the current `X on this page` list copy.
Hand-authored conversation examples are labelled as authored designs in metadata.
No model, provider, database or domain mutation is required for this review.

## Refinement policy

The current behavior is the baseline. Proposed cleanup is a separate immutable
revision; never silently present improved prose as the existing implementation.

Answer the request first in plain language. Include facts needed to understand
the result or take the next action. Avoid duplicate card summaries, tool-call
narration, generic introductions and repeated disclaimers. Mention a limitation
when it changes interpretation or action. Keep exact amounts, units, scope,
material unknowns and confirmation requirements.

Pagination is conditional: complete lists may state their verified count;
incomplete lists disclose continuation once. A fetched row count cannot answer
an aggregate count question. Do not impose truncation that removes material facts.

## Team handoff and history

Review submissions identify the case and version, channel/state, baseline
Workshop revision, source hash, observation and proposed refinement. Draft marks
and browser notes are not product approval. Export/import preserves reviewer
work without claiming a shared server inbox or multiuser persistence. Import
validates format and keeps existing notes on failure.

An assigned author proposes options against that exact baseline. The coordinator
verifies facts/controls, records an owner-selected exact revision before product
implementation, then records source and focused verification evidence. Selection,
implementation, testing, approval and release are distinct. A new design version
does not inherit acceptance from an older one.

Default Workshop author: Claude Opus 5.5, explicit high effort. The coordinator
monitors progress and takes over under the shared Workshop fallback policy.
Only the current checkout is authorized; no worktree or provider action is implied.

## Delivery checkpoints

1. Inventory existing HTML assets and current response contracts.
2. Capture current-formatter examples and source provenance.
3. Author the navigable library and explicit coverage mapping.
4. Publish a new immutable revision under the existing path/direction.
5. Verify representative navigation/flows and record remaining coverage gaps.

Completion of this delivery means the review artifact is published and checked.
It does not mean every capability is implemented, accepted, released, or that the
response refinement policy has been applied to production.
