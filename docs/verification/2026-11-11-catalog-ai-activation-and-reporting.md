# Catalog AI availability and reporting

The unsaved Catalog AI policy enables the existing one-image flow for authorized
merchants. Any saved enable, pause, business override, role or budget still comes
from Oversight. The image transport still needs a server OpenAI credential,
moderation and private storage. The default policy now includes versioned Flare
rates from the [OpenAI model page](https://developers.openai.com/api/docs/models/gpt-image-2.6-flare).
Saved policies retain their explicit controls and published rates. No schema
changes are required.

The Oversight Overview includes a token graph and a Results tab. The separate
`GET /oversight/ai-images/token-usage` read reports 30 UTC days. It counts text
input, image input and output tokens reported on provider attempts, including
failed delivery after provider work. It reports missing usage separately. An
orphan cost receipt can survive business deletion without the job's token data,
and appears as missing usage. The previous delivered-image and cost response
remains compatible.

`GET /oversight/ai-images/library` lists 24 newest retained results per page, with
model, operation, delivery time, recorded token counts and estimated cost. The
image route `GET /oversight/ai-images/library/:id/image` serves thumbnail or
display WebP after fresh approval and retention checks. The library reuses Catalog
storage and verified derivatives. It omits prompt text, source images, merchant
identity and storage URLs. Removed, expired, rejected and deleted outputs fall
out of the library. Oversight checks the active EwaTrade owner permission and
proxies images through its same-origin session. Both library reads require the
distinct server writer key, while aggregate token reporting uses the read key.
Private image responses use `Cache-Control: private, no-store`.

The local profile resolves to enabled, revision zero, 30 lifetime generations
and three default token rates. The local key inventory found moderation and
storage configured, with no dedicated or general generation key. The paid image
run is pending that credential. The development database returned an empty
library and 30 calendar days. Real Postgres checks covered reported tokens from
failed and delivered jobs, unknown usage, cursor selection, removed-image denial,
quota contention and WhatsApp caps. Temporary reporting metadata rolled back.
Focused provider contract, default policy and key separation tests passed.

## Executed checks

- EwaTrade focused policy, provider contract and key separation: 10 tests,
  45 assertions. Development Postgres: 3 tests, 24 assertions.
- Owned-path quick smoke: 285 tests, 1,820 assertions. QA tooling types and
  changed-file Biome passed with no unmapped paths. The shared agent chat was
  outside the 14 owned paths. API typecheck and assistant coverage/impact passed.
- Android used the existing local device assignment and existing QA business.
  API, Metro, reverse mappings and QA capability checks passed. The Maestro
  flow stopped at the Home assertion, before Catalog. Its failed receipt is
  `.scratch/qa-release/smoke-382f397f9c275e714c670b9adbdc3fb9181882e7-local-android.json`.
- Oversight commit `7b120c9`: 13 tests, TypeScript, Biome and read-only local
  integration passed. The local integration used temporary distinct keys.
  Anonymous image fetch was denied. The browser required owner sign-in, and
  the Development library had no results. Signed-in chart and image preview
  checks remain pending.

The OpenAI key form was prepared in Chrome in CIPRON's Default project with
Images Request permission and 30-day expiration for local testing. Creating
and storing the credential is the user's remaining action. Provider generation
and hosted deployment have not occurred.
