# Commerce actual-client acceptance — 26 October 2026

Local Dashboard acceptance is complete for the authorized Product, Order and Service
slices. Source is uncommitted. No deployment, provider configuration, external
message, hosted Site publication or pilot occurred.

The existing local environment wrapper verified the QA database, distinct from
Production. The normal QA login selected the existing Jawdah Poultry QA Owner and
exact active QA Store. Inputs use the synthetic FCA-20261026 marker. No new access,
consent or verification was fabricated. Scope IDs and guarded observations are in
`.brain/qa/evidence/2026-10-26-commerce-client.json`; no credentials or tokens were
exported. The full local report is
`.brain/qa/2026-10-26-commerce-client-save-recovery.md`.

| Actual client journey | Observed saved result |
| --- | --- |
| Eggs | First draft uses visible 30-egg default; editing to 24 preserves raw carton/crate counts and all six independent prices. Same draft survives full reload and saves stock 57,840 Big / 29,040 Small. Stale revision rejects; completed replay returns one product. |
| Phone | Missing price/stock remain blank. One 256GB/16GB configuration; form price completed to NGN 900,000. One saved product, no opening-stock movement. |
| Shirts | Only Colour, Blue 30 / Red 50, NGN 5,000 each; no invented sizes or combinations. One saved product and completed replay. |
| Paid/delivered order | ORD-057: 10 Big Egg crates at NGN 6,000 plus NGN 1,500 delivery; NGN 61,500 paid into explicitly selected Shop cash. One payment and fulfillment, stock Big 57,600 / Small 29,040. |
| Missing Catalog dependency | Both order-only and Catalog options appear. Notebook native form starts with no opening stock; explicitly entering 10 is independent of ordered quantity 2. Same proposal revision 2 saves ORD-058, NGN 600 owed, on-hand 10/reserved 2, no payment or delivery. |
| Partial Service | Card retains two visits with blank price/total. Completing NGN 1,000 per visit, explicitly adding a separate Service and native intake creates ORD-059. Full reload/Open job returns one intake/job, NGN 2,000 owed, no customer/contact/payment/team/date invention. |

The rich Order fault check used the same authenticated QA actor and canonical
transaction path in a focused local harness. A failure immediately before receipt
persistence rolled back the order, payment and stock together and left the proposal
pending. The actual Dashboard retry then succeeded. Two concurrent **completed**
Order retries returned the same receipt; this is not a new pending-command race
claim. Existing membership/claim lock tests cover that unchanged protocol. Service
native write/retry ownership is unchanged; its actual saved-card/open proof and
exact one-intake/job counts are recorded.

Fixes found through the client:

- Put both affected Next client directives before imports.
- Keep Product/Order requests out of unrelated money/simple-sale shortcuts.
- Retain compatible Product action protocol v1 rather than hiding valid saved drafts.
- Collapse harmless counting-unit aliases, retain explicit conflicts and distinct
  one-to-one packs, and keep missing prices unknown.
- Remove the separate Product Review notes section on direct owner instruction;
  defaults, suggested prices and genuine blockers stay visible beside the fields.
- Show the selected variant in order review even when it is the default variant.
- Require exact names for a Catalog handoff; broad candidates are not saved matches,
  and incomplete searches still fail closed.

Focused checks: routing 12 tests/57 assertions; saved history 4/13; final unit/editor/
Product presentation regression group 20/80; order-review choice regression 1/3.
These are named runs, not a sum of unique acceptance scenarios. Scoped source lint
passes; the impact JSON formatting issue was corrected. No blanket model, mobile,
device, viewport or database suite was repeated.

API and Dashboard type checks retain 8 and 7 unrelated errors respectively. The
assistant package check found six new Order test-fixture typing issues; those were
fixed and the focused Order group passes 9 tests/31 assertions. Seven older
channel/stock test diagnostics remain; no changed-file type diagnostic remains. Global
H01 could not regenerate because two concurrently present Banking procedures are
unclassified outside this change. H02 passes with 3 records, 7 capability and 31
procedure rows, but cannot override H01 or establish whole-checkout readiness.
The shared native/assistant price cap remains NGN 1,000,000; a larger phone price was
visibly rejected and the fixture used NGN 900,000. That unrelated money policy was
not changed. Product model preambles still occasionally precede the concise final
reply; none of the accepted journeys asked to confirm ordinary defaults.

Workshop v35 / Hybrid `4ad9367c-3bcb-4ad8-9c68-60205917f823` retains 150 cases,
396 versions and 15 snapshots. Product draft case is V2; existing selections and
all history remain intact. The revised field context was rendered once; unchanged
viewer configuration checks were reused. A matching local private-Site mirror is
prepared without upload. Hosted Site stays at its last known v16/private audience.
Native/WhatsApp/full-case approval, exact release candidate and FCA-28 pilot are
separate from completed Dashboard acceptance.


Closeout gate update: an earlier H02 pass (3 records / 7 capabilities / 31
procedures) was superseded by concurrent schema changes outside this commerce
scope. The final invocation reports “Impact records omit the schema documentation
decision.” Current external Prisma changes are in base.prisma,
commercial-orders.prisma and finance.prisma; this task changed none of them and
ran no migration/push on their behalf. Global H01/H02 and type debt remain release
gates. Commerce source, focused tests and recorded actual-client effects remain
accepted independently; no whole-checkout readiness is claimed.
