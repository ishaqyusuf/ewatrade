# GENERAL quotation provider-preflight integration audit

Date: 2026-10-15. Read-only source audit; proposed seams below are not implemented or activated by this packet. No connected database, provider, HTTP, device, hosted CI or runtime check was performed. Existing acceptance and rollout/approval gates remain unchanged.

## Current confirmation entrypoints

1. `apps/api/src/trpc/routers/assistant.ts:170–183`: protected strict `decideProposal` calls `decideGeneralProposal`. The caller supplies only proposal ID, positive revision, decision and optional approval token, not an action, scope or provider-preflight artifact.
2. `apps/api/src/assistant/general-simple-expense-chat.ts:108–114`, `general-simple-money-in-chat.ts:96–102`, and `general-simple-transfer-chat.ts:95–101`: browser conversational confirmation calls the same wrapper. Each explicitly declines linked identities before doing so.
3. `apps/api/src/assistant/channel-action-turn.ts:64–153`: WhatsApp ACTION processing directly calls `decideGeneralProposalInTransaction`, through `defaultChannelActionDependencies().decide`. It does not call the outer browser wrapper. A wrapper-only preflight implementation therefore leaves this production path uncovered.
4. Other repository callers of these decision functions found during this audit are tests, fixtures, integration checks and verifiers. `channel-turn.ts` dispatches ACTION work to `processAssistantWhatsAppAction`; it supplies no alternate business-command execution path.

## Current shared fences, including terminal paths

`general-proposals.ts:88–159` owns a fresh Serializable transaction through `runInOwnSerializableTransaction`. It obtains linked identity/grant/inbox locks before Membership/Store locks, then checks the current browser Session or durable linked identity, active workspace, age, account privacy, legal session, QA scope and unchanged actor/Tenant/Store. `own-transaction.ts:51–65` retries only rolled-back serialization conflicts, at most three attempts, with new transaction options and fresh callback reads.

`general-proposals.ts:271–372` then:

1. Loads the exact proposal by current actor/Tenant/Store and, for linked identities, current conversation.
2. Parses strict canonical payload, checks current action authority and exact proposal revision.
3. Returns COMPLETED confirmation receipts without executing again; invokes optional `authorizeRecovery` first. CANCELLED cancellation replay returns its saved state. These paths intentionally do not require a currently enabled rollout or a new signature/provider call.
4. Refuses other non-PENDING states. New confirmation checks current rollout; cancellation closes a PENDING draft by revision/status CAS and requires no provider or approval token.
5. Before new effects, checks action version 1, saved action vs parsed payload, canonical payload digest and valid approval token/hash/expiry. `proposal-security.ts` HMAC binds proposal ID/revision/payload hash/actor/Tenant/Store/expiry.
6. Runs optional adapter `prepareExecution` **inside** this transaction (`:334–343`), compares its target to saved target identity/revision, claims unexpired PENDING→EXECUTING, executes the transaction-local prepared command and saves COMPLETED receipt atomically.

Any new hook must retain this order in final confirmation. An outside result cannot replace authority, signature, fresh review, target comparison or proposal claim. Do not make terminal recovery depend on screening/provider availability or restore rollout for recovery.

## Current channel fences

`channel-action-turn.ts:64–101` checks the branded linked principal and exact inbox lease owner/generation before transaction entry. Inside, it rereads lease, ACTION kind/binding, current linked conversation/authority digest, ingress schema and channel write policy.

Only an enabled, well-formed, non-refusal branch calls `consumeAssistantWhatsAppActionReviewInTransaction` (`:107–114`). That canonical helper (`assistant-whatsapp/action-reviews.ts:295–473`) verifies:

- Current identity, grant and selection generations and GENERAL conversation.
- Exact decision-domain digest and review/proposal locks.
- Current ACTION ingress, unexpired ingress state, exact reply-to provider message ID and decision content.
- Review outbox actually SENT/DELIVERED/READ with an ACCEPTED delivery attempt for that exact provider message; provider occurrence time follows sent time; original rendered content and digest remain exact.
- Pending proof expiry both now and at provider occurrence, current signing-key/version, exact proposal revision/payload/target and current channel authority digest.

It then changes PENDING→CONSUMED. This write must stay in the **final** owning transaction with the business effect. Already-consumed proofs return result references; `channel-action-turn.ts:126–140` accepts only the same terminal receipt/status/decision. Pending effects are never recovered this way.

