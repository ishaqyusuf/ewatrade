# Assistant behaviour events (Logly)

Source implementation 12 November 2026 (Phase 3 of Oversight assistant analytics).
Behaviour only: billing-grade runs, tokens and outbound messages come from the
EwaTrade ledger through `apps/oversight-api`, never from these events.

## Where it lives

- Contract: `packages/events/src/assistant-envelope.ts` (names, properties, flag).
- Emitter + collection gate: `packages/events/src/server-assistant.ts`.
- Recorder (persist-only, upsert by event id): `packages/jobs/src/assistant-events.ts`.
  Delivery reuses `ProductAnalyticsEvent` + the existing 15-minute
  `analytics.dashboard.recovery` sweep and `deliverDashboardOutcome`. No new
  Trigger.dev runs per event.
- API hooks: `apps/api/src/assistant/analytics.ts`
  - turns: `general-turn.ts` (general assistant: web, mobile, WhatsApp, Telegram)
    and `workflow-turn.ts` via the setup chat route observer (web/mobile setup).
  - proposed: `draftGeneralProposal` (post-commit).
  - decisions, review link, channel links: one call in the tRPC
    `captureDashboardOutcome` middleware (`apps/api/src/trpc/init.ts`), after the
    procedure and its transaction settle.
- Clients: Dashboard sends `x-ewatrade-client: web` + `x-ewatrade-analytics` on
  tRPC, general chat and setup chat (`apps/dashboard/src/lib/assistant-analytics-headers.ts`).
  Mobile sends `x-ewatrade-client: mobile` + `x-ewatrade-analytics` from the
  live AnalyticsRuntime permission (`apps/mobile/src/lib/analytics-collection.ts`).

## Gates (all must pass)

1. `LOGLY_ASSISTANT_EVENTS_ENABLED=true` (server-only, default off) **and**
   `NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED=true`; plus `LOGLY_IDENTITY_SECRET`.
   Queued assistant events are dropped, not sent, if the flag is later turned off.
2. Not a QA principal (QA session, QA workspace, mapped QA email); rechecked
   again at delivery.
3. Channel consent basis:
   - `web`: `x-ewatrade-client` is `web` or missing, exact Dashboard Origin and
     `x-ewatrade-analytics: allowed` (browser policy, DNT/GPC, signed context).
   - `mobile`: `x-ewatrade-client: mobile` and `x-ewatrade-analytics: allowed`,
     which the app sends only while its own analytics runtime may collect
     (Production Android analytics is currently disabled for the 13–17 age gate,
     so mobile emits nothing there until that changes).
   - `whatsapp`, `telegram`: **fail closed**. No durable per-user analytics
     consent exists server-side for webhook turns. Needs an owner decision.
   `x-ewatrade-client` is analytics-only and never used for authorization.
   Unknown values drop the event.

## Event catalogue

Project `ewatrade-dashboard`, `source: server`, `version: 1`. Every event has
`actorId` (HMAC `usr_…`), optional `groups.business` (HMAC `grp_…` + name) and:

| Property | Values |
|---|---|
| `surface` | `assistant` |
| `category` | `turn` · `action` · `review_link` · `channel_link` |
| `status` | from the name (see below) |
| `success` | false for failed/blocked/expired, else true |
| `channel` | `server` (event transport; unchanged meaning) |
| `assistant_channel` | `whatsapp` · `telegram` · `mobile` · `web` (where the event happened) |
| `audience` | `internal` · `business` |
| `workspace_role` | membership role, when a workspace is active |
| `environment` | `local` · `dev` · `preview` · `production` (from `APP_ENV`) |

| Event | Extra properties | Emitted when | Dedupe key |
|---|---|---|---|
| `assistant_turn_completed` | `input_kind`, `step_count`, `provider`, `model`, `duration_ms` | LLM run saved COMPLETED | run id |
| `assistant_turn_failed` | same + `error_code` (`STREAM_FAILED`, `ABORTED`) | LLM run saved FAILED | run id |
| `assistant_turn_blocked` | `block_reason` (`quota`), `input_kind`, `provider`, `model`, `error_code` `BUDGET_EXHAUSTED` | allowance refused the run | run id |
| `assistant_action_proposed` | `action` | draft proposal committed | proposal id + revision |
| `assistant_action_confirmed` | `action`, `handoff_from`? | confirm succeeded | proposal id + revision |
| `assistant_action_executed` | `action`, `handoff_from`? | proposal COMPLETED (with confirmed) | proposal id + revision |
| `assistant_action_cancelled` | `action`, `handoff_from`? | cancel decision | proposal id + revision |
| `assistant_action_expired` | `action` | confirm refused on a lapsed draft, or decision returns EXPIRED | proposal id + revision |
| `assistant_action_failed` | `action`, `error_code` (tRPC code) | confirm refused otherwise | proposal id + revision |
| `assistant_review_link_opened` | `action`, `handoff_from` (`whatsapp`) | WhatsApp web-review link resolved `ready` | proposal id + revision |
| `assistant_channel_link_started` | `link_channel` | WhatsApp/Telegram link created in the app | link id |
| `assistant_channel_link_completed` | `link_channel` | link confirmed in the app | link id |
| `assistant_channel_link_revoked` | `link_channel` | grant revoked (`revoked: true`) | grant id |

`input_kind`: `text` · `voice` (any audio) · `image` · `document` (pdf/sheet/text
file), from attachment kinds only. `action` is the general-assistant action key
(e.g. `sale_record`, `order_create`); anything outside `^[a-z][a-z0-9_]*$` is
dropped. `block_reason` also allows `policy` and `unbound` in the contract but
nothing emits them yet (pre-run policy refusals have no run; unbound senders have
no actor and are webhook-only).

Event id: keyed HMAC of `[assistant-event-v1, source key, event name]`, formatted
as a UUID v5 layout, so webhook/client retries and repeated decisions dedupe
(the queue upserts by id). Keys are never sent.

Never collected: message text, attachment content/names, phone numbers, Telegram
ids/usernames, emails, raw user/tenant/run/proposal/link ids, amounts, payloads.

## Known gaps / overlaps

- Web `assistant.decideProposal` also still emits the existing
  `dashboard_assistant_<action>_<phase>` events; Oversight should count assistant
  decisions from the `assistant_action_*` names only.
- WhatsApp/Telegram inline confirmations (`channel-action-turn`, `telegram-runtime`)
  and deterministic channel drafts (`channel-flow-turn`) are not wired; they would
  fail closed today. Telegram's "Review in EwaTrade" opens the dashboard draft
  directly, so it has no `review_link_opened` event.
- Phase 5 reconciliation: turn events cover general and setup LLM runs; WhatsApp
  setup-purpose workflow turns (`channel-workflow-turn`) pass no observer.
- Not verified against a live collector, real database queue or device.
