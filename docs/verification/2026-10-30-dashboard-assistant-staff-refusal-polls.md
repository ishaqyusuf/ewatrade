# Assistant and staff refused-read polling — 30 October 2026

Local DP-201/204/401/403/407 slice. Parent: `e4cf2d11b`.
Full program remains **3/27 accepted**. No deployment or shared-service restart.
Private evidence root: `/tmp/ewatrade-dashboard-program-20261029/`.

## Scope and cause

The existing interval audit identifies seven numeric read intervals in this batch:

| Ledger | Reader / current cadence | Owner |
| --- | --- | --- |
| P18 | Product capabilities, 30s | Product Assistant allowance |
| P19 | Order visibility, 30s only in review mode | Staff/Overview review hook |
| P21 | Voice capabilities, 60s only while active | General Assistant composer |
| P22 | Product capabilities, 30s | Full Assistant product links |
| P23 | General allowance, 30s | Full Assistant allowance link |
| P24 | Pending proposals, 60s only active/available | General Assistant review hook |
| P33 | Pending order changes, 30s | Overview approval queue hook |

Their existing error behavior correctly erased known rejected query payloads, but
fixed numeric intervals still issued another request after FORBIDDEN, UNAUTHORIZED
or NOT_FOUND. The new actual-owner fixture reproduces 15 failures across five
owners and three refusal codes; each observed another request on the next interval.
The existing actual GeneralChat/composer fixture reproduces six corresponding
pending/voice failures. Red logs: `read-refusal-owners-red.log` and
`read-refusal-general-red.log`.

## Change and preserved behavior

Each of the seven sites reuses `readPollInterval(query.state.error, cadence)`.
Known refusals stop interval scheduling. Observers remain enabled under their
existing activation conditions, so focus, explicit retry and mutation invalidation
can still obtain fresh authority and recover. Successful recovery resumes cadence.
Transient, gateway, conflict, other-domain and malformed errors retain the current
interval policy; this does not change global automatic retries.

No freshness/GC window, query key, mount/activation condition, DTO, permission,
API or mutation changes. Staff non-review views still have no interval and retain
their `refetchOnWindowFocus:"always"` policy. Voice gateway availability can still
recover when the gateway returns. Empty approval queues and depleted allowances
do not stop healthy polling. Required financial/approval freshness and all durable
job/link/proof terminal rules remain as before.

Midday reference: inspected `hooks/use-job-status.ts` ties polling to activation
and stops on terminal/error states while exposing recovery. EwaTrade retains its
existing three-code refusal classifier and transient recovery instead of adopting
a blanket error stop, different cadence or global TTL.

## Focused proof

`read-refusal-polls.mounted.test.ts` runs a separate fixture process with actual
AssistantAllowance, AssistantLinks, useOrderVisibility and usePendingChangeApprovals,
installed tRPC options/client and the app QueryClient/observers. SDK transport/data,
unrelated presentation and formatting ports are inert; mutations are rejected by
the test port. It exercises 21 cases:

- Five owners × three refusal classes: private data disappears, interval work
  stops, focus obtains a current result and polling resumes.
- Five transient failures: interval recovery continues and can return to success.
- Staff non-review mode: no interval, fresh focus reads retained.

The existing retained Assistant fixture adds eight cases for the actual pending
review and voice owners, with real GeneralChat/composer/record-reader integration.
All 16 cases in that fixture pass, including its previous hidden retention, draft,
command/run recovery, record access, cancellation and private-refusal coverage.
Its port failures are inert; no model, recorder, message or business command runs.

Both isolated entry tests and the two existing shared classifier tests pass.
The 37 mounted cases exercise actual owners; they do not claim all remaining
Dashboard pollers are correct. The common classifier checks also retain transient,
conflict, other-domain and malformed-error cadence. Timer callbacks are triggered
deterministically or accelerated in the existing source fixture; no page-time or
production request-rate claim follows. Automatic retry is disabled in the new
fixture only to isolate interval behavior; production retry options are untouched.

Full Dashboard and explicit fixture/entry type graphs pass. The new SDK port uses
the current typed application error envelope; production error formatting and
retry behavior are unchanged. Owned fast source smoke passes 237 tests / 1,533
assertions plus QA tooling types/Biome. Its 14 explicit paths select core/web/
domain/mobile with no unknown mappings, excluding foreign staged work. H01 is
current under explicit local mode and an inert DB sentinel; H02 passes for client
with zero capability/procedure rows changed.

Frozen canonical local smoke passes QA login/exact account, populated Catalog,
sale draft item/total and cancellation without submission. The 00:56:20–00:56:40
UTC execution preserves source/helper/lock hashes; copied receipt:
`read-refusal-smoke-passed.json`, with `runtimeVerified:false`. Existing browser
driver proof is reused unchanged; no service restart or deployment. UI smoke uses the existing QA login/Catalog/draft-cancel
journey, not an Assistant submission, permission mutation or approval decision.
Exact refused-read/focus proof remains inert mounted integration.

The prepared optimized `9eb8a0c8` files remain unchanged and exclude this and the
later source slices. Remaining WhatsApp, inbox/queue, attachment and domain/job
owners retain their individual audit obligations. This does not close DP-201/204
or the affected domain tickets.