The same transaction completes the review result reference, creates the safe result outbox and completes the ingress (`:154–221`). Known rolled-back business refusals can attempt a new fixed refusal transaction (`:224–242`). Malformed/disabled/refusal paths do not consume a proof or execute a proposal. A foreign lease starts no transaction.

There is currently no exported non-consuming inspection counterpart to the canonical consume helper. `resolveAssistantWhatsAppConversation` alone is insufficient: it does not prove the reply-to delivery, exact ingress, decision-domain proof, current signing key or saved review/proposal binding.

## Provider locations and reuse limits

The existing adapter `prepare` hook is not an outside-provider hook: `prepareDraft` at `general-proposals.ts:162–167` runs inside the draft/edit fresh transaction. Likewise, `generalProposalWithReview` at `:459–532` invokes adapter reviews during history reads. Keep draft preparation and review pure; do not call provider screening there or make a saved receipt/history read depend on the provider.

- The canonical new-version issuer preparation is `prepareCommerceQuoteIssue` in `commerce-quotes.ts:1621`. It screens normalized customer prose outside its own writer transaction and retains a private exact-text proof. `issuePreparedCommerceQuoteInTransaction` uses that proof for new and ISSUED-replay linked releases. It must receive a prepared value bound to the reviewed command, not arbitrary wider native callbacks.
- Existing GENERAL quote **approval** is different. `general-quote-decision.ts:prepareExecution` obtains the pure review, whose `execute` in `commerce-quote-decision-review.ts:193–200` calls the ordinary approval command. `commerce-quotes.ts:2373` screens saved option text in that transaction, and approval-linked release calls at `:2602`/`:2659` do not supply the issuer's exact-text proof. Adding an issue/revise adapter does not remove approval moderation from its transaction.
- Do not silently alter existing approval semantics under a new issue/revise claim. Approval needs its own saved-version preflight/proof integration and independent review if it is included in the scope. Reject requires no release-text screening.

## Minimal proposed composition

These are suggested names, not new public request fields or implemented exports.

1. Factor the common proposal load/parse/current-authority/revision/status/rollout/signature checks into one internal state reader used by the existing decision path and by a new `prepareGeneralConfirmationInTransaction`. Preserve terminal recovery/cancellation handling and current action-specific recovery authorization.
2. Add an optional **server adapter** preflight request builder and an asynchronous runner. After all initial pending-confirmation gates, the builder produces a deeply copied server command plus publication and exact binding. It must not retain `fresh.db`, a transaction-local execute closure or an unlocked model-supplied callback. Actions without a preflight hook continue executing in their existing single owning transaction; terminal/cancel paths finish normally without external work.
3. Commit/end the initial read/authorization phase before calling the async runner. This is the place for configured screening and opaque `prepareCommerceQuoteIssue`; no interactive transaction may remain open across that await. Keep raw tokens/proofs and preflight material solely in trusted memory; never serialize them to proposals, channel messages, logs or model results.
4. Reenter `inFreshGeneralTransaction` and call final `decideGeneralProposalInTransaction` with an additional **internal opaque** preflight artifact argument. Repeat every existing gate and fresh canonical review/target comparison. Its adapter `prepareExecution` consumes only an artifact matching the current exact command/binding. For a preflight-required action, missing/forged/mismatched evidence must refuse; it must not fall back to screening inside the transaction. Current canonical authority and CAS still decide execution.
5. Use a module-private WeakMap/brand for artifact authenticity. Bind proposal ID/revision/actionVersion/action/payloadHash/target identity+digest/idempotency key/expiry and actor/Tenant/Store/conversation. A supplied artifact proves screened input only; it grants no authority. Artifact reuse across rolled-back serialization retries may retain the same immutable input/proof, but each retry must rebuild fresh transaction-local review and execute closures. Completion races return current authorized saved receipts; edit/cancel/expiry/revocation races produce no new effects.
6. Allocate identities from durable server proposal state before preflight. The proposal already has `idempotencyKey` allocated at draft (`general-proposals.ts:219–233`). First-issue client Quote/version/option identities can be domain-separated deterministic derivations of that existing key and stable option positions; revision must retain the persisted Quote's client identity and allocate only a new version identity. Do not mint a new business idempotency identity per provider attempt, transaction retry or repeated Confirm. Keep native source/payload-hash semantics and exact existing Quote identity checks.
7. For WhatsApp, first extract a canonical `inspectAssistantWhatsAppActionReviewInTransaction` from the consume helper's shared validation. It must return an exact pending/recovery inspection without CONSUMED updates, result writes, outboxes or provider-token derivation. It must enforce the same durable ingress/delivery/key/generation/authority/proposal predicates; do not implement a weaker duplicate validator. The existing consume helper should reuse that validation and retain final locks/CAS.
8. The channel initial phase runs current lease/conversation/channel-policy checks and this non-consuming proof inspection before any preflight. Non-preflight actions still consume→decide→complete in their one owning transaction. For preflight-required pending confirmation, finish the initial transaction, run provider work, then start a new fresh channel transaction and repeat lease/current authority/ingress/channel-policy checks, call the **existing actual consume** and final decision, and finish review/outbox/ingress atomically. Never commit proof consumption merely to release the transaction for a provider call. Do not mint a browser approval token until final canonical proof validation/consumption as currently done.
9. Channel completed/cancel/consumed recovery, disabled, malformed and safe refusal branches skip preflight. On provider failure, leave pending proposal/proof effects untouched; only the established known-refusal pathway may create a new fixed refusal result under fresh authority. Unexpected errors remain errors. Lease expiry or generation change during screening must fail at final lease validation; preflight must not renew/extend authority on its own.

