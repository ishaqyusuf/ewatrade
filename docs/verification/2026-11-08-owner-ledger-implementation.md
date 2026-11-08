# Native Owner ledger implementation — 8 November 2026

The owner selected **01 · Owner ledger v9**, exact revision
`e33d8ec7-faa5-453c-a84b-f72d9ca5fb00`, and requested implementation.
Selection is recorded in the existing [Workshop](https://workshop.localhost/ewatrade/legacy/mobile-ui-audit/android-2026-08-24/business-subscription/directions/a?rev=e33d8ec7-faa5-453c-a84b-f72d9ca5fb00).
Codex continues the established automatic takeover; no new Opus run is claimed.

## Result and scope

Native Owner subscriptions now follows the selected compact coverage card,
Starter/Growth/Pro offer rows, expandable limits, Restore/Manage hierarchy and legal
links. The current plan card, Usage block and their order in
`subscription-plan-sheet.tsx` are untouched. Native components consume the existing
billing controller and source catalog; no HTML simulator is shipped to the app.

Offers use only current server mappings plus localized store prices and complete
billing disclosures. Missing prices/periods disable affected offers. Verified
coverage is separate from purchase; a paid owner with an uncovered business is
explicitly still Free. Existing enrollment/release commands and confirmation are
retained, including safe routing to the existing business switch when slots are
full. Expanded details reset when account/business changes.

Offline, refresh errors, non-owner roles, legal gates/open failures, provider
conflict and verification failures refuse inappropriate new checkout. Eligible
Restore remains available while new purchase is legally gated. Restore shows
processing; failed policy links can be retried. Pending/deferred/cancelled store
outcomes now have explicit display-only messages, without verification or grants.
No provider, API/schema, permission, subscription policy, live flag or billing
configuration changed. Assistant access remains form-only.

The existing native flow guard had a stale web checkout helper marker after the
independent Paystack adapter work. It now checks `createWebSubscriptionCheckout`
while retaining manager authorization, subscription snapshot and mobile rejection
markers; no backend behavior changed in this task.

## Mapping from design scenarios to native authority

The original 15-group / 53-state map remains archived in v9 `coverage.json` and
[the preview receipt](2026-11-08-owner-subscriptions-workshop.md). Simulator controls
and "Preview only" dialogs are not product UI. Native purchase confirmation is the
real store flow; verification, renewal, grace/expiry/refund, retained quotas and
scope checks use existing provider/server/controller results.

The catalog does not expose the paid owner tier for an **uncovered** business, nor
complete renewal/courtesy deadline or refund reason metadata. The native ledger
therefore says **Verified owner subscription** for that case and displays only
facts actually returned. It does not invent the preview's sample tier, deadlines,
provider results or successful outcomes. Current business entitlement/usage above
remains server-derived. A provider conflict directs management to the original
provider and does not open the wrong native store. No parallel billing is added.

## Verification

- Offline QA doctor passed; owned-path fast-source plan inspected. Focused checks
  exclude unrelated concurrent authors' work and are not whole-checkout acceptance.
- Focused billing fixture/helper suite: 20 outer tests / 50 assertions passed,
  including isolated native and iOS controller, coverage and ledger fixtures.
- Subscription source guard passed after the stale canonical web-helper marker was
  reconciled. No prior failing check was bypassed.
- Actual native ledger JSX is also rendered through isolated DOM primitives and
  mocked billing/auth hooks for visual and interaction comparison with v9. This
  exercises implementation code, not the Workshop simulator. Local screenshots:
  `/private/tmp/native-ledger-implemented-free.png` and
  `/private/tmp/native-ledger-implemented-covered.png`; result:
  `/private/tmp/native-ledger-ui-result.json`. It is component evidence, not a
  signed-device, connected-app, store-purchase or release smoke receipt.
- Mobile TypeScript passed with `NODE_OPTIONS=--max-old-space-size=8192` and
  incremental disabled after the default heap exhausted memory and one callback
  optional-code annotation was corrected.
- Owned-path fast source smoke passed: 284 tests / 1,813 assertions, QA-tooling
  types and Biome. Scope is the 13 owned source/test/impact/receipt paths.
- H01 regenerated under `APP_ENV=local` with no coverage diff; H02 passed with
  one client record and zero capability/procedure changes. An initial generation
  without the local profile omitted QA routes and was rejected by H02; the normal
  local-profile regeneration restored the existing contract without changing it.
- Isolated implementation browser comparison passed 14 checks with zero errors.
  It verifies the selected hierarchy and actual JSX interactions. Current shared
  native theme tokens are used; no preview-specific green values override the
  independent Midnight theme work. The signed-device limitation remains.
- The broader NativeWind style-mix guard fails on an **unchanged** existing Ask
  attachment overlay at `assistant/assistant-chat-box.tsx:299` (`className` plus
  `style`). No ledger component introduces mixed props; this unrelated source is
  outside the approved finalization slice and was preserved. Whole-mobile style
  acceptance remains open. The upper subscription-plan-sheet, SettingsScreen and
  HeroCard source have zero diff. The theme-variable guard passes:24semantic
  tokens and23palette samples.

## Release boundary and Brain

The billing coordinator subsequently requested finalization of this already-started
milestone's checks/commit, followed by a tracked-edit hold. No mobile build,
upload, OTA, provider action, deployment, new purchase or fixture database write is
part of this task. Existing live Apple recovery/acceptance remains with that chat.

Local-only Brain feature `.brain/features/mobile-owner-ledger.md` and QA record
`.brain/qa/2026-11-08-owner-subscriptions-workshop.md` record selection,
implementation/data limitations, assistant exclusion and source acceptance. No
shared billing-runtime status is promoted by these source/UI checks.

Final source checklist: exact selection, native implementation, focused verification
are complete; the local commit and catalog receipt finalize this milestone. Catalog implementation evidence records the commit
and the component-versus-device verification boundary. After commit this chat holds
further tracked changes for billing release coordination.
