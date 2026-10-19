# H04 media provenance and bounded plans — first source slice

15 October 2026. **Contract primitives implemented; durable integration and full
H04 acceptance remain open.** No shared contract/manifest/proposal/DB/schema/UI
file is changed by this slice. No provider/network/database/runtime/compiler or
connected runner is invoked. This is not generic upload compatibility promoted
to H04 completion, nor an additional voice implementation plan.

## 1. Canonical outcome and existing foundations

H04 in `.brain/plans/2026-10-09-assistant-business-operations.md` and Phase9 of
`.brain/plans/2026-10-15-assistant-operations-phase-checklist.md` requires all of:
source-cited typed proposals; uncertain-field review; transcription confidence
separate from command authority; bounded multi-step plans and per-step receipts;
offline execution unavailable without approved canonical replay support.

Existing usable source, which this slice reuses rather than replaces:

| Actual seam | Current behavior and boundary |
| --- | --- |
| `apps/api/src/trpc/routers/setup-assistant-attachments.ts` | Protected voiceCapabilities/usage, createIntent/list/pending/retry/remove. Actor/Tenant/currentStore and permitted chat purposes derive from `attachment-scope.ts`. CreateIntent binds digest/size/type and private upload path. |
| `apps/api/src/assistant/attachment-upload.ts`, `packages/db/src/queries/assistant-attachments.ts`, `packages/private-media/src/assistant-attachments.ts` | Actual private byte admission, current scope/generation/retention, sent-message binding, upload identity/recovery and storage attribution. Setup's shared-owner `readSentAssistantAttachment` alone is NOT sufficient for actor-owned GENERAL sources. |
| `packages/assistant/src/setup/attachment-processing.ts`, `packages/jobs/src/handlers/assistant-attachment-process.ts` | Actual bounded extraction and generation-owned completion; server processing checks current authority and budgets. GENERAL images are attachment-only and not analyzed. |
| `packages/ai/src/transcription/router.ts`, `packages/db/src/queries/assistant-voice.ts` | Local Whisper -> OpenAI -> xAI routing, attempt/lease/generation and unknown billable outcome accounting, one audio reservation and current authority. No new speech provider is needed for H04. |
| `packages/assistant/src/files/{spreadsheet,pdf-text}.ts` | Existing deterministic cell/page extraction. PDF has no OCR; scanned/empty/encrypted/oversized input is not readable evidence. Shared parsers are not permission to admit a format to GENERAL. |
| `apps/api/src/assistant/{general-turn-contract,general-turn,chat-attachments}.ts` | Actual GENERAL turns accept text plus server-owned attachment IDs, bind READY files to the exact message, fence extraction as untrusted text and disclose shortened context. Only recent bounded attachments reach the model in full. |
| Dashboard `general-assistant/{assistant-composer,general-attachment-tray}.tsx` and native `assistant/{assistant-chat-box,use-assistant-receipts}.ts[x]` | Current recorder and photo/PDF source UI exists. Transcripts become editable message text; recorders presently discard/remove or stop carrying the original unsent AUDIO. Typed transcript provenance therefore needs an actual retained Use/Edit/message binding, not an inferred recording ID. Source existence is not microphone/device/launch acceptance. |
| `apps/api/src/assistant/channel-media-turn.ts` and WhatsApp media/voice-review contracts | Existing linked-channel Use/Edit proof is bound to request/message/text/original READY AUDIO and current linked authority. It must not be transplanted as an app Session or generic human approval proof. |
| `packages/assistant/src/setup/contracts.ts` | Setup has row/page/line source and uncertainty data. GENERAL action/proposal contracts currently have no equivalent field review or plan state; Setup entities are not GENERAL business commands. |

Current GENERAL admission is **AUDIO / IMAGE / PDF only** in
`packages/assistant/src/setup/attachments.ts`. CSV/XLSX/TSV/TEXT are currently
denied. Image attachment presence is allowed; image business-fact analysis is not.
Do not silently widen that boundary while integrating the new locator types.

Limits remain the existing attachment policy: audio 10MiB/2min, image 8MiB,
PDF 2MiB/20pages, shared future-context spreadsheets 2MiB/500rows and text256KiB;
4 attachments/message, 60/chat, 15min upload and 30day source retention. No limit
is raised here. General model history still shortens attachment context; a
shortened model excerpt cannot substantiate whole-file completeness.

## 2. Implemented new contracts, with their actual trust limits

New `packages/assistant/src/general/media-provenance.ts` exports:

- Strict origin, citation/locator, field-path, review-binding, field-review and
  acknowledgement-claim schemas; corresponding exported types. All IDs are
  exact, bounded opaque identities; extra URL/authority/approval/confidence fields
  refuse. Locators use exact UTF-16 string offsets/quoted spans, with explicit
  part/page/cell/line identities rather than invented temporal audio segments.
- `assessGeneralMediaCitation` compares a citation to a separately fresh,
  server-resolved source snapshot: actor/Tenant/Store/chat/message, attachment,
  processing generation, content/extraction digest, READY status, retention,
  exact original location/quote and known coverage. This is a data comparison,
  not authentication, a human acknowledgement or authority to execute.
