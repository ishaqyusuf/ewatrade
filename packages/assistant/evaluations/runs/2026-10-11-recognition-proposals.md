# Purchase fact proposal integration — 11 October 2026

Evidence kinds: source/unit and deterministic-integration. No provider/model call.
Fixture: purchase-recognition.v1, bounded PN01/PN03/PN04/PN05/PN06.

The planned dashboard-only Owner/Admin `purchase_recognize` action accepts an exact
Book/agreement and an explicitly confirmed INVOICE or OWNERSHIP fact. Strict inputs
require date/reference and exact invoice minor amount; ownership rejects invoice
amount/due date. Physical receipt, cost edits, client scope/command IDs and settlement
are refused. The server review describes original supplier/Store, exact goods/costs,
prior facts, payable increase, planned control creation and debit/credit journal.
The complete review fingerprint is rechecked before the canonical caller-transaction
command runs. Receipts target the owning agreement, never an event ID.

PASS: 7 contract/manifest tests with 55 assertions and 2 review-display tests with
19 assertions. Affected API/tool and integration-helper TypeScript exit0 after
fixing three test-fixture type errors. Canonical recognition tests/database evidence
remain separately recorded in recognition-review.md.

Initial proposal run `6e8b927d-d9d1-4599-8d8e-793f579d55bb` failed after 26 assertions,
111.84s. The outer cleanup reported P2003 because a Finance Book remained. The new
fixture passed a projected review to the signing helper and used an invalid journal
cleanup relation; both were corrected. Exact failed-run QA ownership/no-posting
checks authorized cleanup; tenant, user, Book and agreement independently count0.
The original error was masked by cleanup and is not claimed as conclusively diagnosed.

PASS: corrected isolated run `166e0055-2997-4e06-a849-248997faa373`, 57 assertions
in 241.55 seconds. Invoice completion failure rolls back event, bill, journal and
control creation, preserving the pending proposal. Concurrent confirmation and
replay recover the same owning-agreement receipt. An ownership draft made before
the invoice is refused after the facts change; a fresh draft succeeds. Exact saved
dates/references and two balanced journals prove invoice 1340/2000 and ownership
1310/1340, each for 1100 minor units, with one payable and no physical receipt or
stock. Changed membership refuses replay. Four independent financial cleanup checks
are clear and outer owned tenant/user cleanup completes. Existing pg deprecation
warning retained. This run includes registration fixture checks, not API transport
or model acceptance.

The full current router coverage generator initially detects five unclassified
endpoints from concurrent uncommitted Order work: paymentAccounts, timeline,
changeOptions, refund and returnItems. Temporary planned classifications permit
generation, but are not included in this commit ahead of their canonical procedures.
The committed coverage snapshot contains this change against committed procedure
scope; current full router reconciliation remains pending. No acceptance is inferred
from that temporary check.

Dashboard editor, full browser confirmation, physical receipt performance, settlement
and live-model acceptance remain open. E05 partial; 13/45 accepted (28.9%). No schema,
mobile, timeout, activation, push or deployment. No UI change or new screenshot yet.
