# Guardian and regional safeguards for automatic screening

Owner direction, 9 November 2026: keep eligible 13+ ordinary screened actions and
add guardian/regional safeguards. This supersedes the proposed adult-only
ordinary-action restriction. User-invoked live AI remains separately 18+; a
guardian grant must never unlock it. Provider outreach is prohibited. This plan
does not approve legal publication, live grants, provider settings or deployment.

## Concrete source findings

`User.ageBand` and `StoreConversationGuestIdentity.ageBand` already distinguish
13–15, 16–17 and adult declarations. Their declarations are single-assignment;
do not silently rewrite them. Free-form Store chat already requires an adult
account. Other ordinary screened Catalog/quote, public order/service and receipt
flows have different authorities; use the
[nine-group inventory](../verification/2026-11-09-automatic-safety-provider-review.md).

There is no current guardian model/API. The historic guardian tables were
explicitly removed in September; restoring their old account-wide rule would be
wrong. `LegalAcceptance` binds one user to an immutable legal version/hash, not
parental responsibility for another person. Storefront customer sessions identify
a separate customer, and do not establish an account age declaration. Public
forms also admit anonymous users. These identities cannot be equated by email.

## Implementation sequence and acceptance

1. **Policy evaluator.** One internal, provider-free evaluator intersects all
   applicable server-resolved jurisdiction rules, exact notice hashes, current
   subject age/eligibility, guardian scope/relationship verification, expiry and
   revocation, and exact provider-control evidence. Test conservative age-band
   boundaries, unknown/missing/retired rules, wrong subject/provider, stale or
   self-issued grants, withdrawal and missing zero-retention evidence. This
   evaluator alone is not an admission boundary or a live guardian feature.
2. **Durable consent commands.** Add dedicated safety-purpose request/grant and
   append-only event storage, with hashed single-use challenge, TTL, bounded
   attempts/rate control and current guardian account/contact authority. Separate
   consent attestation from accepted relationship/age verification. Verification
   methods must be approved by the applicable regional rule; email possession
   alone cannot be labeled proof of parental responsibility. Never store a
   password, raw challenge, identity document or minor's message in the ledger.
   Support denial, withdrawal, expiry and policy/notice changes. Integrate
   account/guest privacy minimization and documented audit retention.
3. **Principal and region adapters.** Resolve Account and device-bound Guest
   through their existing server authority. Add a minimal opaque consent subject
   for anonymous Storefront entry before personal-data form fields, without
   forcing business-account creation or treating Store country as user location.
   Current trusted request location plus applicable declared jurisdiction must
   produce all relevant rules; ambiguous or unsupported geography cannot become
   an allow. Age assurance may supply a reviewed minimum-age attribute without
   retaining birth date. A coarse 13–15 band is treated conservatively at a
   threshold inside that band. No client header or model can supply approval.
4. **Shared provider boundary and queues.** Thread canonical scope through all
   identified text/image callers and repeat fresh consent, eligibility, region
   and provider checks before every dispatch. Preserve fail-closed moderation,
   ordinary read/report/block/recovery authority, current role/Store/plan checks,
   idempotent replays, and zero-call versus uncertain-outcome usage handling.
   Queued work needs a bounded request-location authorization and fresh consent
   read; an old upload or later guardian approval must not silently dispatch
   previously refused personal content. Ask the user to retry/reconfirm the
   affected action after approval. Do not use a stale queued age/grant snapshot.
5. **Human consent UI.** Reuse implemented age/legal/registration controls and
   owning client components. A teen can request consent, see pending/declined/
   expired state, retry after approval and retain drafts/history. A separately
   authenticated guardian reviews the exact subject, purpose, provider, notices,
   rights and withdrawal control. Server/operator verification stays outside
   chat/model input. Unrelated product/account reads remain 13+. Required design
   review starts from the implemented surfaces; no separate demo or redesign.
6. **Regional and operating acceptance.** Bind approved rule and provider-control
   versions to primary-source reviews, actual target configuration, notice hashes,
   responder/verification duties, retention and cleanup. Unknown evidence stays
   pending, not automatically approved. Accept real verification/withdrawal and
   final signed/web/jobs behavior on the same candidate before publication.

No schema has changed in step 1. Schema work must coordinate with the concurrent
Finance migration owner before the required existing `db:migrate`/`db:push`
commands; do not generate a combined migration or manipulate another agent's
changes. Actual privacy-case actions and communications keep their existing
specific authorization boundaries. No new provider or paid verification service
is selected by this plan.

## Regional/provider evidence boundaries

The [EDPB small-business guidance](https://www.edpb.europa.eu/sme/be-compliant/process-personal-data-lawfully_en)
describes varying EU digital-consent thresholds and reasonable checks of parental
responsibility. This is not one universal age table for all launch countries.
Nigeria's [NDPC annual report](https://ndpc.gov.ng/wp-content/uploads/2025/01/NDPC-Annual-Report-2024.pdf)
describes parental/guardian consent when consent is the basis and the Act's
age/consent verification duties in its indexed excerpt; direct PDF retrieval
returned403. This is a reference for follow-up, not an accepted Nigerian rule.
Brazil's
[ANPD guidance](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-divulga-enunciado-sobre-o-tratamento-de-dados-pessoais-de-criancas-e-adolescentes)
requires a case-specific best-interest assessment; do not reduce that to a
universal guardian checkbox.

OpenAI's [under-18 guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance)
adds retention conditions below the applicable digital-consent age. Its
[data-controls table](https://developers.openai.com/api/docs/guides/your-data)
lists no training/abuse-monitoring/application-state retention for moderation;
that endpoint fact is distinct from evidence of an account's ZDR configuration.
Guardian consent alone does not establish either regional compliance or retention
controls. A regional rule must explicitly accept the relevant evidence before
dispatch; no private agreement, exemption or live setting is invented.

## Progress boundary

All six stages remain required; a passing policy unit test is not the guardian
system. Android milestones remain 1/8 and the original 18 tickets retain their
scope. Google declarations, one-person license Save, Publisher API enablement and
Samsung Wi-Fi are separate completed operating checkpoints. Credentials/RTDN,
signed purchase/lifecycle, privacy fulfillment and exact legal publication remain.

### Stage 1 local source checkpoint

Internal `packages/service-commerce/src/safety-processing-policy.ts` now calculates
policy eligibility from typed, current-server evidence. It has no application
caller, package export, database access or provider dispatch; it is not an
HTTP-input validator or an admission permit. The remaining stages must supply
validated canonical readers and fresh every-dispatch checks. Synthetic tests do
not establish real guardianship, an accepted country rule or live retention.

Checks: **17 focused tests / 66 assertions**; full Service Commerce TypeScript;
explicit four-owned-path quick **285 tests / 1,818 assertions** plus QA-tooling
types/Biome; no unsupported mappings. The existing H02 evaluator passes for the
four owned paths (domain only). Coverage rows are unchanged by this internal
helper, so prior H01 evidence is reused for this scope. Concurrent Finance/API/
Catalog/mobile work is excluded; this is not a pass of its global gates.
Relative file targets and whitespace pass. Private logs use
`/private/tmp/ewatrade-guardian-policy-` with suffixes `focused-2026-11-09.log`,
`types-2026-11-09.log`, `quick-2026-11-09.log` and `owned-h02-2026-11-09.log`.

The shared Agent Chat ownership request is `d800e8c2-f772-4f00-9119-b14549762e49`.
No schema change or migrate/push was attempted while the Finance batch is
uncommitted. This is sequencing protection, not approval to drop a requirement
or treat the guardian implementation as complete.
