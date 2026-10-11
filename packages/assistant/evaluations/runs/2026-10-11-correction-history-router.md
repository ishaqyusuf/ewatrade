# Protected correction history regression — 11 October 2026

Current-source protected assistant.conversation caller passed with two synthetic
completed expense_void/bill_payment_reverse DTOs. This exercises request middleware,
input parsing, conversation reads and proposal DTO projection. Four assertions passed
in8.19s, exit0. No approval tokens returned for completed actions. Exact owned chat
cleanup verified0remaining. No financial commands or model calls were executed.

Retained test: apps/api/src/assistant/general-correction-history.integration.test.ts.
Explicit RUN_GENERAL_CORRECTION_HISTORY=1 plus DATABASE_PROFILE_VERIFIED=1 gate;
queries current_database and refuses anything except ewatrade_qa_v1, then verifies
web bakery owner QA scope. Uses disposable synthetic completed records, not claimed
business effects. Runs with local workspace environment; credentials remain unprinted.

This narrows the remaining browser failure: current router and middleware can read
these saved action types. HTTP transport/serving runtime remains unverified. Do not
mark full web acceptance complete or assert stale runtime as proven cause. No source
access rules altered, no mobile work, no deployment.

## Serving HTTP follow-up

Opt-in RUN_GENERAL_CORRECTION_HTTP=1 sends a real HTTP request to localhost3095,
using the newest existing web QA session token only in memory and x-store-id plus
x-assistant-client headers. No credentials are printed or committed. Initial attempt
selected an older session and returned401; corrected session selection succeeded.

Current API returned200 and two completed correction DTOs. Combined test passed
6assertions in14.68s, exit0; exact owned chat cleanup passed. This exercises the actual
authentication/context/middleware/serialization path for synthetic saved corrections.
It does not yet re-establish the full browser flow on canonical corrected bill fixtures.
No financial mutation or mobile work. HTTP check requires the local API running on3095.
