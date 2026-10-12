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

## Repair revalidation and remaining display gaps — 12 October 2026

The three failures above describe the earlier source. The coordinator reran
those probes against the reported repairs: ten short-label records now render
ten lines, `10 of 14 shown` is honest, all labels remain; long outcomes produce
991 characters while preserving the count and exclusions; the unknown actor is
shown without the contradictory person-attribution claim. Valid controls pass.
Existing owner repository, schema and compiler results are reused.

Source review verifies `stockOperationType` reaches the common `where` used by
both stock-operation rows and counts, participates in cursor filter identity,
and is refused unless `stream` is `STOCK_OPERATION`. The original exact
adjustment-filter gap is repaired within this source packet.

A versioned diagnostic extends the controls. Run against the current S05
implementation packet in the shared working tree; its formatter/schema exports
are not integrated to main yet. This is not a clean-main/default-suite test:

```sh
EWATRADE_DATABASE_URL='postgresql://probe:probe@127.0.0.1:1/unreachable' \
bun --env-file=/dev/null packages/assistant/evaluations/fixtures/staff-activity-review.fixture.ts
```

Remaining reproduced issues:

1. Ten PRICE_CHANGE records with distinct Product labels within the canonical
   120-character name limit lose **all ten distinguishing suffixes**. Each
   rendered line is clipped in its entirety after reserving notes. It remains
   bounded at 991 characters, but the record label is not always retained as
   the function comment claims. Keep every event individually identifiable and
   reachable through its exact canonical original; shorten a display label only
   with a usable original-object target or detail continuation. A row count and
   identical truncated prefixes do not prove all records can be identified.
2. `coverage.notIncluded` explicitly lists `finance_actions`, but the saved
   answer discloses only sign-ins/attendance/payroll. The tool description
   acknowledges Finance, while the independently rendered card does not. Show
   the finance exclusion until authorized Book-scoped histories exist; do not
   imply the current aggregate covers all required operational activity.

All inputs are synthetic canonical-shaped data; the exported formatter is real.
No connected database, saved chat, model, provider or native acceptance occurred.
The full finance, global per-event original object, privacy/reversal/timezone/
role comparison and performance requirements above remain open. Implementation
repairs stay with the owner. S05 stays partial/planned/unbookmarked, with no
change to the 13/45 accepted web total.

Reviewed formatter SHA-256: `6e0c7bd6247d5f22389c50d20aea8976a56b8a709f719472e5516351d044b493`.
