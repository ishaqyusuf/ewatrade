# Prepared booking commands, media contracts and exact stock time

15 October 2026. Source checkpoint for phases 7, 9, 11 and 12; parent acceptance
remains **13/45 (28.9%)**. Full phases 4–12 objective and every existing gate remain.
The accompanying JSON records exact hashes and actual test/type evidence.

## Canonical booking transaction composition

The existing native hold, confirmation and revision wrappers now delegate to
caller-owned transaction cores with their original lock order, hashes, replay
ordering, transaction options, financial/work effects and projections. Prepared
staff commands cover hold, confirm and all six lifecycle operations: arrive,
start, complete, cancel, mark no-show and reschedule. Token allocation and contact
protection run outside transaction callbacks; opaque handles retain copied data,
not a transaction, delegate or callback. Confirmation inspects the original active
hold and exact contact/consent revision, then rechecks that basis before execution.

Every prepared commit requires the caller's current actor/Tenant/Store, compared
with the captured scope before transaction access, followed by fresh persisted
native member/attendant and Store-grant authority. Independent review found and
closed the missing caller-scope check. Staff commits use a fresh server clock.
The trusted ordinary native callback path remains at its existing location;
only the new prepared path promises outside-transaction contact preparation.

Pure exact-effect readers recover immutable hold/event facts under current read
scope without replaying commands or requiring current new-booking eligibility.
They disclose no customer capability token, digest or contact ciphertext. Saved
event outcomes remain distinct from later booking state and notification delivery
is unverified. The outer GENERAL composer must still save its proposal receipt
atomically, inspect terminal receipts first, and own post-commit notification
dispatch/recovery. Native command replay alone is not original proposal recovery.

This checkpoint pins lifecycle `0bddf1b4…`, before the subsequent pure-review
extraction now in progress. That newer work requires a separate frozen review;
this report does not certify moving source by reusing the older hash.

## H04 contract primitives

Strict media citations bind exact original message/part or attachment generation,
content/extraction digest, location and quoted UTF-16 spans. AUDIO completeness
is unknown and always needs field review. PDF missing, scanned/unreadable or
whitespace-only original pages yield partial coverage even if the extractor did
not set its truncation flag. Independent review found and closed that PDF issue.
Current GENERAL admits AUDIO/PDF semantics and IMAGE presence only; CSV/TEXT and
image fact extraction remain unavailable. Opaque native target IDs survive
non-ASCII/punctuation through the existing 191-character ceiling.

Field-review/acknowledgement and bounded-plan schemas are **claims and shapes**,
not authentication or proof a person approved anything. Existing 500×48 stock
inputs retain all fields; the ten-step whole-plan ceiling refuses overflow
without clipping. Each step keeps its own proposal/receipt; unknown/executing
steps require original-identity recovery before further work. No blanket plan
approval, automatic execution or offline command queue exists.

Durable metadata/storage/signatures, fresh source resolution, retained app
transcript Use/Edit binding, measured byte admission and complete review paging,
per-step orchestration, all ten planned media-domain wrappers and actual client
journeys remain required. Existing upload/STT/provider/recorders are reused;
generic upload compatibility does not complete H04. The separate voice roadmap,
native design-only correction and launch gates remain. The runbook's historical
`ASSISTANT_VOICE_ENABLED` instruction does not describe an enforced current API/
jobs kill switch; current code uses provider/storage/current-authority checks.

## Stock time correctness

Receive/adjust now validate pending times before scope, locks or effects using
one shared exact Date parser. Nonzero digits beyond milliseconds refuse instead
of silently becoming a different native instant. Exact representable UTC text
is preserved, including further zero digits. Invalid dates, rollovers, implicit
timezones, offsets and missing seconds refuse. Omitted time is filled during a
new review. Historical stored action schemas remain unchanged so completed
receipts can still parse before pending execution validation. UI repair belongs
to the existing Claude stock job and is separately reviewed, not accepted here.

## Actual validation and open exits

- Booking cohort: **71 tests /611 assertions**, including the actual native
  wrappers and all prepared commands against explicit inert delegates.
- H04 plus shared stock time: **24 /149**; actual API stock adapters: **3 /37**
  in a separate process. Combined disjoint total: **98 /797**.
- Independent focused booking 16/317 and H04 21/120 overlap these suites and are
  not added. Twenty owned files are Biome clean.
- Combined compiler: 184 explicit entries; exit 2 with **78 imported baseline
  diagnostics, zero owned diagnostics**. All eight new errors were repaired;
  all 78 remaining file/line/code/message tuples exactly match the prior log.
- H01 regenerated/current. H02 impact records and Brain reconciliation accompany
  this packet; local mixed-checkout gates do not prove hosted CI acceptance.

No SQL locks/isolation/rollback/concurrency, authenticated HTTP, native-device,
saved connected, provider or production acceptance is inferred. No Prisma,
migration, DB push, provider call, model/OTP/customer send, activation, restart,
deployment, staging, commit or push was performed for this checkpoint.

Full G03 disposition/logistics proposal packets now specify actual event/model
fragments, the legacy Quote-accept source-CAS race, all completion writers and
privacy/cutover choices. They are Markdown only, not a migration or applied
schema. The exact non-production target question remains unanswered; C04's
transfer target and shared local profile cannot be substituted. Full booking
integration is mapped in the sibling GENERAL booking proposal. No product
policy choice or prior execution stop is resolved by these preparation packets.

- [x] Canonical prepared booking commands and exact effect readers.
- [x] Media/plan contract primitives and PDF coverage repair.
- [x] Exact backend stock-time validation and historical parse compatibility.
- [x] Focused independent review, tests, type repair and source documentation.
- [ ] Full GENERAL/channel composition, source/plan durability, all clients and
  original saved/persisted/concurrent/device acceptance.
- [ ] Original phases 4–12 parent exits; no acceptance milestone added.
