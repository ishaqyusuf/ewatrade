# Catalog AI image generation — approval proposal

Date: 28 October 2026 (Africa/Lagos).
Status: planning and Workshop only; implementation awaits owner approval.
Implementation acceptance: 0/7 slices. No provider call, schema change, deployment,
coin price, commercial-policy change or automatic image attachment is authorized.

## Finding: the requested feature is missing

The current source supports Product and Service photos, uploaded-photo moderation,
static illustration recommendations, ordered image replacement and reuse of
approved business photos. It does not generate new images from Catalog details.
No generation/edit provider adapter, generation job, generation UI or image-credit
wallet was found in the application/package source audited for this proposal.
This is a source finding, not a fresh Production acceptance claim.

| Existing capability | Current evidence | Reuse / missing work |
| --- | --- | --- |
| Product and Service image editing | `apps/dashboard/src/components/catalog-item/form.tsx`, `catalog-saved-photos.tsx`; mobile equivalents | Keep current form and details-sheet Images placement |
| Upload and private processing | `packages/catalog/src/photo-{upload,storage,processing,derivatives}.ts` | Reuse validated byte handling; generation needs its own output admission path |
| Photo moderation | `packages/catalog/src/photo-review-openai.ts` | Calls `/v1/moderations`; it is not an image generator or proof of product fidelity |
| My images | `apps/api/src/trpc/routers/catalog-photos.ts`, `packages/db/src/queries/catalog-photo-gallery.ts` | Approved images attached to accessible items; unattached generated results need new retention/read rules |
| Ordering / safe replacement | `packages/db/src/queries/catalog-photo-replacement.ts` | Preserve expected-image conflict checks and eight-image limit |
| Photo persistence | `packages/db/prisma/models/catalog-photos.prisma` | One asset belongs to one item/Store; do not turn it into a shared mutable attachment |
| Assistant preparation | `packages/assistant/src/general/product-create.ts`, API catalog draft handlers | Reuse reviewed typed facts; generation must be an explicit separate action |

The [1 October image/gallery plan](../../.brain/plans/2026-10-01-ai-images-gallery-and-invoices.md)
already proposes source-photo refinement, presets/reference/Surprise me, a private
gallery and coin-funded execution. It remains the broader dependency/history
record. This proposal fills the text-to-image and Service-image gap and updates
the starting point: attached-photo reuse now exists. It does not reset completed
gallery work or reorder invoices, imports or other workstreams.

## Proposed merchant experience

1. From Product/Service creation or the existing item's Images view, choose
   **Add image → Generate with AI**. Upload, camera, My images and Illustration
   library stay available. Opening this flow does not start a paid job.
2. Show the exact item/draft and Store, item kind, name, description, category and
   selected visual attributes/choice. The merchant can edit an **Image brief**,
   choose a style, square/portrait/landscape, and **1 or 4 images** (initial limits
   proposed for approval). One is the default. Four is four candidates for one
   selected item/choice, not an instruction to generate every Catalog item.
3. With no photo, offer an **Illustrative image** based on the supplied details.
   Say that it is not a photograph of the actual item. With an eligible owned
   photo, offer **Improve my photo**, retaining its identity and the original.
   An uploaded style reference influences presentation, never supplies item facts.
4. Show which details will be sent and exclude private fields. Show the current
   server allowance/quote before **Generate**. A name/kind is the minimum; ask
   only for genuinely necessary visual detail. Never invent branded packaging,
   labels, quantity, colour, facilities, people or service results.
5. Generation continues durably after the view closes. Reopening restores the
   original job and scope. Show queued, generating, checking, ready, partial,
   failed, uncertain, cancelled-before-start and unavailable states truthfully.
6. Review individual results at useful size. Show **AI generated**, mode, source
   details and reference provenance. Select candidates, choose a cover and use
   **Add selected to draft** or **Keep in My images**. Neither action publishes a
   storefront, saves a new Catalog item or replaces the original automatically.
