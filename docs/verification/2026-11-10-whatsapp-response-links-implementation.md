# WhatsApp compact previews and exact saved response links

10 November 2026. Local implementation of the owner-selected Hybrid03 v42,
revision `a8810486-c7b7-454d-9f7b-375f9710d843`, at
[WhatsApp Workshop](https://workshop.localhost/ewatrade/assistant/whatsapp-system).
Selection was recorded before implementation. Existing main checkout; no worktree,
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
  coverage snapshot check passed; H02 reviewed impact record passed.
- Existing read-only local web `qa:smoke`: failed, zero checks/runtime unverified;
  first sandboxed attempt and one browser-permission retry. No business write or
  fixture was submitted. The existing browser-driver diagnostic passed all 35
  tests against its intercepted fixture; that is driver evidence, not app smoke.
- Actual local browser: signed-out response link retained its exact destination
  through QA sign-in; existing saved assistant chat/cards loaded. New response
  lookup produced the explicit retry state. The running named API returns 404
  for `assistant.responseLink`; read-only process inspection confirmed the
  existing `bun run --hot src/local.ts` stack, while source router/coverage contains
  the procedure. Do not count this as a successful response crossover. The shared
  stack was not killed or restarted. Refreshing that stack and rerunning focused
  local crossover/smoke remain pending.

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