- Current GENERAL semantic matching supports actual retained AUDIO transcript
  and PDF page text, plus user-message spans. IMAGE presence matches only as
  nonsemantic evidence. CSV/TEXT and semantic image sources remain unavailable.
  Table/text/image locators are future-context vocabulary, not implemented
  GENERAL formats or expanded capabilities.
- Current STT DTOs provide no numeric confidence or transcript-completeness flag;
  processing slices text at 8000 characters. Audio coverage is therefore
  explicitly `unknown`, always requiring field review even if a candidate claims
  `source_clear`. PDF truncation, missing original pages and retained empty or
  whitespace-only pages remain partial and require field review even with a
  `source_clear` candidate. The actual PDF producer skips unreadable/scanned
  pages without necessarily setting `truncated`; absence never proves a blank
  page or complete OCR. Complete means every original page is present once,
  in range, readable and untruncated. No original full-audio accuracy
  or complete extracted document is inferred.
- `generalMediaUnacknowledgedFields` compares CLAIMS against the exact proposed
  origin/proposal revision/payload/target/source-set/field-set/optional-plan
  bindings and field value digests. A returned empty array means only that
  submitted data claims match. It cannot prove the actor clicked, the source is
  still current, the hashes are correct or that the canonical command is allowed.
  There is intentionally no trusted acknowledgement constructor from raw input.

Source and value digests must be computed by the future server resolver from
exact saved data. `extractionDigest` must bind retained transcript AND extraction
content for AUDIO, not merely language/duration metadata. The caller must
independently establish current eligible Session/account/privacy/chat/source/Store
authority, validate the source schema and recheck it at confirmation. These pure
typed helpers are not unknown-object HTTP admission or callback-free parsers;
bounded parsed-JSON admission is an outer boundary still required.

The provenance resource ceilings are 50,000 citations/field reviews and eight
citation references per field; over-limit fails the whole shape. They avoid a
smaller hidden cap than existing stock-count 500sources ×48entries. The actual
24,000 quantity paths retain every entry in the focused source test. This is
shape coverage, not a claim those synthetic quotes/digests were server-verified.
Production transport must independently bound encoded bytes and page complete
reviews without omissions before these large shapes are exposed.

The ten-step ceiling and citation/field counts do **not** bound pre-parse HTTP or
model bytes, canonical full action graphs, or memory. A supported stock count can
already contain 500 sources × 48 entries; every supported action and source fact
must survive intact. Before exposing these schemas, measure and enforce actual
wire admission and complete logical-review byte budgets, including encoding and
transport envelopes, before parsing or copying large untrusted data. An array
count check in Zod is not that boundary. Refuse an oversized whole request or use
verified complete paging; never truncate an action to make it fit.

Proposal target IDs retain the actual 191-character native opaque-ID ceiling;
scope and plan identities follow their existing contracts. This preserves exact
identity rather than silently shortening a target or treating its shape as proof.
Targets preserve non-ASCII and punctuation exactly without normalization or a
token/navigation regex; they are JSON identity bindings, not navigation URLs.

New `packages/assistant/src/general/bounded-plan.ts` exports:

- `generalPlanIntentSchema`: untrusted/model-only temporary keys, exact existing
  typed GeneralAction payloads or explicit unresolved action/questions. No plan
  IDs, server step IDs, scope, proposal IDs, receipts, approval or execute fields.
- `generalBoundedPlanSchema`: server-owned saved snapshot SHAPE with exact
  origin/plan revision, server step identities, ordered dependencies, actual
  capability identity/version and actual GeneralReceipt. Dependencies must name
  earlier distinct steps; duplicate/cyclic/foreign/forward dependencies and reuse
  of one proposal as two steps refuse. Unresolved facts cannot become outcomes.
- An explicit **10-step resource ceiling**, approved by the coordinator. An
  eleventh step refuses the whole plan; there is no clipping or automatically
  generating another execution batch. This ceiling is unrelated to the model's
  six inference-tool-step budget.
- Per-step states distinguish resolution, draft, blocked, individual review,
  stale review, executing, unknown, completed, failed and cancelled. Receipt
  family must match the actual capability, including exact Store-settings
  receipt section. Actual domain identity/readback/receipt digest validation is
  still the fresh canonical server's responsibility.
- `generalPlanContinuation` describes the next resolution/draft/individual
  review/recovery requirement. Executing/unknown work fences all later work and
  preserves its original proposal identity. Cancellation cannot hide uncertain
  actions; failed/cancelled is never success. No function executes, grants
  authority, makes a provider call, mints command IDs or marks a record complete.

Neither schema accepts a blanket plan approval or an offline execution queue.
Even a well-shaped server snapshot is not trusted when copied from a client.

## 3. Concrete next integration and ownership slices

