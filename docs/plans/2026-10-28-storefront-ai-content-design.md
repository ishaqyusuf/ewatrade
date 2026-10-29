# Storefront AI content — design review

Owner request, 28 October 2026: extend the existing dashboard template composer
Workshop with AI content generation, then wait for design review before product
implementation. The owner confirmed both typed refinement instructions and direct
editing of generated text.

## Current capability

The editor supports manual inline copy and durable AI **design** proposals.
`apps/dashboard/src/components/storefront/storefront-proposals.tsx` explicitly
limits its optional refinement to layout and styling. Generation availability is
server configured; this audit does not establish live provider availability.

`packages/storefront-contracts/src/manifest.ts` defines text fields with a key,
label, maximum character length and default. It does not define per-template AI
writing profiles, field purposes or target word ranges. The design brief in
`packages/storefront-contracts/src/design.ts` projects public business and catalog
facts for layout proposals; it is not the requested content drafting workflow.

## Proposed behavior

- Each versioned template supplies a writing profile and per-area purpose,
  recommended word range and hard field constraints. Portable section instances
  resolve guidance from their own source template/version.
- Generation combines that guidance with the current business's allowed public
  context and bounded merchant instructions. Missing facts remain missing.
- Merchants choose page, section or field scope. Existing manual edits are
  protected by default; replacements require explicit review.
- Generated text is editable. Merchants may type instructions to refine selected
  results, inspect current/proposed text and word counts, and choose fields to use.
- Apply changes only the unsaved draft and supports Undo. Ordinary Save and
  Review & publish keep their existing, separate authority.
- Loading, missing context, invalid length and failure/retry states are part of
  the review. Workshop outcomes are simulated with no business/provider calls.

This is proposed behavior, not an implemented contract. Persisted profile schema,
canonical commands, permission/entitlement checks, budget, durable jobs,
confirmation, API/assistant coverage and stale-draft protection must be assessed
in an approved implementation plan. Existing design-generation commands must not
silently gain content-writing authority. Assistant access is **planned**; this
delivery adds no merchant capability, command or client integration.

## Workshop authority and provenance

Extend [Storefront template studio](https://workshop.localhost/ewatrade/storefront/template-studio),
stable direction `01`, from exact selected v7
`1abf9af8-32a6-4cf1-a072-835c9ca9cd14`. Retain its selection and prior history.
Actual storefront template design authority remains the
[template library](https://workshop.localhost/ewatrade/storefront/template-library).
The new editor revision is a proposal awaiting owner review; it must not be
selected or marked implemented automatically.

T3 delegation is unavailable in this session. The installed Claude CLI was
invoked with `--model claude-opus-5-5 --effort high`; initialization confirms
`claude-opus-5-5`, session `471861ae-53d3-4f77-b30d-b9a196b627dc`.
The Claude run hit repeated read/tool permission blocks before producing design
edits. Under the owner's automatic-takeover instruction, Codex stopped its own
author PID 77445 and confirmed exit 143 before editing. Codex authored the AI
content extension on the preserved exact v7 assets. There was no model
substitution or Claude relaunch. No product implementation, provider activation,
push or deployment is authorized by this design request.

Final review: [direction 01 v9](https://workshop.localhost/ewatrade/storefront/template-studio/directions/01?rev=2363f66c-a869-48c6-8fa9-86f663684370),
immutable revision `2363f66c-a869-48c6-8fa9-86f663684370`, published 29 October 2026.
Intermediate v8 `6e562903-dbc7-4f8c-920e-a0e7ffcbd926` remains archived. Final v9
corrects the initial singular Apply label and includes the v8 verification handoff.
Catalog readback confirms selected v7 remains
`1abf9af8-32a6-4cf1-a072-835c9ca9cd14`; implementation count remains two.
The new revision is explicitly not implemented and awaits owner review.

## Delivery and verification

Design delivery checklist:

- [x] Audit current source and locate the selected editor revision.
- [x] Publish the incremental editor design (Codex automatic takeover).
- [x] Verify the archived central interaction and share the exact review revision.

Product implementation: not started; requires owner review of the exact design.

Offline `bun run qa:doctor --offline` passes profile isolation, dependency and
generated-client presence checks; it does not certify runtime or schema freshness.
No runtime services, database calls, fixtures or product builds are needed for
this design-only delivery. Shared unrelated checkout changes and staged files
remain outside this task's commit.

Focused verification on archived v8:

- Shared viewer renders the existing editor with toolbar/sidebar AI entrypoints.
- Business context is inspectable; Catalog and Quiet editorial display different
  field descriptions, voices and recommended word ranges. Inspecting guidance
  leaves the active template unchanged.
- Typed instructions produce a labelled simulated draft, with loading and
  current/proposed review. Directly edited introduction text remains exact while
  selected refinement updates the catalog heading; unchecked fields stay unused.
- Applying two checked areas updates only those areas as unsaved draft changes.
  Undo restores the original introduction, catalog heading and Saved rev 14.
- Over-limit text (540/280 characters) disables Apply. Missing-context recovery,
  failure/Retry start, default exclusion of pre-existing edits, Escape/reset and
  section-level scope were exercised.
- Final v9 opens the same panel and generates a scoped introduction with correct
  `Apply 1 area to draft` wording. Captured browser error log is empty.
- `node --check` passes for the final Workshop JavaScript. No additional product
  type/UI/release acceptance is implied.

The local simulator uses supplied context and example responses for shorter and
warmer wording; arbitrary instructions are retained in the preview brief, not
processed by a real model. This is design interaction evidence, not content-model
quality or provider acceptance. New provider/command/API/assistant implementation
and its focused tests remain unstarted.

Workshop source is retained in the shared application's Git-ignored
`work/ewatrade/storefront/template-studio/ai-content-v8/` folder and copied into
immutable catalog revisions. This repository's commit contains the review record
only. No product code changed. Brain impact: added the local-only feature record
`.brain/features/storefront-ai-content.md` and an in-progress review pointer;
there is no API, schema, runtime or durable architecture change requiring an ADR.
