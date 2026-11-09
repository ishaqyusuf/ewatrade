# Play provider-territory adjustment — 9 November 2026

Owner-approved draft change: remove Belarus, British Virgin Islands, Gibraltar,
Hong Kong, Macao, Russia, Turks & Caicos Islands and Venezuela from the initial
Android launch. No AI provider was contacted. This applies existing terms without
requesting a custom agreement or zero-retention arrangement.

## Evidence and scope

The [official OpenAI supported-location list](https://developers.openai.com/api/docs/supported-countries)
does not explicitly list those eight. A name-normalized comparison with the
previous 173 available Play markets matched 165, using explicit spelling aliases
and no assumed parent-country coverage for dependencies. This is an eligibility
comparison, not proof of request-location enforcement. The
[standard Services Agreement](https://openai.com/policies/services-agreement/)
restricts offering access outside supported territories. Ukraine is listed with
exceptions not enumerated on that page; separate regional review remains open.

The authenticated Play Production Countries / regions page was changed from
173 to 165 targeted countries, saved to Publishing overview, then fully reloaded.
The exact eight are absent; Rest of World was not selected. Production remains
Inactive. No Send for review or Create release action occurred.

Each existing product's `monthly` base plan was changed through Manage country /
region availability, applied and saved with confirmation, then fully reloaded:

| Product | Available named territories | Exact app-set equality | Nigeria price |
| --- | --- | --- | --- |
| Starter | 165 | Yes | NGN 5,000.00 |
| Growth | 165 | Yes | NGN 15,000.00 |
| Pro | 165 | Yes | NGN 30,000.00 |

All plans remain Draft/inactive, monthly auto-renewing, with five-day grace and
automatic 55-day account hold. No Activate, price-setting or migration action
occurred. Complete post-reload price tables, including both expanded currency
groups, were compared against every prior CSV amount: **174 unchanged prices per
plan, 522 total**. Removing availability retained the stored prices.

The [canonical CSV](../billing/play-regional-prices-2026-11-09.csv) changes only
24 availability flags: eight countries across three plans. It now records **495
available prices** and **27 retained/unavailable prices** (the eight exclusions
plus Central African Republic per plan). No price or product mapping changed.
All three selected-country sets exactly equal the app's 165-country set; count
equality alone was not used as evidence.

## Private receipts

- `/private/tmp/ewatrade-play-app-country-165-2026-11-09.{txt,png}` and
  `ewatrade-play-app-country-targets-165-2026-11-09.json`.
- `/private/tmp/ewatrade-{starter,growth,pro}-availability-165-2026-11-09.{txt,json,png}`.
- `/private/tmp/ewatrade-{starter,growth,pro}-prices-after-165-2026-11-09.txt`.
- `/private/tmp/ewatrade-play-165-country-acceptance-2026-11-09.json` contains
  exact comparisons, unchanged-price counts and source hashes.
- `/private/tmp/ewatrade-openai-play-country-comparison-2026-11-09.json` records
  spelling aliases and the official-source hash. The official list's local
  Markdown SHA256 is `5f774b4c4cbe8e7ee36db570e2c9be19c0d44a35df73716810ec7c6a7c074fa2`.

Browser recovery followed a detached-row index and one command-dispatch timeout;
fresh accessibility state resolved both. No Save was retried without checking
the actual confirmation/readback, and no duplicate product/release was created.

## Remaining acceptance

This closes the exact approved draft territory adjustment only. It does not
establish user-location controls for travel, existing installations, web users or
other channels; the app-country setting is not a substitute for those controls.
Ukraine exceptions, Brazil's applicable age-signal requirements, merchant/terms
confirmations, signed billing/safety/privacy behavior and publication remain open.
The owner-approved 18+ live-AI implementation is a separate source checkpoint.
Android release acceptance remains 1/8; the full 18-ticket objective is preserved.

Validation: exact four-set equality and all 522 price comparisons passed. The
five-owned-path documentation/CSV quick scope passed 51 tests / 254 assertions
plus QA tooling types, with no unknown mappings; nine relative links and
whitespace checks passed. Concurrent root index/owner-action edits were excluded.
Existing offline-doctor evidence was reused; no runtime or native test was implied.
