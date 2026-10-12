# GENERAL saved proposal history compatibility

12 October 2026. Source recovery milestone; live HTTP/browser recovery remains
unverified. Full roadmap13/45 accepted28.9%;32 awaiting71.1%
(12partial19pending1deferredA04). No new parent acceptance or mobile work.
Provider/model: not-applicable. Evidence: deterministic-integration/manual-web.

## Diagnosis and change

Stable owned API log records assistant.conversation INTERNAL_SERVER_ERROR and
new retailOps.staffHistoryPage NOT_FOUND. Its recorded startup precedes the direct
purchase action source commit. Exact owned QA chat has three proposals whose
payloads/receipts validate in current source. A runtime/source compatibility
mismatch is plausible, not a proven exception cause: the stable API logs expose
only public error codes. No API restart or source visibility change was performed.

The existing conversation path strictly parsed every historical payload before
filtering it. A future/retired/malformed action or unsupported receipt can therefore
abort the entire read. New projectGeneralProposalHistory validates payload/action
identity/capability version/client compatibility/receipt before app projection.
Incompatible rows return only safe id, saved status and reason in
unavailableProposals; no payload, receipt, approval credentials or execution/editor
controls. Supported rows retain normal review/projection and order. Legitimate
errors from valid projection still propagate; no broad auth/DB error swallowing.
Native conversation read remains under the existing exact actor/Tenant/Store scope;
no permission, command, confirmation, capability rollout or write boundary changed.

Dashboard renders read-only Saved action unavailable notices alongside valid
history. The generic loading error no longer asserts a Store mismatch for every
server failure. Existing snapshot clients can ignore the additive response field;
no mobile implementation or testing. Stateless notice component follows existing
Midday chat message/card composition and project UI tokens. No forms, mutation,
modal, table or route rebuild is needed.

## Verification

Three focused tests11 assertions pass: mixed valid/future history retains valid
order, strips private payload/approval material from notices; mismatched action/
version, incompatible client and invalid receipt never reach app approval projection;
valid auth/DB projection failures still reject. Owned helper/test/native router/
notice/chat/diagnostic scoped types pass. No broad/repeated suites.

Read-only exact ewatrade_qa_v1 diagnostic first failed in the sandbox before a DB
read, then guarded network metadata check found three valid current-source rows.
Full protected native read initially failed on a diagnostic-only budget SELECT
using nonexistent id/tenantId fields; corrected it to canonical scopeKey before
rerunning. Corrected run exited0 in8.435s: one saved message, three proposals,
zero unavailable notices and a valid generalSnapshotSchema. Saved conversation,
messages, proposals, runs and monthly budget full JSON hashes match before/after.
Diagnostic refuses expired-run recovery. No proposal decision, provider/model call,
capability activation or financial action. Local sanitized report:
artifacts/assistant-operations-web/chat-load-proposal-diagnostic.json.

Actual desktop browser component preview under exact QA Owner guard shows pending,
expired and completed synthetic compatibility notices, original static surrounding
text and zero Edit/Confirm buttons. This is presentation evidence, not saved chat
recovery. Screenshot chat-history-compatibility-web.jpg retained in
artifacts/assistant-operations-web; owned tab57 and temporary route removed.
Retained preview source chat-history-compatibility-preview.tsx is not shipping.

## Remaining

Stable API/current source HTTP alignment and actual saved chat reload/message/
receipt recovery remain open. No live failure cause is claimed beyond observed
public codes. S01 history sheet runtime/saved acceptance remains pending. E05's
bundled local activation/restart approval remains unanswered; the prior rejected
activation/restart was not retried. Full45-ticket goal remains active.