7. Existing Images **Save changes**, or Catalog **Save item**, commits the
   attachment through the canonical command. Recheck current authority and image
   list; changed Catalog facts require a fresh review. A new variation is a new
   explicit generation with its own allowance/quote.

The editor uses the supplied draft before an item exists; it must not save an
incomplete Catalog item just to obtain an image. A stable actor-owned draft ID and
revision bind generation and subsequent attachment. Saved-item entry rereads
canonical facts. Item/choice edits invalidate the reviewed snapshot, not the
previously saved output, which remains recoverable under its original lineage.

## Product / Service truth and privacy

- **Products:** text-only images remain illustrative. Recommend a source photo
  for exact branded/packaged products; refuse an exact-product-photo promise
  without one. Keep supplied pack counts, colour, material and visible attributes;
  uncertain identity/labels block acceptance as a faithful enhancement. A quality
  classifier cannot guarantee fidelity; require merchant review.
- **Services:** generate representative illustrations or conceptual imagery from
  the service name/description and public offerings. Never synthesize before/after
  proof, customer work, staff credentials, a real premises claim or completed-job
  evidence. Service Job photos, patient data, prescriptions and request attachments
  are excluded. Regulated/clinical goods and services remain off in the initial
  pilot until their policies are separately reviewed.
- **Prompt input:** allowlist public-facing name/description/category and explicit
  visual attributes. Prices, costs, stock, customer records, staff details,
  internal notes, proof/OTP, credentials and service evidence stay out. Treat all
  descriptive text as untrusted data; it cannot request tools, change scope or
  authorize an attachment. Bound lengths and sanitize display, not merchant facts.
- **Rights and provenance:** accept references only through authorized owned or
  licensed asset IDs; no arbitrary URL fetch. Store source/reference digests,
  prompt/preset/policy/model versions and originating draft/job. Generated origin
  survives copies, exports and derivatives. Proposal: a visible “Illustrative AI
  image” label accompanies text-only imagery on customer-facing Catalog surfaces;
  faithful photo edits retain provenance with a suitable “AI edited” indicator.
  Confirm this customer-facing treatment before implementation.
- **Retention proposal:** unused generated results private for 30 days; private
  references for 7 days after terminal recovery unless retained explicitly for
  another authorized job; attachment preserves the output. Show expiry before
  Keep/Generate and retain minimal audit receipts without private bytes/prompts.
  Deletion/takedown must cover originals, derivatives, queued work and copies
  according to provenance/rights policy. These durations await owner approval.

## UI directions and prior decisions

Publish a new, related Workshop at
`https://workshop.localhost/ewatrade/dashboard/web-app/catalog/ai-images`.
Keep earlier selected My images `02` revision
`14e705ae-1781-4fe2-8c0c-0486743a3a07`, item forms `01` revision
`6ea1c5cf-b867-41f6-8944-22d1144407bf`, and their implementation records intact.
This is an image-generation extension, not a redesign of those accepted flows.

| Stable direction | Shape | Tradeoff |
| --- | --- | --- |
| `01` Quick presets | Compact style choices and a short editable brief | Fast entry; context needs deliberate inspection |
| `02` Guided brief — recommended | Catalog facts, mode and controls in a clear sequence inside Images | Makes the source and review decision clear with modest extra space |
| `03` Image studio | Larger brief workspace and a persistent candidate area on desktop | Better for repeated art direction; heavier for occasional use |

Each includes Product/Service, dashboard/mobile, one/four candidates, generation,
review, partial failure, uncertain result, limit/refusal and stale-input studies.
Outcomes and image artwork are local sample simulations, not provider evidence.
Mobile uses the shared floating config panel. No new search is needed; future
gallery search must reuse `BottomSearchFooter` / `FloatingSearchField` with the
owning search scope and sheet keyboard controller.

## Architecture and proposed contracts

Keep API routes/channel adapters thin. Domain policy and provider orchestration
belong in `packages/catalog`; persistence and atomic transitions in `packages/db`;
identifier-only durable workers in `packages/jobs`. Dashboard/Expo consume one
typed lifecycle. Proposed names below do not describe endpoints/models that exist.

