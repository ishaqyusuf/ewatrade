# Mobile candidate type repairs — 10 November 2026

Status: **four type errors repaired and verified**; no build candidate pinned,
cloud build, upload, install, OTA or deployment performed.

Root reviewed the [dormant Paystack save](2026-11-10-paystack-preview-configuration.md)
at `50a78fc5f`. That commit initially had clean native/shared inputs, with only the
operational chat log modified. During source assessment, native search work
landed in `c1365947a`, followed by shipment stock-choice work in `f2e296168`.
No freeze was acknowledged. Preserve this source drift rather than treating the
first snapshot or compiler run as exact-candidate acceptance.

The normal iOS Preview local-profile checks pass for the selected local origins,
registered project/app/team and store/device profile. Hosted Expo environment
attachment, signing freshness, compiled IAP linkage and actual artifact/runtime
qualification remain unverified. These local checks performed no provider call.

The first attempted package script was absent; root then invoked the installed
TypeScript compiler directly with the existing mobile tsconfig and the documented
16 GB heap ceiling. It reported four actual errors:

1. App configuration omitted the helper's existing `recordPathPrefix` return field
   from its inline declaration.
2. `WorkflowModalScreenProps.closeHref` omitted the already-used shipment modal.
3. The shipment arrival line accumulator inferred `never[]`.
4. The shared shipment draft line accumulator inferred `never[]`.

After the first declaration repair the compiler retained exactly the other three
errors. Their source paths were committed/clean before root claimed the narrow
follow-through. The final changes declare the existing record-prefix field and
close route, derive arrival lines from the existing mutation input, and type the
draft lines with their existing fields. Domain validation, payload construction,
rendering and authorization remain unchanged. All four owned files independently
transpile to byte-identical JavaScript before and after; no cast or suppression
was added to force the declarations through.

## Validation

- Existing draft, onboarding-link and TestFlight profile suites: 16 tests,
  110 assertions passed. No duplicate implementation-mirroring test was added;
  the existing whole-mobile compiler check reproduces the declaration failures.
- Full installed compiler with the existing mobile tsconfig and 16 GB heap
  ceiling exited 0 after all four repairs. It checks the working graph, not a
  previously selected immutable build. The later `ee74dbc2a` changed only two
  acceptance documents, with no additional native/shared source difference.
- The explicit six-owned-path quick plan has zero unknowns. Its run passed
  285 tests / 1,820 assertions, QA-tooling types and changed-file Biome.
- H02 passed with one bounded type-only record, client/domain areas and zero
  capability/procedure row changes. H01 evidence from `e706c8241` is reused after
  confirming router/inventory/manifest/coverage inputs have no later difference.
- Emitted-code equality, links and whitespace checks passed. Prior offline QA
  doctor evidence is reused for setup only. UI testing is not applicable to
  erased annotations whose emitted product JavaScript is unchanged.

The earlier [classification repair](2026-11-10-procedure-classification-repair.md)
and [Apple ledger](../billing/apple-paid-launch-2026-11-07.md) retain their own
bounds. Apple remains 3/6 (50%) accepted. These source checks do not enable paid
Preview/Production billing, accept new shipment behavior, prove the required IAP
bridge in a signed artifact or install a replacement for signed10.

Brain impact: local `.brain/tasks/apple-billing-workshop-handoff-2026-11-08.md`.
No schema or external API contract changes; existing runtime contracts and policy
remain authoritative.
