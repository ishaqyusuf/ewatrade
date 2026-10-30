# Store Conversation recovery lifetime — 30 October 2026

Local DP-204/406 follow-up to [T04 / A5 in the interval audit](../plans/2026-10-30-dashboard-polling-audit.md).
Parent: `4dad82786`. Full program remains **3/27 accepted**. No deployment,
shared-service restart, real message, read acknowledgement or connected fixture.
Evidence root: `/tmp/ewatrade-dashboard-program-20261029/`.

## Confirmed causes

`StoreConversationSheetContent` passes an inline message callback to its recovery
hook. The callback was a dependency of `poll`, which was a dependency of the effect
that immediately polls and resets acknowledgement state. Ordinary callback and
mutation renders therefore restarted recovery instead of waiting for its existing
five-second interval. A bounded inert diagnostic reaches 33 reads where one is
expected; its transport stops successful responses after its safety limit. This
is reproduction evidence, not a production request rate or speedup ratio.

The old drain checked Store/conversation only after all pages. A delayed page could
start another read after disable/unmount, and a terminal page could invoke callbacks
and start a read acknowledgement after its owner was gone. Exact old committed
source, copied privately without changing the checkout, reproduces both late
acknowledgements with inert SDK ports. Queued work also needed the application's
cache-generation boundary: a cleared owner could otherwise start another read.

## Change

The existing hook now owns one recovery lifetime per enabled Store/conversation,
cache generation, query client and transport. Current callbacks/messages remain in
a ref; callback or mutation renders do not restart timers, reset acknowledged
sequence or allocate new retry operations. A local applied cursor prevents a
queued focus recovery from rereading the previous page before React commits the
message update. Read-ack retry keeps the same idempotency operation for a sequence.

Every page and every post-await callback/acknowledgement checks the current owner,
cache generation, document visibility and online state. Cleanup/disable/scope
replacement stop old queues. Hidden/offline events cancel only the owner's current
GET. Existing `mountOwnedRead` supplies a private activation key while preserving
the SDK's canonical procedure/input and cancellation signal. Zero stale/GC time
keeps cursor payloads out of a retained background cache. A sibling owner of the
same conversation remains independent.

Already issued acknowledgements are allowed to finish. Cleanup does not cancel
or rewrite a submitted mutation, while a response from an obsolete read cannot
start a new acknowledgement. Active catch-up still drains every advancing cursor
page, bounded at 100 messages per page; this introduces no arbitrary truncation
or global catch-up deadline. Current server-derived membership/Store authority,
monotonic watermark command, inputs and confirmations remain unchanged.

Midday sources inspected: `hooks/use-realtime.ts` stores callbacks in refs and
ties cleanup to subscription identity; `hooks/use-job-status.ts` makes activation
explicit. This adapts lifecycle ownership to EwaTrade's existing cursor recovery;
it adds no Supabase service, socket, infrastructure, TTL or UI redesign.

## Proof and limits

The isolated entry is
`apps/dashboard/src/components/store-conversations/use-store-conversation-realtime.mounted.test.ts`.
Its fixture uses the actual hook, installed tRPC options/client and real QueryClient
and mutation observer. A small React caller deliberately uses the same inline
callback/merge pattern as the real sheet. Transport/data and acknowledgements are
inert; the full sheet/forms are not mounted and no real mutation is performed.

Current focused checks cover:

- Callback/mutation renders keep one immediate read and one acknowledgement;
  only an explicit interval tick adds another read.
- Delayed pages after disable/unmount cannot drain further, notify, merge or
  start an acknowledgement. New scopes begin before the old response finishes.
- All active cursor pages arrive in order; failed acknowledgements reuse their
  operation ID. A previously issued acknowledgement can complete after close.
- Hidden/offline cancellation and fresh resume, one queued focus recovery,
  latest callbacks, applied-cursor progress and independent sibling owners.
- Cache-scope clear suppresses old queued work until a new generation renders.
- Existing shared helper tests retain full drain, nonadvancing-cursor rejection
  and mounted-action batching behavior.

Private red evidence: `conversation-recovery-red.log` (initial lifecycle loop and
late-page failures), `conversation-recovery-late-ack-red.log` (old committed source,
two inert terminal-page acknowledgements after disable/unmount),
`conversation-recovery-cursor-red.log` (queued recovery used cursor0 instead of1),
and `conversation-recovery-cache-clear-red.log` (read2 after cache clear instead
of stopping at1). All old-source copies remain in the marked private scratch area.

Nineteen focused checks / 70 assertions pass: 15 mounted lifecycle cases and four
existing recovery-helper cases. Full Dashboard and explicit fixture/entry types
pass. The existing protected router scope tests initially fail at UNAUTHORIZED
because their old synthetic identity omitted its nested browser Session. Only
that test fixture gains its session record; no production auth change. All six
router tests / 13 assertions then pass, including removed attendant, foreign
Store, actor derivation and cursor/read-watermark scope with inert repositories.
The API fixture graph also typechecks. Owned fast source smoke passes 237 tests /
1,533 assertions plus QA tooling types/Biome; the eight explicit owned paths select
core/domain/web/mobile with no unknown mappings, excluding foreign staged work.
H01 is current under explicit local router mode and an inert DB sentinel.
H02 passes for client, with zero capability/procedure rows changed. Frozen-source
canonical local web smoke passes QA login/exact account, populated Catalog, sale
draft item/total and cancellation without submission. The 00:42:53–00:43:14 UTC
receipt is copied as `conversation-recovery-smoke-passed.json`, with
`runtimeVerified:false`. Current source/helper/lock hashes match throughout;
all four prepared optimized manifest hashes remain unchanged. Existing browser
driver proof is reused because its source/dependencies are unchanged.

The smoke exercises the standard existing-data navigation/draft-
cancel path; it does not create a conversation or acknowledge a real message.
Exact recovery lifetime proof is the inert hook/caller integration above.

The prepared optimized `9eb8a0c8` build remains unchanged and does not include
this or later source slices. No optimized page-time claim follows from request
counts in the diagnostic. Other refusal/budget owners, full domain acceptance and
the 27-ticket performance program remain open.