```text
Catalog facts/draft → validate brief → capability/quote → explicit Generate
  → transaction: fresh scope + input hash + budget hold + job/outbox
  → durable worker: current authority → provider attempt (outside DB transaction)
  → decode/check → private output + provenance → output-level settlement
  → ready/partial → merchant selects → draft media → canonical Catalog save
```

Proposed `catalog.images` methods: `prepare` (authorized snapshot/eligibility),
`quote` (exact inputs/count/expiry), `generate` (idempotent confirmed request),
`job` / `listJobs` (scoped recovery), `cancel` (before provider dispatch),
`retain` (private gallery), and `prepareAttachment` (reviewed output IDs into the
existing draft). Clients never submit trusted tenant IDs, provider URLs, cost,
moderation approval or “already charged” flags. Reauthorize every preview/read,
dispatch, retention and application; permissions can expire while jobs run.

Proposed persistence responsibilities:

| Record | Required invariant |
| --- | --- |
| Generation job | Tenant, Store, actor, saved item or draft/revision, selected choice, immutable snapshot/hash, mode, count, quote/hold, idempotency key, lifecycle/version |
| Provider attempt | Unique job/attempt, dispatch lease, provider request/reference, timeout ambiguity, recovery result; no blind rerun after uncertain dispatch |
| Output | Unique job/output index, validated digest, private object identity, dimensions, review/quality state, provenance and settlement identity |
| Retained gallery output | Explicit retain/access scope, expiry, generated origin and source; can exist without a Catalog attachment |
| Usage reservation / ledger | One hold and at most one settlement per deliverable, releases/refunds auditable; no merchant cash/order posting |

Extend the existing media repository instead of a second image silo. The current
gallery lists approved *attached* photos only, so returning unattached outputs
requires an explicit retained-asset read/preview contract. Do not expose all
actor-private uploads to other staff. Reuse makes independent attachment copies
as today; detaching one must not delete another item's bytes. Never bypass
CatalogPhotoAsset expiry/attachment checks or simply mark provider bytes APPROVED.

## Reliability, permissions and operating cost

- Admission requires existing Catalog management in the selected Store **and**
  a server generation entitlement/budget. Proposal: Owner/Admin pilot initially;
  staff spend permission is separately configured, never inferred from Catalog
  read access. Tenant owns the budget with Store attribution, consistent with
  [ADR-0005](../../.brain/decisions/ADR-0005-product-image-marketplace-token-and-publish-boundary.md).
- Use an atomic budget reservation and enqueue outbox. Duplicate clicks and worker
  retries reuse the same operation, outputs and settlement. Concurrent generation
  cannot overspend. An input change requires a new quote/confirmation.
- Job states: QUEUED → RUNNING → CHECKING → SUCCEEDED/PARTIAL/FAILED;
  CANCELLED only before dispatch; NEEDS_RECONCILIATION for uncertain effects.
  Explicit leases/CAS prevent a late worker overwriting newer state. App unmount
  and Store switches do not cancel a provider request or retarget its output.
- Four outputs have independent review and delivery states. Keep the successful
  three when the fourth fails. Settle only persisted, review-passed deliverables
  under the approved pricing contract; release the failed portion. Keeping rather
  than applying a delivered result does not itself refund it. Retrying a failed
  candidate never charges or regenerates successful siblings again.
- A timed-out dispatch stays uncertain until reconciled; do not promise a safe
  second request if the provider cannot retrieve the first result. Recovery must
  identify that limitation, retain the reservation and expose operator resolution.
  Bytes written before a DB crash are reconciled or removed through durable cleanup.
- Proposed first pilot: finite owner-granted allowance, per-business concurrency
  and daily provider-spend cap, feature off by default, global pause. No fabricated
  unlimited/free promise. Paid self-serve generation remains gated on the real
  token ledger/top-up work from the older plan and explicit commercial approval.
  Do not repurpose General Assistant text tokens as image credits. Native UI can
  launch later if billing/provider/native acceptance is incomplete.
