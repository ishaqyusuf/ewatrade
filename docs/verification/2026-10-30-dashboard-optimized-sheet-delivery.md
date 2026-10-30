# Optimized sheet delivery, failure and history — 30 October 2026

DP-301/302/303/501 evidence against commit `4a9c267404831095fb17a87554ef6aab7163916e`,
Next16.4.3 build `tBSrVXiC7Tcp2XZnqwaC5`. Current primary checkout; local only.
Program remains 4/27. This is a supplement to the existing canonical smoke and
[Opus follow-ups](2026-10-30-dashboard-opus-performance-followups.md), not a release
receipt or a complete 59-route acceptance claim.

## Measurement boundary

The private browser check imports and executes the existing `webJourney` for QA
login/Catalog/sale draft/Cancel, then uses its authenticated state in memory in a
fresh desktop context. It writes no authentication state to disk. Business writes
are blocked; none attempted in the supplemental journey. Only public static chunk
bodies and fixed labels/module IDs are retained, never API data, actor/record IDs,
request headers or authenticated URLs. One initial attempt failed during the
existing QA journey before fault injection; its precise cause was not established.
The retry passed on the same unchanged product/runtime and completed16:58:53Z.

A compiler-AST index handles nested Turbopack registration arrays, merged module
registrations and async namespace aliases. All41 global import aliases resolve to
their actual compiled module definitions. Merely finding a loader string or seeing
an alias absent is insufficient. Every completed browser script body matches the
frozen local build byte-for-byte. Measurements below are one context's cumulative
completed script response bodies: encoded body sizes from Playwright request sizes,
decoded bytes from responses. They exclude headers, failed bodies and any work
not completed by the snapshot. No latency/p95/production transfer claim.

| Snapshot | Completed scripts | Encoded body bytes | Decoded bytes |
| --- | ---: | ---: | ---: |
| Closed Overview | 36 | 676,115 | 2,247,767 |
| Catalog manual form after code retry | 47 | 1,006,851 | 3,434,343 |

The already-delivered GlobalSheets factory is present on closed Overview. All41
async aliases are absent, and **40/41 actual family definitions** are absent.
Catalog/Finance heavy contents, Setup chat/draft list, Quick Assistant panel and
Overview Order/Stock controller definitions are also absent. The one exception is
BusinessNotificationPreferencesSheet: the always-mounted bell imports its URL hook
from the settings component module. This also delivers the preference body code;
it does not prove that its private read/mutation mounts or runs. Opus is authoring
the bounded hook-boundary correction; no claimed fix or saving yet.

Opening Catalog adds11 completed scripts/330,736 encoded body bytes and delivers
its real content module. Setup chat code shares delivered chunks at this point;
its unopened-on-Overview proof must not be generalized to every manual form path.
There is no pre-change optimized byte comparison in this receipt. The before/open
contrast proves demand delivery, not historical optimization magnitude.

## Actual optimized browser results

- The first Catalog content chunk is deliberately aborted on two attempts. The
  real code failure renders inside the Item frame with its alert, Try again and
  Close available, preserving the usable shell. This is actual browser fault
  evidence for that content seam, beyond the installed-loader fixture.
- Removing the fault and pressing Try again loads the same formerly rejected
  module, replaces recovery with the original manual Add product form, and hides
  Retry. Close works without Save or business submission.
- An existing Catalog item opens its detail. Browser Back removes the detail;
  Forward restores it. Close returns focus to its catalog-row button. The relevant
  production components, parsers, focus target and Next navigation execute.
- No model/send/export/payment/order/stock save or fixture creation is used.
  Browser proof covers these representative seams; it is not failure/focus proof
  for every global family, Quick Assistant or provider entry.

## Runtime restoration and next steps

Only Dashboard was temporarily switched. The optimized process is stopped and root
dev launcher restores listener90463 (session10927). API48226/Storefront46668/
Marketing90981 remain unchanged. SQL-free trusted doctor passes API/Dashboard
liveness; development next-env bytes and frozen product/lock/build evidence match.
No deployment, new dependency or product source change is part of this proof.

Next: remove the measured settings-hook import leak; finish Overview/Quick
Assistant failure owners using their actual existing frames; inspect the provider
entry and remaining heavy tool inventory. Preserve original program criteria.
Private evidence lives under `/tmp/ewatrade-dashboard-program-20261029/`:
`optimized-module-{index,owner-map}`, `optimized-global-family-definitions`,
`optimized-delivery-browser` and `optimized-delivery-restored-doctor` artifacts.
Brain BRAIN, feature, task/QA checkpoints and sheet-delivery ADR are updated locally.
No API/schema/permission documentation changes: this receipt changes no contract.
