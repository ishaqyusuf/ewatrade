# API provider configuration evidence — 8 November 2026

Read-only evidence for the shared mobile disclosure packet. This is neither a
new legal draft nor deployed-process/provider-call acceptance. No configuration,
model request, customer-data read or telemetry setup was performed. No provider
credential value was retrieved.

## Bounded reads

- At 14:59:12 UTC, the explicitly selected Production database had no
  `SystemConfiguration` row for `assistant.runtime`. A read-only transaction
  selected only provider/model/enabled/revision fields for that exact key.
- At 15:02:08 UTC, the linked `ewatrade-api` Production project and complete paginated
  shared environment inventory had no assistant text-provider/model overrides,
  transcription/vision model overrides or rehearsal selector entries.
- The single enumerated non-secret `STORE_CONVERSATION_TEXT_SAFETY_PROVIDER`
  value was read through Vercel's individual-variable endpoint and equals
  `openai-moderation`. No sensitive billing setting was decrypted.
- Credential checks used names/types/targets only. Dedicated DeepSeek assistant
  credential metadata exists. Dedicated/shared assistant OpenAI and xAI credential
  names and the voice gateway secret name are absent. The dedicated moderation
  credential and approval-reference metadata exist. Catalog photo review's
  dedicated credential name is absent.
- API Sentry DSN/release and Logly collector/project names are absent from that
  project and its linked shared inventory. This says nothing about separate
  mobile, dashboard, marketing, jobs or chat deployments.

## Source interpretation and limits

The assistant resolver checks persisted configuration, then environment, then
the source default DeepSeek model `deepseek-flash`. The inspected configuration
has neither override. Credential presence does not establish valid authentication,
available credit, enabled routes, a successful model call or a deployed-process
readback. No model request was sent to test those conditions.

OpenAI conversation moderation uses its dedicated configuration/key. It must be
distinguished from the separate assistant media adapter and transcription fallback
chain. Source contains OpenAI media and xAI transcription adapters, but their
source presence does not prove active selection or transmission. The dynamic
voice gateway lease was not inspected here, and no gateway health request was
made. Do not make app-wide no-media/no-AI/no-analytics claims from API metadata.

The retained accepted Production API deployment remains Ready at
`dpl_7A7vegqRxaiUVanBUsw9RPNcLmHg`, source `dafec2e01`. Current project settings
are not a snapshot of that process's effective environment. Bind final disclosure
acceptance to the final Ready release, applicable stored selections, signed client
and actual supported paths before publishing the consolidated legal snapshot.

Private receipts: `/private/tmp/ewatrade-apple-provider-selection-2026-11-08.json`,
`/private/tmp/ewatrade-apple-provider-metadata-2026-11-08.json` and
`/private/tmp/ewatrade-apple-rollback-retained-2026-11-08.json`. Scripts and receipts
contain no provider credential values. No new public readiness milestone closes.

Validation: exact project/Production scoping, complete linked shared pagination,
bounded read-only database transaction, enumerated selector validation and scoped
documentation review. No runtime source changed, so no source/UI tests repeated.
Brain: `.brain/features/mobile-production-release.md` records this evidence and
its limits. Apple remains 2/6 accepted milestones.
