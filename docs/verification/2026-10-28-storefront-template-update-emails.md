# Storefront template update emails — 28 October 2026

Implementation is local source only. No emails, production configuration, publication or deployment were executed.

## Behavior

- Short, exact-version customer notes reuse the approved Warm Desk email design, with escaped HTML and plain text.
- The **Upgrade template** button opens an authenticated review for the business named in the email. It grants no access and changes no draft/live page. Existing Studio upgrade, CAS save, preview and explicit publish remain authoritative.
- Current verified active Owners/Admins of active LIVE businesses qualify only when their primary published storefront uses a named older version of the same template. Current business/subscription/personal denial, inactive access and already-upgraded/switched storefronts suppress dispatch.
- One canonical system activity plus a dedicated existing outbox consumer provides per-business/member/version deduplication. Discovery, preferences and dispatch intent share scoped locks. Provider idempotency is stable; preparation retries are bounded to three attempts. Network-started ambiguous outcomes stop automatic retries. “Accepted” means provider acceptance, not mailbox delivery.
- Existing hourly cadence discovers at most25 recipients per template per run and dispatches at most25 queued notices. No new cron or database migration. Personal notice preferences are managed on the authenticated review page.

## Verification

- Offline doctor passed; existing shared stack reused.
- Scoped source smoke: **225 tests / 1,224 assertions**, tooling types and changed-file Biome pass. Explicit owned paths were used to preserve concurrent work; this is not whole-checkout/release acceptance. Four new offline suites are included in the reviewed fast mapping.
- Strict TypeScript graph covering owned Dashboard route/action/component, DB queries/tests, jobs handler/cadence/adapter, email, notification and template changes passes with normal imports and no source overlays. QA tooling uses its existing separate fast-check configuration.
- Existing business-event registry and cadence tests pass with an unusable loopback DB sentinel. DB tests use offline boundary doubles; no SQL concurrency or provider-delivery claim.
- H01 coverage is current; H02 passes with no new assistant capability/procedure. Upgrade/publish and personal preference stay form-only.
- Actual IAB existing-data review displays the correct QA business, plain-language benefits, already-current state, unchanged-live explanation, Studio entry and personal preference control. Foreign-business read returns404. Anonymous request redirects to login preserving the exact path and receives private/no-store, no-referrer and noindex headers. No preference/business/draft/publication action was submitted.
- Initial canonical UI smoke could not launch Chromium under the macOS sandbox. The normal approval mechanism allowed the existing read-only command outside it. A following run completed its journey but concurrent source changes invalidated the receipt; failed/stale receipts are not accepted. Final stable-source smoke is recorded in local Brain acceptance separately.

## Activation

After compatible Dashboard/jobs/template runtime deployment and the existing exact-candidate release checks, an operator may mark the exact registered, qualified, active template version `live` and enable `STOREFRONT_TEMPLATE_UPDATE_EMAILS_ENABLED=true`. Production APP_ENV and NODE_ENV, no conflicting non-production profile/Preview marker, live Resend configuration, valid sender, no capture and a trusted HTTPS Dashboard origin are required. Add exact-version notes and a named migration path for each future update.

Current registry versions remain `not-live` and the new flag defaults off. Real provider acceptance, mailbox deliverability and deployed release verification are not inferred from these local tests. Unknown outcomes require provider reconciliation before any future manual recovery; this change adds no replay/reset command. No push/deployment is authorized by QA success.
