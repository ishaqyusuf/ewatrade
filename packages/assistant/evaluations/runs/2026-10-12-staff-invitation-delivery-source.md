# S02 guarded invitation delivery jobs — 12 October 2026

S02 partial/unbookmarked. Roadmap 13/45 accepted (28.9%), 32 awaiting acceptance
(71.1%): 13 partial, 18 pending, 1 deferred A04. Web/dashboard scope only.

## Source behavior

Thin Trigger dispatch and discovery tasks reload encrypted invitation work using
Tenant/notification identifiers only. Periodic discovery joins the existing minute
cadence; no additional declared schedule. Dispatch uses canonical claim/start/finish
queries, the existing QA job provider guard, single-destination test email routing,
existing Resend transport and stable outbox idempotency identity. No email content,
acceptance token, recipient or raw provider exception enters job payload/results.
Queue submission does not mark a command or email delivered.

`STAFF_INVITATION_NOTIFICATIONS_ENABLED` must equal `true` explicitly. Dispatch and
discovery return without DB/queue/provider work when disabled. Before discovery or
claim, configuration must have explicit `EMAIL_DELIVERY_MODE=live`, valid EMAIL_FROM,
RESEND_API_KEY, no EMAIL_CAPTURE_FILE and valid dedicated invitation custody active
key/key ID plus optional bounded retired ring. Incomplete global configuration leaves
outbox pending instead of exhausting three claims. No environment values were added,
changed or printed. Runtime availability is not enabled by this source milestone.

QA routing must select exactly one destination; existing fresh Tenant classification
policy precedes the final authorization fence. Console/capture/empty acceptance
receipts cannot certify SENT. Default transport errors remain OUTCOME_UNKNOWN;
this adapter does not reinterpret HTTP/provider exceptions as definitive rejection.
Only provider acceptance is SENT, never DELIVERED. Expired SENDING is discovered
only for canonical unknown settlement; OUTCOME_UNKNOWN is not automatically retried.
Claims/leases and three-attempt bounds remain owned by the existing query layer.
Trigger task automatic retry is one attempt; partial discovery enqueue failure waits
for all submissions and reports an aggregate safe error for the next cadence recovery.

## Verification

Provider-free focused Bun run: **19 tests pass, 0 fail, 103 assertions**, across
email adapter, schedule handler, existing encrypted dispatcher and cadence tests.
Covers disabled and incomplete configuration (including custody/keyring), QA routing,
provider-policy refusal, stable identity, missing/console/capture receipts, partial
queue failure and existing claim/authorization/unknown/persistence behavior. All
providers, queue submissions and query dependencies are injected test fakes; no
actual email, Trigger run, provider/model request or database mutation.

Scoped TypeScript for all eight owned source/test files passes; eight-file Biome
check passes. No broad or mobile suite. Reused Midday jobs/package/query boundaries,
inspected team invitation job; merchant-specific durable outbox remains canonical.
No UI source or rendered behavior changed; new browser QA was not applicable.
Previous real native receipt source screenshot remains at
`artifacts/assistant-operations-web/s02-invitation-receipt-source-web.jpg` and is
historical source-preview evidence, not new saved/runtime acceptance.

## Remaining acceptance

Actual deployed/controlled queue and email acceptance, trusted matching provider
reconciliation, expired/unknown custody privacy retention/deletion policy, authentic
signed resend/revoke and full saved chat/global receipt acceptance remain open.
Capabilities stay planned. Stable API restart/source activation approval remains
unanswered and was not retried. No schema/migration, credentials, ACTIVE staff,
fixture deletion, process restart, provider/message, mobile, push or deployment.

Brain impact: feature, assistant operations feature, S02/canonical plans, in-progress
and roadmap, internal contract and durable-custody ADR. No public API endpoint or
permission/schema/relationship/migration change required for these internal jobs.
