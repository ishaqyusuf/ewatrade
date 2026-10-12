# Saved purchase review — category visibility repair required

Coordinator browser check, 12 October 2026. Existing QA saved chat:
`/assistant/c/cmv4i45w70000eb9kl7jkfa3e`, Bola Demo / Sweet Crumbs Bakery (Demo QA).
The structured presentation is committed separately in `969ee54d`.

Expanding the ten-goods **Stock and value** disclosure shows ten stock/value
rows, their before/after quantities and reservations. Missing opening costs
remain explicitly unknown; no opening cost is invented in the displayed review.
These are saved expired proposal facts, not a fresh canonical approval or a
newly executed purchase. The disclosure header says **100 new categories**.

Only 30 category names are exposed, ending at `qa direct signed 2-9`. The
remaining **+70 more** is plain text, not an expansion, link or detail target.
This is confirmed by the browser accessibility tree and source: API
`purchase-recording-presentation.ts` truncates chips at 30 and adds a label-only
count chip; dashboard `general-review-presentation.tsx` renders chips as plain
list items. The remaining names are omitted from this presentation.

The goods table has a working expansion; the category list needs an equivalent
reachable review mechanism or exact owning detail/pagination. Retain bounded
DTOs and make every category change reviewable, including its new/existing
status and affected good; the schema's current chip bound is 60, so simply
lifting the truncation to 100 does not preserve the contract. The implementation
owner repairs the presentation. This review does not remove historical
acceptance bookmarks or certify the new structured presentation as accepted.

After capture, the disclosure was folded again on the same chat URL. No send,
edit, confirm, model/provider request, business write or rollout occurred.
No new ticket or native acceptance; web acceptance remains 13/45 (28.9%).
The current native UI inventory advertises Android Studio, but no emulator or
Simulator surface. No device launch or native flow was attempted in this check.

![Saved purchase stock/value and bounded category list](/Users/M1PRO/Documents/code/ewatrade/artifacts/assistant-operations-parallel/S05/saved-purchase-stock-review-v1.jpg)
