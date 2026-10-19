# G03 Quote wire and complete-review budget

15 October 2026. Read-only source audit and deterministic in-memory size
measurement. **Proposal only:** no route, union, capability, policy, runtime,
provider, schema or database changes. Full G03 remains open, parent acceptance
13/45 unchanged and all existing approval/execution gates remain.

## 1. Conclusion

Twenty options × 100 lines is a row limit, not a byte limit. There is no finite
schema-wide maximum for the current native Quote input or full persisted review:
some identities, quantities, text, selections and policy/assignment collections
have no enforced length/cardinality bound at the relevant read boundary.

Measured complete 20×100 authenticated reviews already span **4,772,950–39,132,590
bytes** in actual canonical read executions using explicit synthetic profiles.
Adding a structural stress projection for 2,000 Offerings, full bounded suggestion
history and authority collections produces **7,424,077–41,783,717 bytes**. These are
examples, not global upper bounds. The current chat/card/default-query transports
cannot stand in for a complete Quote review at that size. Vercel documents a
4.5MB request/response payload limit for Functions. The smallest measured complete
review (4,772,950bytes) exceeds both4,500,000bytes and4.5MiB (4,718,592bytes), so
changing GET to POST alone cannot carry it as one ordinary response.
[Vercel Functions limits](https://vercel.com/docs/functions/limitations).

Keep native 20×100 behavior. Build a dedicated typed, authenticated complete review
transport with explicit byte budgets, coherent paging/reference semantics and a
non-confirmable overflow response. Do not silently drop options, notes, original
source selections or effects to fit a generic card or URL.

## 2. Current schema and transport trace

| Boundary | Source and enforced limits | Implication |
| --- | --- | --- |
| Native Service Quote | `apps/api/src/schemas/services.ts:366–429`: options1..20, lines1..100, option ID191, label120, promise500, command IDs160; unit price0..100,000,000. Offering/source-line/request/Store IDs have no string max; exact quantity has fractional scale6 but no integer-digit/string max. | No finite full-input upper bound. Service option/line shape is narrower than canonical helper; see section3. |
| Native Inquiry Quote | `apps/api/src/schemas/service-commerce-inquiries.ts:64–150`: options1..20, lines1..100, IDs191, labels120, notes/promises500, command IDs160, unit price≤100,000,000. Exact quantity has scale6 with no integer-digit/string max. | Even with bounded text/IDs, unbounded quantity prevents a finite schema-wide maximum. |
| Persisted quantity/money | `packages/db/prisma/models/commerce-quotes.prisma`: line quantity Decimal(38,6); money Int. Measured checkpoint guards Int32 money, but quantity parser only bounds scale. | A 10,000-digit quantity can parse; with unit price0 it can calculate0 yet exceed persisted quantity capacity. Root accepted this finding and assigned a separate canonical representability repair; this report does not edit or claim that repair complete. |
| GENERAL payload | `packages/assistant/src/general/contracts.ts`: strict action union, per-action fields, no universal payload byte cap. Issue/revise absent at this checkpoint. | New Quote payload cannot claim existing union support or inherit a generic byte guarantee. |
| GENERAL proposal/review/receipt | Same file`:474–574`: payload action union; `review:string[]` has no item/count/aggregate bound; generic receipt title/detail unbounded. `assistantActionProposal` stores Json payload/result with no application byte cap. | Database Json storage is not a safe transport/memory budget. Future Quote receipt should be compact and typed. |
| Generic structured presentation | `general/review-presentation.ts`: 60table rows,4columns,4sections each≤60rows/60chips; text fields40..800units;8facts. `generalProposalSchema.presentation.catch(undefined)` drops invalid presentation. | At most300 textual table/section rows; no typed20option/2,000line tree. A dropped presentation with short fallback must never count as a complete confirmable Quote. |
| Saved snapshot | `general/snapshot.ts`:40messages,60proposals,60unavailable entries; messages' parts arrays and proposal review strings have no aggregate byte bound. `readGeneralProposals` takes60. | Embedding full giant reviews in every card/history response multiplies payload size. Use exact compact references and separate review transport. |
| Chat request | `apps/api/src/assistant/general-chat-route.ts:66–78`: UTF-8 body≤65,536bytes, checked after `req.text()`. `general-turn-contract.ts`: ≤8parts, each text≤8,000UTF-16 units. | Full Quote JSON is not a chat message. Body check is not streaming admission. |
| Chat output/model | `general/contracts.ts:610`: stored text part≤16,000units; answer title/value160, scope500, detail1,000. `general-turn-execution.ts:181–182`:6steps,2,000output tokens. | A model turn cannot be assumed to emit/review2,000lines. Tool result and app review must be separate; model output tokens are not a body-byte budget. |
| App proposal edit/confirm | `apps/api/src/trpc/routers/assistant.ts:171–199`: edit takes full action payload; confirm only proposal ID/revision/decision/token≤128. | Confirm can remain small. Existing edit cannot patch one giant Quote option without an explicit new draft-edit seam. |
| Native client HTTP | `apps/mobile/src/trpc/client.tsx:89–120`: ordinary mutations use single `httpLink`; ordinary queries use `httpBatchLink`. Only search currently uses explicit POST override. | A full-intent review registered as a normal query would enter a GET URL. |
| Dashboard HTTP | `apps/dashboard/src/trpc/client.tsx:62`: `httpBatchLink`, SuperJSON. Next rewrites `/api/trpc/*` to API. | Same GET-query issue; batching also aggregates response sizes. |
| Installed tRPC behavior | Installed `@trpc/client` HTTP utils append `input=encodeURIComponent(JSON.stringify(serializedInput))` for GET query. Batch link defaults maxURLLength/maxItems to Infinity. | Infinity is client batching behavior, not proof that browsers/proxies accept enormous URLs. No source-configured protection is supplied by that default. |
| API admission | `apps/api/src/index.ts:259–276`: Hono tRPC/fetch adapter, `allowMethodOverride:true`; no general tRPC request/response byte limit configured. Local webhook/media limits are unrelated. | Explicit POST reads are possible, but neither POST nor no explicit app limit bypasses host limits. The actual deployed request path has not been exercised. |
| Deployment | `apps/api/vercel.json` selects Hono/Bun and a build command; no body budget. Dashboard rewrite config supplies no size guarantee. | Official Vercel Functions documentation specifies4.5MB request or response bodies. Oversize request yields413; oversized ordinary response yields500. This documentation was checked read-only; no deployment was tested. See links below. |

Vercel documents the request/response ceiling in its [Functions limits](https://vercel.com/docs/functions/limitations),
with separate [request payload error](https://vercel.com/docs/errors/function_payload_too_large)
and [response payload error](https://vercel.com/docs/errors/function_response_payload_too_large) guidance.
No project-specific override or different serving path was established here. A
large function bundle setting is not a request/response body allowance.

Zod string maxima count JavaScript UTF-16 code units, not bytes or graphemes.
`漢` is one unit/3UTF-8bytes; a non-whitespace U+0001 unit becomes6ASCII bytes in
JSON (`\u0001`). JSON escaping can be larger than raw UTF-8. Control-string probes
demonstrate schema size behavior only, not moderation-approved customer text or
real saved identity formats.

## 3. Service versus Inquiry versus full canonical helper

`service-public.ts:621–714` converts native Service lines to `included`, option
availability to `full`, and the legacy shape to unspecified fulfilment. This is an
intentional source-specific wrapper surface, not proof of general Inquiry parity.

| Field/behavior | Native Service issue schema/wrapper | Native Inquiry | Canonical `IssueCommerceQuoteInput` |
| --- | --- | --- | --- |
| Per-line outcomes | No outcome input; all included | Included/alternative/declined/unavailable | All four outcomes |
| Option availability | No input; full | Full/partial/unavailable | All three |
| Line customer note | Absent | ≤500 | Present |
| Option customer note | Absent | ≤500 | Present |
| Legacy customer note | Absent | ≤500 | Present |
| Legacy fulfilment fee/promise/type | Absent; wrapper uses unspecified | Present | Present |
| Option fee/promise/type | Present | Present | Present |
| Availability attestation | Absent; Service source-link rules apply | Explicit attestation identity, source-checked | Source-specific preparation; internal type alone is not permission to add product attestation to Service |
| Source line | Optional; omitted same-Offering fallback remains | Required, exact current Inquiry line | Source-specific validation/preparation |
| Catalog/configuration/balance/source-verification facts | Not editable native wire authority | Resolved from canonical reads/attestations | Some internal fields exist; never model-supplied authority flags |

Future strict actions must explicitly retain these source distinctions. Do not
expose the generic helper's wider Service outcomes/notes as if the existing native
Service endpoint already accepts them. Full feature scope may require deliberate
source-owned native schema/wrapper/editor expansion; that is not solved by a wider
GENERAL union or a budget change. Do not drop Inquiry fields to reuse the Service
form. No such expansion occurred in this audit.

## 4. Measurement method and results

Companion JSON stores exact measurements, assumptions, source hashes and the
generator text. Source hashes identify the measurement checkpoint, not a claim
that concurrently owned files are currently frozen. In particular the quantity
repair is separately assigned. Measurement used actual native Zod parsers and the actual canonical
review parent through a mutation-denying in-memory fixture extracted from its
existing test definitions. Test cases, timers and test network mocks were not run;
the measurement script independently denied fetch. All records/contacts were
synthetic; no real DB/HTTP/provider/model/business read occurred.

The byte counter recursively counts exactly the UTF-8 size of `JSON.stringify`
tokens, separators and values, with memoization of repeated values. It was checked
against concrete JSON examples. Actual SuperJSON serialization was then measured
inside `{result:{data:serialized}}`; no HTTP headers, compression, batched/stream
framing or proxy behavior is claimed. Oversized stress strings were never allocated.
Actual fixture object sharing can affect SuperJSON metadata; these are fixture
envelopes, not a mathematical network upper bound for every equivalent DB result.

### Native input: full optional finite fields,20×100

Every row includes all fields allowed for that native source. IDs191units,
command IDs160, label120, notes/promises500, quantity32whole+6fraction digits,
unit price0; adjustments fit existing Int32. Service omits unsupported fields.
All three profiles parsed successfully through their respective actual schemas.
Identities and text use the stated character profile. Quantities were capped for
this representative case only; the current schemas do not enforce that cap.

| Character profile | Service JSON bytes | Inquiry JSON bytes | Inquiry SuperJSON POST bytes | Inquiry GET encoded input characters |
| --- | ---: | ---: | ---: | ---: |
| ASCII | 1,000,602 | 2,533,542 | 2,533,598 | 2,703,928 |
| BMP3byte/unit | 2,502,930 | 6,792,270 | 6,792,326 | 19,738,840 |
| JSON-escaped units | 4,715,782 | 13,099,522 | 13,099,578 | 17,496,300 |

Separately, actual schema probes accepted a10,000character Service Offering ID,
a10,000digit Service quantity and a10,000digit Inquiry quantity. These demonstrate
missing wire bounds; they do not assert those IDs exist or those quantities fit DB
storage. No finite schema-wide maximum can be derived by multiplying only20×100.

### Complete authenticated review:100saved source lines + current Quote +100links

Actual-function profiles use191unit ASCII IDs, command IDs160, full saved source
details4,000/line details2,000/staff response2,000, saved contact/form fields, an exact
issued current Quote/version/selection and100linked conversations (half have saved
account invitations). Store/workspace/legal/current access/policy facts are present.
The canonical full-helper options include line/option notes, so these full Service
helper review profiles are not claimed to be expressible by today's narrower native
Service wire. One Offering repeats across rows; normal/API-shaped cases execute
the actual canonical review, rather than substituting hand-computed totals.

| Profile | Source/current selections per line | Actual function tRPC envelope bytes | Structural authority/catalog/history stress envelope bytes |
| --- | --- | ---: | ---: |
| Compact text ASCII | 4groups ×40unit components;128notes/40label | 4,772,950 | 7,424,077 |
| Current Catalog API-shaped ASCII | 12groups ×80unit components;500notes/120label | 9,296,630 | 11,947,757 |
| Same shape, BMP3byte text | 12×80 | 21,466,070 | 24,117,197 |
| Same shape, JSON-escaped text | 12×80 | 39,132,590 | 41,783,717 |
| Persisted read-bound stress ASCII | 100groups ×500unit components | Not executed; reconstructed derivative | 222,350,957 |
| Same persisted stress, escaped | 100×500 | Not executed; reconstructed derivative | 1,278,330,917 |

The structural stress derivative additionally names2,000Offering facts/coverage,
100suggestions with2,100total evidence rows,100policy records,100Store grants and
100approver IDs. It is a size model of source-backed DTO fields, not an assertion
that the modified derivative passed canonical authority. Actual-function profiles
included102policy records from the fixture. These are not production-typical data
or maxima. Every row/option and source snapshot remains counted; no silent clipping.

Current Catalog create schemas permit12groups, group/value labels80units, variant
and Offering names120 and item names160 (`apps/api/src/schemas/catalog.ts`). Prisma
persisted strings/selections do not encode those maxima, while the Quote reader
allows saved source selections up to100entries with500unit components. Resolved
current variant selections are read without a `take` or equivalent persisted bound.
The100×500 derivative illustrates why API creation bounds cannot be assumed for
all historical/current persisted facts. Neither derivative is a global worst case.

### Existing card and receipt schema examples

The maximum configured generic presentation shape (all60table rows,4sections with
60rows+60chips each,8facts and every bounded string filled) parsed successfully:
327,635ASCII bytes;947,435BMP bytes;1,864,145escaped bytes. Despite its size it still
does not have room for a typed20×100 Quote. Current bounded Quote decision receipt
examples parsed at2,558/5,878/10,828bytes respectively (ASCII IDs, varying text).
The generic record receipt's unbounded title/detail has no equivalent finite max.

## 5. Recommended honest complete-preview contract

These are proposed application budgets below the documented Vercel ceiling, to be
verified against the actual deployment path. They are not current application
limits, new human approvals or guarantees about app memory/performance.

1. **Do not send full Quote intent in a GET query or chat.** Prefer exact server-owned
   draft/proposal identity+revision inputs and explicit POST read transport. The
   server already allows method override. Keep ordinary read semantics, authorization
   and no-business-write behavior; POST alone grants no authority. Send each large
   review page with a single link rather than an unconstrained batch. If batching
   is retained, enforce the aggregate serialized body/response budget, not just
   each constituent page; a proposed2MiB aggregate still leaves platform headroom.
2. **Use ≤1MiB serialized JSON per request/response page** (including SuperJSON/tRPC
   envelope budget), with whole-body/stream admission rather than only decoded
   string lengths. Full finite-field Inquiry inputs can exceed13MB, so the existing
   full-payload `editProposal` cannot meet this by pretending its body is small.
   The BMP and escaped Inquiry examples also exceed Vercel’s documented4.5MB
   request limit. POST fixes URL size, not that body limit.
   Add a source-owned draft option/line edit composition seam (for example one
   exact option per revision), reassemble/validate the complete20×100 intent on the
   server and invalidate prior approval on every edit. Business execution stays one
   canonical atomic command. Never split one business execution into independent
   partial Quote writes. A single larger-body design would require a separately
   proven serving path; merely increasing an app validator does not change the
   documented Function ceiling. Do not upload customer/business review data to
   unrelated public storage as a transport workaround.
3. **Budget complete logical review at64MiB before hashing/materialization.** This
   covers the measured12group escaped stress with margin, not all possible legacy
   facts. This is a provisional server-side resource budget, never an HTTP body
   allowance or a replacement20×100row limit; it is not proven safe by byte counts. Count UTF-8 JSON bytes incrementally; avoid first building a gigabyte
   `stable()` string and then checking size. Exact review pages should fit1MiB and
   retain every field, with20options/100lines-per-option intact. Deduplicate immutable
   source/Offering/price snapshots by exact identity where semantically identical;
   never merge same names or distinct historical snapshots. Compression may help
   transport but is not the decoded-memory/complete-review budget.
4. **A paged review is one coherent confirmation object.** Manifest includes exact
   proposal/revision, source/current Quote/version, canonical full target digest,
   counts and page identities. All fetched pages must match that same scope/digest;
   changed facts invalidate the assembled review and old callbacks. A server can
   recompute/recheck a full bounded snapshot for each requested page, or use an
   explicitly designed server-owned snapshot materialization. Do not claim a stable
   multi-page DB snapshot by merging fresh unrelated reads. Recheck the complete
   digest and authority in the eventual execution transaction. Snapshot-storage,
   performance and recovery choices remain source-owned implementation work.
5. **Refuse incomplete/oversized review explicitly.** Proposed discriminated result:
   `complete` with exact pages/manifest, or `unavailable` with reason such as
   `review_byte_limit`, `single_fact_byte_limit`, `wire_limit` or existing source/
   authority refusal. Unavailable carries no approval token/confirmable presentation
   and never a partial total. Preserve the user's complete draft for editing or the
   full native workflow; do not discard fields/rows or lower native20×100. Do not
   label an unsupported oversized case accepted. This is bounded assistant refusal,
   not a new restriction on native source commands or a new permission gate.
6. **Bound new typed wire facts deliberately.** Shared canonical quantity
   representability must honor Decimal(38,6); source IDs use established128/160/191
   limits as appropriate. Existing historical unbounded facts need explicit overflow
   handling. Do not mutate historical strings, coerce/round quantities or silently
   trim price/option/source facts. Preserve Service/Inquiry semantics in section3.
7. **Keep model/card/receipt compact.** Model receives an exact proposal reference
   and concise non-authoritative summary, not multi-megabyte reviews or approval
   credentials. Current draft tool returns payload, so future full Quote completion
   needs a safe Quote-specific result projection. Use a dedicated authenticated
   Quote review component/transport, not the generic60row card as proof of full
   review. Keep new original receipt≤32KiB JSON with exact source/Quote/version/
   release/approval IDs and UTC provenance; full facts belong in protected originals.
   Do not embed60full reviews in every saved snapshot.

The64MiB aggregate and1MiB page numbers are engineering starting points from this
measurement, not universal safety/performance claims. Actual heap, native rendering,
DB timing, HTTP/proxy response and recovery tests must validate or tighten them.
Increasing this logical budget, or replacing it with a bounded canonical streaming
digest/materialization design, must not enlarge individual transport pages or
claim the Vercel payload cap disappeared.
Oversized persisted data remains a truthful refusal even after paging; no finite
budget can promise to carry schema-unbounded facts. Full source support/acceptance
requires explicit treatment of that case, not a narrower success claim.

### Concrete transport handoff

Proposed `draftRef` is an opaque authenticated server-owned identity plus monotonic
revision; it is not an approval token or raw business ID typed by a merchant.
`editDraftOption({draftRef, expectedRevision, optionId, option})` accepts one exact
option only when its encoded envelope fits the page budget. If a single valid
option is larger, use revision-bound line/field composition rather than lowering
100lines or silently dropping notes. An explicit finalize operation assembles the
complete20×100draft and runs the one canonical source validator. Stale concurrent
edits refuse; they never restore an earlier field or preserve old approval.

Proposed `readQuoteReview({draftRef, revision})` returns the small complete manifest
or a typed refusal; `readQuoteReviewPage({manifestId, pageId})` is an explicit POST
read under fresh persisted authority and exact scope. Pages carry full-digest and
revision provenance. Manifest counts include every option/line and all separate
authority/source/link/current-version facts; deduplicated references must resolve
within the same immutable review. UI renders every page/field and distinguishes
separate option totals. Confirmation remains one small proposal/revision/token
request and rechecks the whole canonical digest/authority before atomic execution.
No concrete API, draft persistence, approval-consumption policy or UI implementation
is supplied by this packet. Those contracts require independent source tests and
existing approval/execution gates; paging alone is not full acceptance.

## 6. Required independent validation

- Tests at each UTF-8/JSON envelope threshold±1, multibyte/escaping/surrogates,
  malformed huge raw body, long IDs/quantities, all finite optional fields and
  schema-unbounded persisted facts; no network needed for initial source tests.
- 20×100all fields,100source lines,100links, full source selections/current version/
  policy/team and suggestion coverage through actual source builder; no additive
  alternative totals, accidental field omission or silently dropped presentation.
- Complete manifest/page/scope/digest matching, deferred/blocked/changed source,
  pending edit/fresh review/explicit Confirm/retry/recovery. Full canonical command
  and receipt remain atomic; patching the draft never writes the business action.
- Actual app transport and real deployed limits, memory/transaction timing and
  device/browser large-review journeys under existing authorization. No provider,
  activation or connected QA permission is inferred from this measurement.

Brain/checklist/integration reconciliation remains root-owned. G01 human QA pause,
Paystack pause, D04 conditional cases, E05 rejected activation/restart, G04 deferred
checks, S05 retry and all existing signed/target boundaries remain unchanged.
