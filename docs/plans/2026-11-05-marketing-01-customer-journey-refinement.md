# Marketing 01: customer journey refinement

Owner request, 5 November 2026: use Whole Business (01) with From First Hello's
journey (02), improve phone/dashboard sizing, and show the revised Workshop before
implementation. Later corrections require pure HTML based on current implemented
screens, animated WhatsApp, and a stronger marketing entrance instead of a dry,
uniform sequence.

## Review authority

[Review 01 v15](https://workshop.localhost/ewatrade/marketing/complete-business-2026-10-29/directions/01?rev=de2f9a33-56be-4bc5-a5f4-c18539494012).

- Base: 01 v3, `5f80f3ab-3276-4e9b-87bc-fe4956691e00`.
- Journey: 02 v1, `e9b696fd-5d43-47ac-abb5-a51e5a37cd1e`.
- Delivered: 01 v15, `de2f9a33-56be-4bc5-a5f4-c18539494012`.
- Source: existing shared Workshop collection, `refinement-2026-11-05/`.
- Earlier revisions and directions 02–05 remain. No selection or implementation.
- Current checkout only; no worktree, product source changes, push or deployment.

## Final design contract

Keep 01's white/ink identity and 02's five-step journey: discover the store, agree
price/scope, fulfil, record payment, understand. Preserve stock, catalog, staff,
finance, assistant, pricing and FAQ coverage. The latest feedback changes the
marketing hierarchy: WhatsApp appears immediately after the overview, in an ink
section with large Cal type and the existing WhatsApp brand green. A top discovery
banner and main-navigation link make it findable before scrolling.

Headline: “Your business. On WhatsApp.” Benefit: “Turn a message into an order
draft.” The animated conversation supplies the evidence. Three steps explain the
request, draft review and explicit approval. There are no invented launch dates,
customer endorsements, adoption counts or claims of automatic saving.

Interface illustrations use HTML/CSS/SVG with no screenshots. Orders follows
current Figtree/Stone/Emerald components and existing QA Orders/ORD061 evidence.
Quote, order totals, Finance, Reports and Inventory use current component structure.
Mobile follows Classic/Green Till sale/item screens, including the floating search
footer. These are bounded rendered excerpts with representative data, not new
product screens or a claim that every scene is one continuous transaction.
Native mobile/offline remains Coming soon.

WhatsApp uses the current compact review-links renderer, including the draft
summary, review link, expiry and Cancel draft. The link is inert. No message,
transaction, account or signed review link is sent. The phone is 350×758 CSS px on
desktop, based on 390×844 reference proportions; there is no universal WhatsApp
handset size. At 320px landing width it is 288×785 to preserve readable text.

## Motion versus review controls

The intended production animation plays once on entry and stops at the reply.
Reduced-motion users see the static exchange. The owner explicitly confirmed
that Play again/Replay should not appear in implementation. Those controls now
live in a collapsed fixed “Preview motion” Workshop tool, outside the marketing
composition, and must be excluded from product implementation. “Watch the
conversation” is a deliberate product demonstration action.

## Authorship and review

Requested author: `claude-opus-5-5`, explicit `high` effort. Two exact launches
failed with API 400 client-compatibility errors, including a bounded retry after
the official client update to 2.1.318. Neither authored a design. Codex took over
under the owner's standing fallback. No alternate Claude model or lower effort
was substituted.

Independent reviews of the earlier source-grounded revision found invented
navigation, inventory field/order issues, native line/action fidelity and WhatsApp
reply/playback issues. Corrections are retained. The last mechanical review found
mobile Orders search counted cards hidden by position; fixed and exercised.
Later reviewer follow-ups hit capacity, so the final announcement's rendered
review is by the coordinator, not an unreturned independent approval.

[Eight official references](../research/2026-11-05-marketing-mobile-design-references.md)
inform composition and motion; none are claimed to use pure HTML. Workshop,
Impeccable, Copywriting and Thread Status were used. No new product dependency.

## Acceptance evidence and boundary

The [receipt](../verification/2026-11-05-marketing-refinement.json) records exact
source hashes, catalog preservation, viewport/interaction checks and limitations.
The immutable design is ready for owner review; accepting this review deliverable
does not implement the product or authorize deployment.

## Later owner direction: Midday composition

The owner explicitly requests Midday's hero, How it works, complete-business
overview, moving rows adapted to business types, and footer. The old “A customer
starts it” section is replaced, not duplicated. Final v15 uses a centered Hedvig
Letters Serif hero, one CTA and large actual-UI canvas; a compact five-step animated
walkthrough with selectable/keyboard states; eight linked capabilities; fourteen
source-backed business types in two moving rows; and a multi-column footer with
existing product/legal links and a large EwaTrade outline wordmark.

Business motion supports pause/resume, hover, reduced motion and offscreen/tab
pausing. Walkthrough runs once through the five scenes and supports pause/manual
selection. Its small pause control and the business-row pause are accessibility
controls; the separate Preview motion Play/Replay tools remain Workshop-only.
Hedvig font files are bundled from Google Fonts with the SIL OFL; no competitor
media is copied. Final receipt separates reused checks from the final corrections.