1. **Fresh canonical source resolver** — new DB/API module resolving exact
   actor-owned active GENERAL chat and original sent User message/part plus
   READY unexpired attachment. Reuse actual attachment storage/processing facts,
   with current actor/Tenant/Store/source and account/privacy authority; never
   merely call Setup's shared-owner source reader or accept a client hash as
   proof. Return private original details to authorized UI and a separately
   allowlisted source reference to model tools. Compute all source/value digests
   over exact data; current image evidence stays nonsemantic.
2. **Retained transcript review** — reuse existing STT/attempt ledger. Add an
   actual web/app Use/Edit choice binding original attachment/generation/content
   digest, chosen reviewed text and eventual saved message/part; cancellation,
   scope switches and late transcription cannot overwrite another draft. Keep
   transcription certainty separate from business confirmation. Existing app
   transcript-as-plain-text cannot be relabeled as proven audio provenance.
3. **Durable source/plan persistence and signature design** — explicitly unresolved.
   Existing `AssistantActionProposal.payload` is strict GeneralAction and its
   payload/target hashes and signed approval currently bind one action. Existing
   `AssistantMessage.parts` allows only known text/answer/attachment/reference
   parts. There is no plan, source-review or field-ack storage identity today.
   Choose/review a versioned durable envelope or additive records before source
   staging/confirmation integration. Preserve historical version1 proposals and
   receipts, bind source+field+plan step revision into signed approval, and
   transactionally invalidate all dependent acknowledgements on edits. Do not
   overload PRODUCT_CREATE's `workflowContext`, insert unvalidated metadata into
   another action, or trust a client-supplied plan snapshot. Schema application,
   if chosen, retains its separate approval/migration boundary.
4. **Actual plan staging and per-step orchestration** — root-owned protected
   tool/proposal/turn integration uses these intent contracts, then assigns
   immutable plan/step IDs, resolves real records, derives exact dependencies
   and stages existing signed proposals only after canonical review. Each write
   uses its existing individual confirmation and owning transaction. A dependency
   result must be reloaded from the original saved canonical receipt under
   current authority before downstream drafting; no text/JSON ID interpolation,
   guessed success, parallel write fanout or client-chosen idempotency key.
   Unknown attempts reconcile the original identity before another step. Plan
   saving/receipts and final rollback/replay must be atomic at their actual
   intended boundaries; mixed confirmed/unconfirmed steps remain visible.
5. **Owning media-domain wrappers** — full H04 must still cover the ten planned
   procedures: `finance.expenseReceipts.{createIntent,attach,get,list,withdraw}`,
   `orders.activity.list`, and
   `services.{captureEvidence,updateEvidenceUpload,publishEvidence,revokeEvidence}`.
   Actual Finance receipt, Service evidence and Order attachment commands remain
   authoritative; private capture, attachment, public publication and revocation
   are distinct reviewed effects. Existing `order_attachment_add` and simple
   expense/money-in/transfer/sale photo flows are reusable partial source, not
   substitutes for the omitted procedures or whole H04.
6. **All declared clients, then acceptance** — shared proposal and persisted
   snapshot schemas, safe model projection, app original-source reader, per-field
   uncertainty review/editor, per-step plan/receipt/unknown states, dashboard and
   actual native navigation/keyboard/device journeys; WhatsApp requires its
   existing linked identity/use-edit and explicit individual approval protocol.
   Keep role/access/Store/business/blur/unmount/late callback and duplicate tap
   fences, current-source re-review and historical receipt privacy. No mobile
   client declaration or planned rollout is promoted by these new files.

This order advances the actual H04 outcome rather than adding another uploader.
The first source slice intentionally does not claim those integration steps exist.

## 4. Source verification and remaining gates

Focused first-slice checks: **21 tests /120 assertions pass**, four-file Biome
clean. Tests cover current original PDF/voice/message identity and exact spans,
surrogate boundaries, retention/generation/digest/scope drift, unknown/partial
coverage, unsupported formats/photo semantics, strict field and acknowledgement
bindings, full existing500×48 shape, ten-step whole-plan refusal, actual capability
and receipt families, unresolved dependencies, separate reviews, unknown recovery,
duplicate proposal identity and cancellation/stale/failed distinctions. These are
pure contract checks; no provider/DB/canonical execution/device acceptance.

The existing voice plan/runbook retains website-first rollout and an explicit
native design-only owner correction, plus separate dictation/call acceptance.
Current recorder source does not revoke those launch/device gates. No STT
provider/configuration/gateway is started here. A documentation/code discrepancy
needs root reconciliation before launch: the voice runbook names
`ASSISTANT_VOICE_ENABLED` in API and jobs, but inspected current
`voice-availability.ts` and attachment job factory do not read it. They use
provider/storage/current authority and QA decisions. Do not claim that flag is an
enforced current kill switch or silently change it as part of these primitives.

Offline domain execution remains unavailable. G01 human pause, Paystack pause,
D04 exact fingerprint/remaining12 UNSCHEDULED, E05 activation/restart refusal,
G04 six deferred UNSCHEDULED, S05 seven UNRUN/no retry scheduling and C04 exact
target bounds remain unchanged. Full H04 and phases4–12 acceptance do not advance.
Root owns Brain/API/permission/privacy/schema/task/coverage/impact reconciliation.
