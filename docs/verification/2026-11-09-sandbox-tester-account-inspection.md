# Apple Sandbox tester account inspection — 9 November 2026

Status: **new tester sign-in and read-only management access verified; original
purchase control and store-account restoration remain unresolved**. Apple stays
3/6; this is not an I05 lifecycle pass.

## Actual observations

The owner could not recover the original tester password and requested a new
tester. The owner created it with a controlled Gmail alias and Nigeria storefront,
entered credentials privately, and completed the displayed email/phone security
steps. Root neither collected nor submitted credentials, phone numbers or codes.
App Store Connect displayed the new named tester row beside the intact original;
its summary count was stale, so the named row is the creation evidence.

On the physical iPhone, Settings > Developer > Sandbox Apple Account displayed
the exact new tester identity. Root opened Manage once and observed Sandbox
Testing account settings: renewal every five minutes, Allow Purchases & Renewals
on, win-back sheet off, interrupted purchases off. These were observations only;
no controls were changed. Root opened Subscriptions once: **[Sandbox] You do not
have any subscriptions.** Management/subscription observations began after the
actual 18:24:11 UTC clock read; the empty list was captured after 18:25:04 UTC.
The subsequent actual clock read was 18:26:27 UTC; no inferred tap timestamp is
used as an exact observation time.
Private mode-0600 screenshots retain the management and empty-list views; they
are not repository artifacts and contain no passwords or verification codes.

## Consequences and next boundary

The new tester's empty list does not prove loss, cancellation or transfer of the
original verified Starter purchase. It provides no control or attribution for
that chain. No new purchase, Restore, history clear, cancellation, billing-failure
toggle, backend receipt verification/database query, deployment or native build
occurred here. The owner was instructed to keep EwaTrade closed; no fresh process
census is claimed.

The setup-only inspection has ended. Root handed the owner the normal Sandbox
sign-out and original Media & Purchases restoration steps, leaving iCloud intact.
**Restoration is pending owner confirmation and must not be reported complete.**
No continuing tester-session hold or reopening of EwaTrade is implied.

The existing [account-setup source review](2026-11-09-controlled-sandbox-lifecycle-account-setup.md)
still applies: a second active chain on the same reviewer owner can complete at
Apple and then fail EwaTrade's active-purchase binding check. Do not buy again.
Controlled lifecycle work needs a separately verified isolated owner/client path;
the installed signed10 client remains fixed to Production. No compatible Preview
native client or new lifecycle case is established by this inspection.

[Apple's TestFlight guidance](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testing-subscriptions-and-in-app-purchases-in-testflight/)
documents Media & Purchases sign-out followed by Developer Sandbox sign-in.
This receipt does not claim Apple documents phone verification as mandatory.

## Validation and Brain impact

Actual phone UI is the evidence for sign-in, management access and the empty list;
source smoke cannot establish those facts. Offline doctor passed without runtime
probes. Focused documentation mapping, local links and diff checks apply only to
this receipt; they do not certify lifecycle behavior or store readiness.
The explicit one-file quick scope passed 51 tests / 254 assertions and QA-tooling
types, with zero unknown paths. Its one local link and evidence-limit assertions
passed. Concurrent Finance/Catalog changes were excluded from this bounded scope.
Brain impact: local `.brain/tasks/apple-billing-workshop-handoff-2026-11-08.md`.
No source, schema, API contract or billing policy changed.