- Provider adapter is capability-driven: generation vs reference edit, output
  formats/counts, request IDs, bounded bytes/time and ambiguity recovery. Pin an
  approved model during implementation after quality/cost evaluation. Existing
  photo moderation credentials are not generation configuration. No secret/key
  setup or paid sample generation is part of this planning delivery.
- Track job ID, policy/model version, latency, delivered/rejected outputs,
  operational cost, settlement and stuck reservations without private prompts or
  bytes in logs. Support can pause dispatch and reconcile/refund through audited
  operations; it cannot silently bypass review or publish images.

Current [OpenAI image API documentation](https://developers.openai.com/api/docs/guides/image-generation)
confirms text generation, reference editing and multiple outputs are supported;
it also documents text/consistency/composition limitations. Checked 28 October
2026. This is a candidate implementation option, not a provider/model selection,
cost commitment or guarantee of catalog identity preservation.

## Implementation slices after approval

| Slice | Work and likely files | Exit evidence |
| --- | --- | --- |
| 1. Contracts and policy | `packages/catalog/src/image-generation/*` (proposed); approved ADR, DTOs, allowlist, capability/budget and source snapshot contracts | Product/Service/draft examples, denied fields, exact approval decisions and client support matrix |
| 2. Durable persistence/media | Prisma-generated additive models, `packages/db/src/queries/catalog-image-*` (proposed), retained-output preview/lifecycle | Isolation, idempotency, input revisions, actor-private drafts, retained outputs and copy/detach/cleanup proof |
| 3. Job/provider/budget | `packages/jobs` tasks, provider adapter, enqueue/lease/recovery, reservations and output settlements | Injected-provider success/partial/refusal, duplicate dispatch, crash and ambiguous timeout proofs; finite caps |
| 4. Dashboard integration | Existing `catalog-item/form.tsx`, `catalog-saved-photos.tsx`, gallery and draft media hook; thin tRPC schemas/router | Create and existing-item flow, Product/Service, one/four, review/keep/apply and stale conflict UX |
| 5. Native integration | Existing mobile form/Images editor, `catalog-photo-upload.ts` and shared typed client | Draft retention, scope switches, app-close/reopen, native image preview and attachment; correct keyboard ownership |
| 6. Focused acceptance | Existing QA accelerator + feature tests and one appropriate UI session per changed platform | Permission/budget races, complete lifecycle, exact selected Workshop revision and actual source mapping |
| 7. Controlled launch preparation | Default-off gates, runbook, cost/quality baseline, exact candidate release checklist | Owner acceptance and separately authorized provider/Preview/Production work; source readiness never means live |

Each slice is a coherent local commit. Before Prisma edits inspect current models;
generate migrations through the existing workflow, never handwritten SQL. The root
defines both commands: run `bun db:migrate` and `bun db:push` against the authorized
development target after schema changes, preserving target isolation and approvals.
No database command is needed for this documentation-only proposal.

## Acceptance checklist for implementation

- [ ] Approved exact Workshop revision and decisions recorded before code.
- [ ] Draft Product, saved Product, draft Service and saved Service use supplied
      public details; missing visual facts never become invented claims.
- [ ] Both one/four outputs work; 3-of-4 survives a failure; no candidate auto-applies.
- [ ] Source enhancement retains original and blocks misleading identity changes;
      Service imagery cannot enter private completed-work evidence.
- [ ] Scope, role, generation entitlement and current image list rechecked; foreign
      Tenant/Store/actor, revoked access, old draft and stale quote are refused.
- [ ] Two tabs/duplicate workers cannot overspend, double-debit, duplicate output
      or replace images concurrently without an expected-version conflict.
- [ ] Closing/reopening recovers the same job; switch-back never leaks another
      Store's result; retrying failed outputs preserves successful outputs.
- [ ] Provider success/storage failure, worker crash, moderation rejection,
      ambiguous timeout and cancellation obey documented state/charge policy.
- [ ] Retained unattached result survives reopen; expiry and detach do not destroy
      a separately attached copy; private references never become public.
- [ ] Full-size selection, cover choice, cap reached, empty/blocked/partial states,
      keyboard/focus and native lifecycle verified on the actually changed surfaces.
- [ ] `bun run qa:doctor --offline`, scoped `test:quick --plan --files ...`, then
      relevant source/types/domain checks; disclose scope and unmapped paths.
      Existing assistant H01/H02 gates apply if assistant contracts/tools change.
- [ ] Existing-data `qa:smoke` when feature runtime is ready; no sale/payment or
      fixture created merely to pass. No rollout through QA success alone.

## Decisions requested together, after review

Recommend approving Guided brief `02`, Product + Service support, 1/4 candidates,
text-only illustrative and owned-photo enhancement modes, private results with
explicit attachment, customer-facing illustrative labeling, and a finite
Owner/Admin pilot. Approve or adjust 30-day unused-output / 7-day reference
retention. Paid pricing, marketplace licensing changes, native purchases,
bulk generation across items, logos, masks, WhatsApp actions and automatic
storefront publishing remain separate scope. “Approve the plan” is implementation
authorization only if the owner explicitly says so; it never authorizes deployment.

## Planning evidence and Brain impact

Workshop publication IDs and focused preview evidence are recorded below and in
[the Brain feature](../../.brain/features/catalog-ai-image-generation.md).
Claude/T3 delegation is unavailable in this session;
Codex authors the Workshop directly under the owner's standing fallback.
Only plan/feature/backlog documentation changes belong to this task. Runtime API,
schema and accepted ADRs remain unchanged; update those in the implementation
slices that actually change their contracts. Preserve prior roadmap progress.


## Published review and planning verification

Review [02 · Guided brief v3](https://workshop.localhost/ewatrade/dashboard/web-app/catalog/ai-images/directions/02?rev=2e0b0294-ecff-4a5b-a8c4-1f5ef80923d6&screen=02.html).

| Direction | Immutable v3 revision |
| --- | --- |
| 01 Quick presets | `12c26b05-bbb3-4b11-a7be-79f37babb84a` |
| 02 Guided brief — recommended | `2e0b0294-ecff-4a5b-a8c4-1f5ef80923d6` |
| 03 Image studio | `238a5119-b501-4755-864d-9e5a8345c199` |

IAB synthetic preview verification, 28 October 2026: four-image generation → two
selected → explicit draft attachment; partial 3-of-4 → private retention; Service
mode and missing-reference disabling; close/reopen recovers the same simulated
result; uncertain state offers no duplicate request; dashboard rendering/reset;
mobile size, theme and collapse/reopen; all three options render through repaired
self-contained navigation with retained size/theme. v2 central-flow evidence is
reused where unchanged; v3 navigation and close/reopen checked directly. Initial
broken cross-revision links are preserved in v1/v2 history and corrected in v3.
No option is selected or implemented. Uploaded samples and output SVGs are local
simulations, not quality evidence for a real image model or native runtime.

`qa:doctor --offline` passed environment isolation/dependency/generated-client
presence, with runtime probes skipped. The scoped fast-check plan selects four
offline core tests with no unmapped
paths. Execution stops in QA tooling types at
`scripts/qa-web-smoke.mjs:129:21` (TS18047: `shell` is possibly null), outside
this documentation-only change. Direct execution of the four mapped tests uses
the same minimal `quickEnvironment`, with its unusable loopback DB sentinel.
The fast check is not reported green; direct core tests pass: 47 tests / 193
assertions across the four mapped files. No product UI smoke, connected DB/provider
check, actual generation or deployment is appropriate for this planning delivery.

Brain impact: `.brain/plans/2026-10-28-catalog-ai-image-generation.md`,
`.brain/features/catalog-ai-image-generation.md`, `.brain/tasks/backlog.md`.
Brain is ignored by this repository; this tracked plan retains the approval
contract and immutable design IDs in Git. Existing staged/unstaged work is excluded.