## Required focused regression evidence before a readiness claim

- Actual shared orchestration with a transaction-depth sentinel: provider/preflight runs only at depth zero; every business effect, proposal claim/receipt and channel proof/result/outbox update remains in the final owning transaction. Direct in-transaction calls missing required evidence refuse without screening fallback.
- All existing action families without a preflight hook retain their original single-transaction branch and recovery/cancel/rollback behavior. Existing strict API input rejects client artifacts/scope/identity overrides.
- No provider invocation for completed recovery, cancellation, malformed/disabled/refusal ingress, invalid/expired signature, wrong revision/payload/target, unauthorized actor/session/privacy/legal/QA scope, wrong channel proof or consumed recovery. Recovery still succeeds when execution rollout/provider becomes unavailable, subject to current authority.
- Deferred preflight races: edited payload/revision/target, cancellation/completion, expiry, role/access/policy/Terms/source change, Store change, linked identity/grant/selection revocation, key rotation, lease expiry/owner/generation replacement, changed ingress/reply/delivery proof. Final fresh predicates refuse changed work without partial business/proof effects; completed races recover only the exact saved result.
- Actual canonical channel inspect/consume with transport stand-ins: inspection performs no updates and matches consumption refusal predicates; the second phase actually consumes. Inject failure after canonical effect, receipt, review completion and outbox to prove atomic rollback in a connected test only when that separate gate is authorized. Stand-ins alone are not real transaction/HTTP authority proof.
- Stable server idempotency identities across duplicate confirmations and serialization retry. No duplicate Quote/version/approval/action-message/invitation/unread intent, no raw token or screening proof in output. Mismatched/forged/JSON-cloned preflight artifacts and changed saved release labels refuse without provider fallback.
- Quote approval receives separate actual saved-version/default-linked-text proof tests if moved outside its transaction; issue tests cannot substitute for those branches.

## Audited source hashes

| File | SHA-256 |
| --- | --- |
| `apps/api/src/assistant/general-proposals.ts` | `49d989d56954e95006cf0b2f044acc3ebce201a1453f4a09eb2974778500de38` |
| `apps/api/src/assistant/channel-action-turn.ts` | `258e3154a5b5f29097025fdce07da5e1f349856aa09cfc9269571d72ff730985` |
| `packages/db/src/queries/assistant-whatsapp/action-reviews.ts` | `cbe1c2c76454299a2b14be1c67d594f7f841719c01018ba033bbd6fc8b99b114` |
| `apps/api/src/assistant/general-actions.ts` | `3a838f5ee49ce2b9d43bdc3bcb9531144ede1ee94d5956b1740b3b4bad3ac672` |
| `apps/api/src/assistant/general-quote-decision.ts` | `3044f4c4a711c50311aafc42bea7cac50a6efb6e0f1b523f3044c1da7e431535` |
| `packages/db/src/queries/commerce-quote-decision-review.ts` | `aac169801ce0a1134304c7c8c81bd287c1dbc2610478bc3923e50e2fc69c5b83` |
| `packages/db/src/queries/commerce-quotes.ts` | `d72e3f3375c689736dee9b189aa555af3b1b582ceeaf92b542add9cce4f93abb` |

No product source was edited by this audit. Brain integration documentation remains assigned to root. This proposal does not authorize connected tests, provider calls, channel rollout, deployment or acceptance advancement.
