# Automatic safety processing — 9 November 2026

This bounded source and official-policy review continues Android ticket 04 and
the one shared Apple/Android privacy draft. It does not accept a provider
exception, change safety controls, contact a provider or publish legal terms.
The owner prohibited provider outreach and approved 18+ user-invoked live AI,
preserving eligible 13+ ordinary business tools and history.

## Source and target distinction

The locally committed [adult-generation change](2026-11-09-live-ai-adult-access.md)
(`d13bc50f9`) intentionally leaves automatic moderation unchanged. The earlier
API and worker observations retain their dates and limits; neither a fresh
source read nor that commit proves the current deployed process configuration.

| Source path | Actual request/authority observed | Limit |
| --- | --- | --- |
| `packages/service-commerce/src/store-conversation-text-safety-openai.ts` | HTTPS POST `/v1/moderations`, pinned `omni-moderation-2024-09-26`, raw screened text; redirect refusal, bounded response, generic errors. | No actor age or guardian-consent argument. Text can itself identify a person. |
| `packages/db/src/queries/storefront-orders.ts` | Public order submission screens customer name, optional notes and delivery address before transaction. | No adult/guardian proof in this function; not just chat content. No order was submitted in this review. |
| `packages/db/src/queries/store-conversation-service-intake.ts` | Screens name/details before resolving the guest credential/terms in its transaction. | The downstream guest terms check does not establish pre-dispatch adult/guardian admission. |
| `packages/catalog/src/photo-review-openai.ts` and `photo-review.ts` | Moderation receives normalized WebP bytes as a base64 data URL after digest/processing checks. | Images may contain personal information; supported moderation categories do not establish complete child-safety handling. |
| `packages/service-commerce/src/store-conversation-text-safety.ts` | Production requires explicit live selection, credential and approval-reference presence; missing/unavailable/partial review fails closed. | Approval-reference presence is configuration, not evidence of consent or a bespoke agreement. Keep these safety controls. |
| `apps/api/src/catalog/category-suggestions.ts` | Merchant category suggestions currently use deterministic taxonomy search. | Separate provider factory is referenced by its operator check script, not this route; its compiled presence is not current user generation. |

No customer payload, credential value, model call, storage object or account
record was read or transmitted. Existing unit/transport tests remain their
original source evidence; this documentation review does not repeat them.

## Applicable standard-policy findings

The [OpenAI Services Agreement](https://openai.com/policies/services-agreement/)
requires guardian consent for minors' use and defines end users broadly to include
users of customer applications. It incorporates its standard DPA for personal-data
processing. No automatic-moderation consent exception was identified in the
reviewed agreement. Applying the consent clause to these background-only flows
remains an interpretation question; do not manufacture an exemption or report it
as resolved by the new generative-AI gate.

[Under-18 guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance)
adds safeguards and a zero-retention prerequisite for processing personal data
below 13 or the applicable digital-consent age. A universal account age of 13 is
therefore not itself proof of every location's consent requirements. This is not
a universal demand for a custom provider contract or zero retention for adults.

The [endpoint data-controls table](https://developers.openai.com/api/docs/guides/your-data)
lists `/v1/moderations` as no training, no abuse-monitoring retention and no
application-state retention. This endpoint-specific default differs from
generation. It is not proof of the project's enabled ZDR configuration, edge/log
handling, completed erasure or other providers' retention.

The [moderation documentation](https://developers.openai.com/api/docs/guides/moderation)
supports standalone text/image classification but says known or suspected CSAM
must not be sent to that API. Existing image category flags are not a substitute
for dedicated child-safety safeguards. No source change or test send follows
from this finding.

## Remaining acceptance and product boundary

- Bind each reachable route and exact payload to current API/jobs configuration,
  storage/log handling and the final signed candidate.
- Resolve automatic-screening age/consent handling while preserving the owner's
  13+ ordinary-tools decision. Options requiring product design include verified
  guardian consent or an accepted alternative safety path. Blanket adult gating
  of ordinary writes and removal of fail-closed screening are not authorized.
- Keep the public draft explicit about automatic moderation. Do not claim that
  all minors' content is excluded from providers, or that the live-AI age change
  alone completes privacy, safety or Data safety acceptance.
- The Play app/plans are saved for 165 territories under `97124eaf9`; store
  availability does not enforce user location across web, workers or travel.
  Official supported-location pages still give unspecified Ukraine exceptions;
  no unofficial region list was substituted and no ninth country was removed.

This receipt is source/policy preparation. Tickets 04/10/11/16 and Android 1/8
remain open. Exact complete legal-content approval, publication and release
checks remain separate. Documentation-only validation: explicit three-owned-document plan has no
unsupported mappings; quick smoke passes 51 tests / 254 assertions plus QA
tooling types and changed-file checks. All 18 relative file targets and
whitespace checks pass. Existing application/native/provider checks were reused
within their original scope. Private log:
`/private/tmp/ewatrade-automatic-safety-doc-checks-2026-11-09.log`.
