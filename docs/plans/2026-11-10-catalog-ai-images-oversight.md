# Catalog AI images and Oversight controls

10 November 2026, Africa/Lagos. Owner requested implementation, with the exact
web/mobile Workshop reviewed and accepted before product UI implementation.
This checkpoint delivers the revised design and backend preparation; generation
is not implemented or live. It supersedes the October proposal's required brief,
source-selection wizard and one/four-output assumption.

## Accepted requirements and pending visual approval

- Generate with AI uses the existing Product or Service name, description and
  allowlisted public visual attributes. No repeated required description.
- An optional additional note appends direction to those facts; it cannot change
  business scope, permissions or authorize tool use.
- Every normally selected/uploaded image exposes AI refine for that image.
  Clicking it starts refinement directly; no second choose-photo step.
- Review three candidate images, explicitly use selected results, and apply via
  the ordinary Catalog save command. Preserve the original and existing images.
- Per-business/Tenant free allowance: initial proposed value 30, configurable as
  lifetime or monthly from Oversight. Each successfully delivered candidate uses
  one unit even if discarded. Failed/undeliverable outputs use no customer unit;
  their actual provider costs still count in operational analytics.
- Lifetime does not renew. Monthly is UTC calendar-month based. Period/limit
  changes preserve immutable delivery history and outstanding reservations.
- Oversight owns active policy controls, pause, overrides, customer pricing,
  versioned provider rates, usage/cost/failure/latency analytics and forecasts.
  EwaTrade owns enforcement, job admission, reservations and settlement.
- WhatsApp's outbound response cap (existing default 1,000/month) remains its
  own canonical policy/ledger. Payment-report notification allowances differ.
- No provider top-up, purchase, hosted setting, deployment or native release is
  authorized by design review. Paid sample generation has not been performed.

## Exact review artifacts

Merchant Workshop keeps `ewatrade/dashboard/web-app/catalog/ai-images`,
direction `02`, now **Inline image actions**, v7:
`d8c42fed-5dd9-4d29-9edb-ed48ff349f94`.

- [Web](https://workshop.localhost/ewatrade/dashboard/web-app/catalog/ai-images/directions/02?rev=d8c42fed-5dd9-4d29-9edb-ed48ff349f94&screen=web.html)
- [Mobile](https://workshop.localhost/ewatrade/dashboard/web-app/catalog/ai-images/directions/02?rev=d8c42fed-5dd9-4d29-9edb-ed48ff349f94&screen=mobile.html)

The complete implemented Catalog item-forms direction01 revision
`6ea1c5cf-b867-41f6-8944-22d1144407bf` supplies the form and current dashboard
tokens. Normal item fields, sections and save interactions remain in the study.
The owner rejected generation v4; it remains immutable history. v5's font-import
parsing defect is corrected in v6. v7 adds reviewed accessibility labels and
preview-state synchronization. Prior directions01/03 are retained. No selection
has been recorded for the generation extension.

Oversight extends its existing implemented
`oversight/plans/payment-notifications`, direction `01`, v5:
`32753a69-fbb8-48a5-bc5f-ba78aab76dc0`.
[Review the AI tab](https://workshop.localhost/oversight/plans/payment-notifications/directions/01?rev=32753a69-fbb8-48a5-bc5f-ba78aab76dc0&screen=index.html).
Full prior payment-notification interactions and selected implemented revision
`c48516ad-f623-4eaa-b814-cf5cf95ab3d9` are preserved; the new AI tab is unselected.

Requested exact Claude Opus5.5/high launch returned `Not logged in`, with zero
API usage and no usable author output. Codex took over under the standing owner
fallback, without another model substitution or further retries.

Preview imagery is the existing licensed stock tote sample, not real generated
output, identity-preservation evidence or a merchant asset. Figtree/Stone/Emerald
come from the existing form. Read-only documenter notes the inherited dashboard
accent versus Catalog override, and bundled 500 face approximating 400 text;
neither changes product tokens or establishes a new design system.

## Cross-project implementation ownership

Owner-requested Oversight chat: `01a1c705-80aa-7950-9e25-f53faf2a40ae`.
Existing Oversight checkout, no worktree or branch change. Its commit `d258518`
adds a candidate policy/read contract and pure forecast utility with focused
9-test/20-assertion, TypeScript and Biome evidence. It adds no endpoint, policy
write, schema or UI. Unrelated source and staged changes were preserved.

Candidate contract lives in Oversight
`.brain/features/ewatrade-ai-usage-controls.md`; it is not a deployed transport.
The main request's current checkout owns EwaTrade implementation. The final
versioned wire schemas and fixed read/control capabilities must be agreed before
cross-project integration. Reuse existing authenticated owner/project checks,
independent read/write keys, optimistic revision and durable audited commands.

Generation remains default-off. Reserve output allowance and bounded provider
cost atomically with the job/outbox. Recheck active Catalog access and fresh
central policy before dispatch. Duplicate clicks/retries reuse a command identity;
unknown provider outcomes stay reserved for reconciliation, not blind replay.
Settle each checked and persisted output once. Keep partial successes and retained
media through app closure, permission changes and background job recovery.
Never trust client tenant IDs, costs, safety approval or arbitrary source URLs.
No long provider call belongs inside a database transaction.

Provider account balance defaults to unavailable. Official OpenAI Costs reads
provide cost information, not proof of prepaid balance. A supported balance
capability and account permission must be established before an automatic balance
adapter is claimed. A manual observation needs account/currency/as-of/provenance.
Forecasts require reconciled liabilities and complete account history, include
failed-attempt costs, and remain labeled estimates. Missing data is not zero.

## Remaining implementation after exact design approval

1. Agree versioned contracts, current model/capabilities, policy defaults and
   privacy/source/fidelity admission. Prices remain unset until approved.
2. Add durable generation/attempt/output/provenance/allowance records and their
   atomic operations, through the repository's ordinary development migration
   workflow. Reuse private Catalog media, not a parallel public object store.
3. Add provider adapter, bounded durable jobs, pause fencing, recoverable
   reservations and per-output settlement, with focused permission/concurrency
   and money checks. No actual provider run is accepted by this checkpoint.
4. Add Oversight typed reads/audited controls and analytics adapters; connect its
   forecast only to known scoped evidence. Integrate the existing WhatsApp cap.
5. Implement the owner-approved exact web/mobile UI in existing components and
   canonical Catalog saves. Record implementation evidence against that revision.
6. Run only focused changed-platform verification once; reuse valid evidence.
   Provider/Preview/Production/native activation remains separately authorized.

No EwaTrade schema/API/auth/permission change occurs in this checkpoint. Brain
impact: feature status, this delivery's plan and in-progress task entry. Tracked
documentation preserves the review contract because `.brain` is Git-ignored.
