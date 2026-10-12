# S05 activity packet 1 coordinator review — changes required

The eleven-stream packet is source only, not accepted. The implementation
agent's seven repository cases, three answer cases and schema checks are reused;
the coordinator did not repeat them or run a broad compiler. No connected
database, model, provider, activation or device test occurred.

Three provider-free probes exercise the actual `generalStaffActivityAnswer`:

1. A ten-row page renders six event lines but claims **10 shown**. Labels for
   records 7–10 are absent. `readStaffActivity` requests ten rows and its returned
   cursor advances after row ten; a card-only continuation cannot recover those
   four rows. Preserve complete, reachable page records and report the actual
   displayed count. Do not fix this by silently dropping records or changing the
   full filtered total into a page count. The model receives the full page, which
   does not prove the saved card displays it or that every record is reachable.
2. Long canonical outcomes cause the final `.slice(0, 1000)` to cut an event in
   half and remove both the count explanation and exclusions. Budget whole
   records and reserve space for required scope/coverage notes; retain exact
   totals and honest continuation. The existing length-only test passes while
   this information is absent.
3. A historical unknown-actor event is correctly shown as `Unknown (not
   recorded)`, but the same answer claims **Only actions recorded with a person
   are shown**. Reconcile the coverage copy with the actual historical-gap rule;
   do not omit unknown events or attribute them to a person to satisfy the copy.

Reproduction: `artifacts/assistant-operations-parallel/s05-answer-review-probes.ts`.
Actual output: six lines / `10 shown`, four missing record labels; long detail
length 1000 with both notes absent; unknown event and contradictory claim both
present. The formatter imports the existing schema exports, so the run used an
unreachable placeholder database URL solely for module initialization. No
database connection is made by these pure calls.

Canonical S05 also requires work beyond this first packet:

- Authorized finance histories remain packet 2, with Book scope and finance
  entitlement. Their deliberate temporary exclusion is not completion of S05.
- Each event needs an accessible canonical original record, including returning
  to the same chat. The repository contains IDs, but the generic answer drops
  them and declares no Open target; text labels alone do not prove object links.
- The named stock-adjustment request needs an exact operation-type filter over
  both rows and full counts. `STOCK_OPERATION` currently includes receipts,
  transfers and other operations; the source handoff acknowledges this gap.
- Connected canonical-source comparisons, reversals, actor deletion/privacy,
  unauthorized payroll/security data, timezone and role/scope journeys,
  pagination and native/UI evidence remain acceptance requirements. The fake
  repository tests are useful but do not establish those connected behaviors.
- Measure the bounded multi-stream transaction before enabling; no live
  performance result has been collected.

The implementation agent owns repairs and subsequent packets. The coordinator
owns independent review and acceptance. S05 stays partial, planned and without
an accepted bookmark; 13/45 web acceptance is unchanged.
