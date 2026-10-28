# Next.js upgrade — 28 October 2026

Next.js moves from locked **16.3.6** to **16.4.3**, the npm stable release verified
on 28 October 2026. The root catalog and `@ewatrade/tenant-url` peer floor move
from `^16.3.3` to `^16.4.3`; Bun's lockfile updates Next, `@next/env`, and matching
platform SWC packages. Dashboard, Marketing, Storefront, POS, and shared catalog
consumers resolve the upgraded version.

React and React DOM remain at the shared Expo-compatible 19.1.0 catalog; this
satisfies Next's declared React peer range. React Email's internal pinned Next
preview dependency is outside the first-party app upgrade. No application API,
Cache Components adoption, experimental configuration or business behavior changes.

Sources: [registry stable metadata](https://registry.npmjs.org/next/latest),
[Next.js 16.4 release notes](https://nextjs.org/blog/next-16-4), and the installed
`next/dist/docs` upgrading guides.

## Verification

Local macOS arm64, Bun 1.3.9, Node 25.4.0. The checkout contains separately owned
feature edits; results are dependency compatibility evidence, not acceptance of
those features or a clean release candidate.

- Offline QA doctor passes without HTTP/database probes.
- Frozen-lockfile installation with lifecycle scripts disabled passes unchanged.
- Framework, environment package and native compiler resolve the same 16.4.3.
- Owned dependency-path fast checks pass: **182 tests / 917 assertions**, QA tooling
  TypeScript and Biome. All four smoke groups selected, no unmapped paths.
- Assistant coverage/impact regression tests pass: **19 tests / 39 assertions**.
- H01 passes with `APP_ENV=local NODE_ENV=development`; an unset app mode omits
  conditional QA procedures and produces a different snapshot. No snapshot edited.
- H02 evaluation for the three dependency paths passes with no gated changes.
  The whole dirty checkout includes separate client/domain work requiring its
  owners' impact records; that broader gate is not accepted by this receipt.
- All four production Turbopack builds pass, including framework TypeScript,
  page-data collection and prerendering. No type-error bypass was enabled.
- Standalone POS, Storefront, Marketing and tenant-url strict types also pass.
  Marketing standalone types and Marketing/Dashboard builds require
  `NODE_OPTIONS=--max-old-space-size=8192` after the default 4 GiB TypeScript
  heap was exhausted. The sequential build retries pass. Dashboard strict types
  are established by its successful production build; no extra retry was needed.

The existing `middleware` convention remains supported with a deprecation notice.
Turbopack also reports broad file-tracing warnings for the existing private-media
local QA adapter. Neither warning caused the failed default-heap type checks.
No migration or warning suppression was added.

## Coordination and runtime boundary

The three active EwaTrade Codex chats were notified directly before dependency
changes and received the verification scope. Claude received root Agent Chat
message `44a4445b-a303-49de-8a6b-b0841ece04d2`. Unrelated staged and working changes
were preserved; only this dependency slice and its receipt belong to the commit.

Existing shared development processes were not restarted. Their owners must
restart them through the root dev launcher at an agreed boundary before claiming
16.4.3 runtime evidence. This task does not establish browser/native/hosted
acceptance or authorize push, provider changes or deployment. The ignored Brain
receipt records local logs, hashes and task completion separately.
