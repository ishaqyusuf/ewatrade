# Procedure classification catch-up — 10 November 2026

Status: **source classification repair verified**. No runtime change, rollout or
Apple acceptance is implied.

Root's actual H01 check reported three unclassified merchant procedures. Source
review confirms `catalog.findByCode` is exact tenant-scoped barcode/SKU
identification for explicit New sale selection, while `stores.publicListing` and
`stores.updatePublicListing` are Owner/Admin Store public-listing form operations.
None has a registered assistant tool/command. Exact `form_only` rules now record
those existing boundaries without widening a wildcard, changing permissions or
adding a capability. Router implementations remain untouched.

Only after actual router/manifest validation succeeded did the normal generator
refresh `COVERAGE.md`. Its larger diff also catches up committed shipment source
from `1e6672a17`: four already-declared planned capabilities and ten procedures.
Six shipment procedures map to those capabilities; four keep their existing full
form classification. The source manifest and its WhatsApp source/ahead-of-app
metadata are unchanged. A generated `supported` row means a manifest association,
not live feature acceptance. The impact record names all four capability rows and
all thirteen new procedure rows, retaining the existing planned rollout.

The generated counts change from 800 to 813 procedures (604 to 617 merchant),
179 to 185 merchant procedures mapped to capabilities, 221 to 228 form-only, and
165 to 169 capabilities. These are source-inventory denominators, not Apple or
Finance roadmap progress. Planned/excluded procedure totals and public/internal
audience counts remain unchanged. Apple remains 3/6 accepted.

## Validation

- Actual local-profile H01 regeneration and subsequent `--check` passed.
- Existing coverage/impact tests passed: 19 tests, 39 assertions. No duplicate
  test was added merely to repeat metadata labels; actual router H01 is the
  regression check for the original three omissions.
- Assistant package `typecheck` passed.
- The explicit four-owned-path quick plan has zero unknowns; its final smoke
  passed 285 tests / 1,820 assertions, QA-tooling types and changed-file Biome.
  The initial attempt stopped at JSON array formatting, corrected before the
  successful run. Unrelated mobile shipment WIP is excluded from owned selection.
- Canonical H02 evaluation using only the four owned paths, current HEAD's base
  snapshot and this impact record passed: one capability area, four capability
  changes and thirteen procedure changes, all explicitly named. The normal
  working-tree H02 command also passed at that checkpoint. Neither result
  certifies unrelated mobile feature work or a clean release candidate.
- Generated-diff, record/snapshot agreement, links and whitespace checks passed.
  Prior offline QA doctor evidence from the immediately preceding fixture repair
  is reused for setup only; no runtime/DB readiness is inferred.

No API contract, server authorization, business operation, schema, provider
setting, credential, new model authority or product UI was changed. No database
operation, purchase, build, deployment or activation occurred. UI testing is not
applicable to classification metadata and its generated report.

Brain impact: local `.brain/tasks/apple-billing-workshop-handoff-2026-11-08.md`.
The [Apple ledger](../billing/apple-paid-launch-2026-11-07.md) and its signed/native
acceptance retain their existing bounds. The earlier
[fixture repair](2026-11-10-shipment-review-fixture-types.md) keeps its historical
H01 failure; this new receipt records the follow-through instead of rewriting it.
