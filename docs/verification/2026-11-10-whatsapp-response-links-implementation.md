# WhatsApp compact previews and exact saved response links

10 November 2026. Local implementation of the owner-selected Hybrid03 v42,
revision `a8810486-c7b7-454d-9f7b-375f9710d843`, at
[WhatsApp Workshop](https://workshop.localhost/ewatrade/assistant/whatsapp-system).
Selection was recorded before implementation. Source commit: `423d2b06cd0c5d74716c746dbf1029842e651b7b`; final landing-position
fix and acceptance record are in the follow-up commit. Existing main checkout; no worktree,
push, deployment, provider action, OTP, native build or WhatsApp send.

## Implemented source

- Validated catalog/order/customer list families can project the first three saved
  rows into one bounded WhatsApp reply, with scope, original as-of, filters,
  proven-more/end-page copy and **View full response**. Unsupported/mixed/empty
  answers and short prose retain their complete existing rendering. Proposal
  reviews and receipts retain their separate authority and presentation.
- Catalog rows use the canonical reader's name, kind and status. That reader does
  not return a resolved selling price, so this implementation does not fabricate
  the Workshop's illustrative prices. Order previews retain their individual
  status/unpaid qualifications. A bounded page is never presented as a total.
- A trusted `/open/assistant-response/<messageId>` HTTPS locator carries no token
  or answer content. Authenticated `assistant.responseLink` is a read-only POST,
  excluded from model tools and explicitly admitted as a scoped staff read.
  It first locates an actor-owned ACTIVE GENERAL assistant message, then freshly
  resolves original business/Store membership and access without inheriting the
  current tenant context or changing selection. Missing/wrong-account/removed
  access returns generic unavailable metadata; an accessible scope mismatch
  requires an explicit selection before content is read.
- Canonical conversation reads optionally load the exact source response even
  beyond the latest 40 messages. Its question is resolved through the original
  run request identity, never guessed from adjacent messages. At most two source
  messages supplement the recent page; a Recent messages divider marks the gap.
  Existing native/web cards and record/list continuation routes are reused.
  Opening a response does not generate a new answer or execute a business action.
- Web sign-in preserves the local response destination. Native trusted app-link
  parsing, platform association paths, strict login continuation, fresh lookup,
  explicit workspace selection and exact-message focus are implemented. Offline,
  stale identity/cache generation and access failures do not substitute another
  chat. New Android link prefixes require a compatible installed build.
- Response navigation uses private/no-store/no-referrer/noindex headers and client
  log exclusions. Legacy v1–v3 ordinary outbox rows are integrity/provenance
  validated and retained byte-for-byte during recovery; UNKNOWN outcomes are
  not rewritten or requeued by the v4 renderer.

The CTA currently uses the existing WhatsApp text transport: the label plus a
clickable HTTPS URL. It does not introduce an unverified native URL-button send.
The full response is the original bounded saved page. Existing supported See all
and saved-record actions continue through canonical screens; this change does
not silently fetch an entire directory or synthesize a fresh answer on opening.

## Verification and remaining acceptance

Run ID: `2026-11-10-whatsapp-response-links`. Commands run against this checkout:

- Offline QA doctor: pass. Local API/database/dashboard/QA readiness: pass with
  the existing Portless CA (`NODE_EXTRA_CA_CERTS`). The initial no-CA probe failed;
  certificate validation was retained.
- Focused source tests plus H01 coverage test: 69 passed, 369 assertions, 14 files.
  Includes first-three/no-invented-money, trusted links, exact owner/scope lookup,
  access removal, strict native login and build schemes, private logs/headers,
  original historical question, staff read policy and immutable legacy recovery.
- Scoped `test:quick --files <owned paths>`: 285 passed, 1,820 assertions, 56 files;
  10.1 seconds. Unrelated concurrent work was excluded. This is source smoke.
- Biome and whitespace: passed on owned source files.
- API, database, assistant, web and native TypeScript checks: all passed. H01
  coverage snapshot check passed; H02 reviewed impact record passed over the
  complete feature range (`bun assistant:impact --base 423d2b06c^`).
- Initial local web `qa:smoke` attempts failed before acceptance. After the owner
  explicitly approved restarting only the API through `bun run dev --local -f api`,
  local API/database/dashboard/QA readiness passed and the new anonymous response
  lookup returned401 instead of404. No other service was restarted.
- Final existing-data local web `qa:smoke`: **passed**, four checks (QA login/exact
  profile; populated catalog; sale draft item/total; cancel without submitting).
  Receipt: `.scratch/qa-release/smoke-423d2b06cd0c5d74716c746dbf1029842e651b7b-local-web.json`,
 20:40:46–20:41:06UTC. Local `runtimeVerified:false` is expected here; this is not
  deployed-candidate or release acceptance. The source-identical sales/catalog
  smoke remains valid after the two assistant-only landing-position changes.
- Existing browser-driver diagnostic: all35 intercepted-fixture tests passed.
  This validates the driver, separately from the successful app smoke above.
- Actual local browser: signed-out link retained its exact destination through
  QA sign-in. After approved API refresh, an existing saved answer opened in its
  canonical conversation with the exact requested message ID and keyboard focus,
  original cards/as-of and source marker. The visual check found that centering
  a tall answer hid its headline; web `scrollIntoView(block:start)` and native
  `scrollToIndex(viewPosition:0)` now land at its start. The final web screenshot
  confirmed the source marker, headline and first cards visible. Removed-response
  lookup presents the generic unavailable state and safe navigation. No new AI
  request, order/payment submission or business fixture was created.

No signed Android/iPhone universal-link, cold-start/login/offline/scope-switch
acceptance or real WhatsApp display/provider compatibility was established.
No live availability claim follows from source or Workshop status. Quota,
1,000-response enforcement, notifications/email and alternate delivery are outside
this implementation. Human tested-implementation approval and release remain open.

## Documentation and delivery boundary

Brain feature, API/permission, task, ADR and WhatsApp implementation-standard
records are updated locally; `.brain` is ignored and is not force-added to Git.
The owner explicitly ended ChatGPT review Site updates on 10 November. That Site,
its source, deployment, URL and private audience are untouched by this delivery.
Workshop remains canonical; no mirror publication is required or authorized.

H02 scope note: concurrent catalog image/schema and shipment changes exist in this
checkout. They are excluded from this slice, source smoke and commit; this receipt
does not certify that work. No schema/migration change belongs to response links.
