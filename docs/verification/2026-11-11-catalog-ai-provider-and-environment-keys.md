# Catalog AI provider verification and environment credentials

11 November 2026. Local Development ran one paid generation using the existing
owner-selected My Images Farm test business. The normal Catalog admission and
worker received synthetic mug facts without creating or modifying an item.
OpenAI generation and moderation both returned HTTP 200. The job reached
DELIVERED and retained the private result in the Catalog photo store.

| Measurement | Observed |
| --- | ---: |
| Text input tokens | 133 |
| Image input tokens | 0 |
| Image output tokens | 1,449 |
| Total tokens | 1,582 |
| Estimated provider cost | USD 0.044135 |
| Verified result | 1024 × 1024 WebP |

The model was `gpt-image-2.6-flare`. The cost uses the versioned
[OpenAI published rates](https://developers.openai.com/api/docs/models/gpt-image-2.6-flare).
Job `cmwbtzuq90000bf9ktwwq2m0b` has one known usage receipt. The actual Oversight
30-day endpoint counted that receipt. The writer credential could read the result
metadata and private WebP. The read credential received 401 for the image. The
probe used temporary keys inside the local process. It invoked the real worker
handler directly, leaving hosted dispatch and signed-in Oversight UI acceptance
separate. API was refreshed with the local secret and returned healthy.

The owner selected separate keys for Development, Preview and Production. The
existing 30-day key was renamed **EwaTrade Catalog Images - Development** and
remains in ignored `.env.local`. Two restricted Images Request drafts were
prepared in OpenAI's CIPRON Default project. Preview has a 30-day expiration.
Production has no automatic expiration. The Vercel target is the linked
`ewatrade-api` project. Preview and Production are separate Secret entries for
`CATALOG_IMAGE_OPENAI_API_KEY` and separate ignored server profiles.

Trigger release sync reads the dedicated key from the selected profile and
refuses the Production key in Preview. It also removes any inherited base or
parent generation key. The existing trigger profile suite passed 20 tests with
219 assertions. No credential is committed. Saved environment configuration takes
effect when the corresponding API or worker is deployed with that configuration.
