# Catalog AI in Development QA workspaces

11 November 2026. The owner requested that Oversight control image generation
for QA businesses. The Development API accepts generation and refinement for
QA businesses with Catalog photo storage. Existing Oversight enablement, pause,
roles, allowances and spending limits apply before admission and dispatch.

QA output uses the shared local private photo store. The Catalog review worker
can submit QA output to OpenAI moderation after claiming a pending asset tied
to an exact scoped generation job. Recovery can resume review of that same
output. Ordinary QA photo uploads still use the existing fixture review path.
Hosted QA photo storage is currently unavailable. There is no new feature flag.

The owner tapped Generate with AI on the connected Galaxy S24 Ultra in
**Jawdah Poultry QA → Broiler chicken → Images**. The Development API queued
job `cmwbvey5x0000sb9k70wyijjg` and the local Trigger worker
`20261111.5` completed run `run_06gsjhdkampvn4ljf2hbdnqka2` in 40.9
seconds. The approved image rendered in the list and the allowance went from
30 to 29. OpenAI reported 103 text input tokens and 1,449 output tokens.
Estimated generation cost was USD 0.043985.

The actual Oversight routes ran in process against Development with temporary
credentials. The authorized library listed the job and served its WebP
thumbnail. The read credential received 401 for the image. The token endpoint
counted all three reported Development requests, and business search returned
Jawdah Poultry QA for configuration. No hosted deployment was made.

Focused QA, allowance, Oversight and policy checks passed 15 tests. The
existing reporting integration, generation transport and API input suites
also passed. Scoped source smoke passed 285 tests, the Jobs type check
passed, and both assistant coverage and impact gates passed.
