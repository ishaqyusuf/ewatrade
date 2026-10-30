# Assistant response refinement

Owner request, 30 October 2026: refine all responses in the existing HTML Workshop
with less description and remove wording such as “X on this page.” This delivers
reviewable proposed wording across Dashboard, mobile and WhatsApp. Product code,
provider behavior and release state are outside this delivery.

## Baseline and review

Continue `ewatrade/assistant/review`, direction `01`, from v22
`7363d5ed-659b-4c0b-93a4-4bb9546d5576`. Keep all 329 scenes, state navigation,
working local flows and prior revisions. The new immutable revision defaults to
Refined wording and offers Current for comparing the same scene/state/channel.
Current means the frozen v22 baseline; it is not a new product-source capture.

Proposed output must not be presented as exact captured production output.
Original captures, source anchors and case versions remain available. Share URLs
and review exports include the wording variant, baseline and refinement policy.
Draft notes from different variants/reviewers remain separate.

## Policy ARP-1

Technical identity: `ewatrade.assistant.copy-refine`, version `1`.

1. Lead with the result or the next required action. Let a useful card answer the
   request without a second prose summary.
2. Remove generic introductions, tool narration, repeated reference names and
   explanations that do not affect interpretation or action.
3. Remove fetched-row narration: “X on this page”, “X in this page”, and “X of Y
   records shown”. Show rows directly; use a clear empty result when none match.
   Disclose continuation once when more results exist. Preserve real aggregate
   counts when the count answers the question.
4. Preserve exact amounts/currencies, quantities/units, parties, record identity,
   material dates/scope, unknowns and payment/credit/refund distinctions. Never
   infer a unit, settlement, stock effect, conversion, consent or business total.
5. Keep material warnings, required fields, confirmation, stale/refused states
   and recovery steps visible. Put secondary provenance in a working Details
   disclosure when it helps; avoid repeating it below every card.
6. Use short, natural WhatsApp messages while retaining actions and typed reply
   fallbacks. Preserve legal/identity/proof/OTP/STOP semantics and exact tokens.
7. Do not rewrite user messages or unsaved form input. Do not shorten by arbitrary
   truncation or by deleting every number, qualifier or warning.

Example: the missing-unit order line keeps “Inspection visit”, quantity 2,
“Unit not recorded” and ₦2,000. The empty payment section says “No payments
recorded.” Repeated offering names and stock/conversion lectures are removed from
primary content. Relevant underlying source facts remain inspectable.

## Complete review scope

Audit all library scene kinds and their supported response states: captured
formatter cards, source-derived/ported cards, authored messages, imported as-built
HTML, banking designs and the 156 WhatsApp cases. Record actual edited,
already-concise and protected content; a scene count is not proof that every
sentence was improved. Keep existing planned/missing preview classifications.

Use semantic data transforms and explicitly reviewed copy mappings. Any rendering
adapter for reused HTML must be narrow, idempotent and avoid inputs, user bubbles,
URLs, IDs and structural navigation. Preserve local form controls and the
Workshop sandbox; native form submission cannot be required by this viewer.

This Factory-only proposal carries stable WhatsApp case ID/source version plus
factory revision/policy provenance. It does not alter canonical conversation
versions, selection or the private phone-review Site. Adopting a changed canonical
WhatsApp conversation must follow the existing implementation standard: append
its immutable case version, publish canonical Workshop first, then mirror that
exact content to the existing private Site. This proposal does not imply that
adoption, human approval, implementation or release has occurred.

## Acceptance

- All 329 scene IDs and 156 case histories remain accessible.
- Refined removes page-count filler and reduces a defined response-copy corpus;
  facts and material warnings remain correct, with no blank/contradictory cards.
- Current preserves frozen captures and original replays; historical assets are
  immutable. Metadata distinguishes original output from proposed copy.
- Wording/share/note identity works with existing state/theme/size/reset controls.
- Focused static checks and representative browser comparisons cover a partial
  list, missing-unit/payment example, changed local review, reused HTML and
  WhatsApp. Reuse unchanged evidence; no product service or business write needed.
- Publish the exact new revision, record evidence and commit owned repository
  documentation. Workshop assets are archived by the catalog; Brain stays local.

## Delivered candidate

Direction `01` v24, `488b4b4d-03b1-4b48-8383-a14536204d2f`, is the final
review candidate. v23 remains an intermediate immutable revision. Refined is the
default; Current retains the frozen v22 output. Historical WhatsApp versions
always use their exact Current replay; exported notes record requested and
effective wording. [Verification](../verification/2026-10-30-assistant-response-refinement.md).
