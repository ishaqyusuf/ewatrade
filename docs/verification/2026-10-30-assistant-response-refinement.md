# Assistant response refinement verification

Run `2026-10-30-assistant-response-refinement`, completed 30 October 2026.
Workshop refinement: 5/5 checkpoints. Product implementation/release is separate.

## Artifact and scope

- Final: [Assistant review, direction01 v24](https://workshop.localhost/ewatrade/assistant/review/directions/01?rev=488b4b4d-03b1-4b48-8383-a14536204d2f&screen=index.html),
  revision `488b4b4d-03b1-4b48-8383-a14536204d2f`.
- Intermediate v23 `f5357b12-be72-44d1-a619-48ddaf0c88ce` remains immutable.
- Frozen Current baseline: v22 `7363d5ed-659b-4c0b-93a4-4bb9546d5576`.
- Refined is a proposed design under ARP-1 (`ewatrade.assistant.copy-refine`, v1).
  It preserves the existing HTML design, controls, 329 scenes and source provenance.
- This is a Factory-only comparison. Product source, canonical WhatsApp case
  versions, private phone-review Site, selection, implementation and release are
  unchanged. Adopting canonical WhatsApp changes still requires its normal exact
  case-version and private Site lifecycle.

Claude Opus 5.5 authored the candidate with explicit high effort, session
`a3d7e3be-23ac-47bc-b184-e43acf445698`. Codex supervised, corrected acceptance
issues, published and checked it. No worktree or model substitution was used.
The author started an unsupported headless extraction step; Codex stopped that
run and its owned browser, confirmed both stopped, then resumed the same model
with source-only checks. That extraction is not acceptance evidence. Browser
acceptance below uses the Codex in-app browser.

## Copy and factual checks

The static audit covers all 329 scene IDs: 8 source-port, 49 captured formatter,
54 source-derived, 7 authored, 53 existing HTML presets, 2 banking and 156 WhatsApp
cases. It exercises 541 product scene/channel/state views. All 776 generated
mobile/Dashboard Current HTML views match the frozen v22 product renderer exactly;
Refined views pass text, control-identity and factual checks. These are source
render checks, not 776 independent browser tests.

The 156 WhatsApp case histories retain all 409 versions. Latest-case proposals
load their actual source snapshots, rather than substituting S18 for older ones.
61 hash-guarded field edits and one repeated-line rule produce 63 edited S18 bot
messages; 82 protected, 254 already concise and 15 reviewed/retained messages are
kept. Those categories count unique S18 messages, not edited cases. Per-case
reachable-node counts and exact source versions are in the archived audit data.

Source helpers and retained audit live under the shared Workshop work folder's
`refine/`; the published direction includes policy/transforms, guarded copy data
and the audit report in `data/refine-audit.js`. No generic truncation or model
rewrite pass is applied to raw user input.

Focused coordinator checks establish:

- All 49 capture inputs / 85 cards remain unchanged; Refined has no fetched-page
  count filler. Selected checks preserve missing units, unavailable prices/totals,
  credit/refund/payment distinctions, cross-currency amounts and continuation.
- Known-zero and unavailable account balances remain distinct. A failing check
  caught missing structured account names/amounts in compact WhatsApp; the fix
  renders account fact lines and extends the retained audit to check them.
  Record-choice rows also remain visible.
- WhatsApp copy edits preserve money tokens, user messages, choices/keys, inputs,
  flows and protected code/legal/STOP/control nodes. S18 has zero stale edits;
  other snapshots safely retain entries whose original text does not match.
- A browser check found an imported report's additional dynamic fetched-detail
  count. Two exact-template rules remove it while retaining actual aggregate
  counts, amount and the existing Next page control.
- All 118 files in the frozen v22 archive remain unchanged. Its raw captures and
  47 vendored WhatsApp history/blob/viewer assets remain byte-identical in the
  candidate. The banking copy differs only by an adapter tag; old archives are
  untouched. All final archived files match the working direction source.

## Measured reduction

| Defined corpus | Current words | Refined words | Reduction |
| --- | ---: | ---: | ---: |
| Primary card copy | 8,300 | 2,270 | 72.7% |
| Cards including Details | 8,300 | 3,665 | 55.8% |
| Product-scene WhatsApp replies | 8,285 | 2,658 | 67.9% |
| Narration | 75 | 42 | 44.0% |
| Proposal review/receipt copy | 2,706 | 2,179 | 19.5% |
| Edited WhatsApp case fields | 1,985 | 1,610 | 18.9% |
| Audited existing HTML/banking phrases | 867 | 469 | 45.9% |

The tokenizer counts letter/digit word units. Card counts include visible title,
value, description, fact/warning/continuation lines, record/account rows and scope/
as-of markers; Details is separate. The last two corpora count edited phrases,
not every message in those channels. These reductions are not latency, model-token
savings, factual completeness percentages or whole-product coverage claims.

## Execution and browser evidence

- `qa:doctor --offline`: pass, no connected probes.
- Owned-document `test:quick --files`: QA tooling types plus 47 tests / 195
  assertions pass. Concurrent application/DB work is explicitly excluded.
- `python3 build.py --strict`: final pass, zero warnings/failures. It builds from
  frozen v22 and reports drift without re-stamping captures or coverage.
- 18 owned JS files plus 2 inline scripts pass syntax checks. The final changed
  adapter also passes syntax/build checks after the report-copy repair.
- Coordinator capture/fact, structured-channel and WhatsApp-control checks pass.
- In-app browser v23: Refined/Current restores the original page-count wording
  only under Current; unsent app composer and editor values survive wording,
  theme and compact-size changes. Details opens the secondary original variant.
  Config collapse/reopen and variant-aware scene links work.
- The local order edit preserves quantity4, Pack, price2000, cash and note through
  wording changes. Save draft produces the correct ₦138,000 review, still requiring
  Confirm; cancellation works. No real order/payment/stock command is called.
- Two draft notes on the same scene/state export separately as Current/Refined,
  with exact factory revision, baseline, policy and effective wording. This was
  exercised on v23; the relevant library, product and policy assets are identical
  in v24. Browser notes remain memory-only exports, not a shared approval inbox.
- Final v24: imported item-sales report has no fetched-detail count, retains
  ₦3,563,250 and Next page; compact WhatsApp balances show Cash till Yaba
  ₦125,000 and GTBank ₦0/Paused. Banking Current/Refined switches in place and
  preserves ₦15,000 plus Create link. A latest o-hello V4/S13 case loads correctly;
  its shortened How it works explanation and unchanged choices work on the direct
  archived HTML. Its historical V1 switches to the original S1 viewer.
- The browser automation mis-targeted a control inside the second nested WhatsApp
  iframe; the temporary direct archived tab was used for that interaction check
  and closed afterwards. Nested replay rendering itself is verified.
- No warning/error console entries were captured. The final refined Dashboard
  example matching the owner's screenshot is left open.
- v23→v24 changes only `shared/refine-dom.js` and generated
  `data/refine-audit.js`; unchanged v23 UI evidence is reused, with a targeted
  final report check.

Shared H01 `assistant:coverage --check` still reports the preexisting stale
coverage snapshot; it was not regenerated over concurrent owners' work. Own
planning commit af36359d passes H02 with no gated change; final owned-document
commit scope is checked separately. No deployment or product acceptance follows.

## Boundaries and limitations

The manifest and Dashboard chat source have drifted since v22. Source and
`refine/live-coverage.json` disclose that drift; this comparison stays pinned to
v22's 165 capabilities / 373 declared mappings, including 76 planned/unpreviewed
pairs and 4 no-answer-card pairs. It does not add missing product capabilities.

Refined WhatsApp product replies are proposed compact rendering and omit Details;
Current retains exact captured replies. Older WhatsApp case versions always replay
Current; notes distinguish requested and effective wording. Switching wording
reloads a WhatsApp case frame and clears its unsent local composer; that limitation
is recorded rather than counted as retained-draft acceptance. App composer/editor
and existing HTML/banking inputs retain state. This task changes review wording,
not those canonical channel flows or persistence rules.

The shared Workshop source is intentionally ignored by Git and retained through
immutable catalog revisions. Repository commits contain policy/evidence; Brain
feature/task records remain local-only. Other agents' staged/source changes were
preserved.
