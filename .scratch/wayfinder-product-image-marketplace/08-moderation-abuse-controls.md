## Parent map

[Wayfinder: Product Image Marketplace and Storefront Publishing](https://github.com/ishaqyusuf/ewatrade/issues/5)

## Blocked by

[Decide product image marketplace consent and licensing rules](https://github.com/ishaqyusuf/ewatrade/issues/6)

## Status

resolved

## Question

What moderation, abuse-prevention, and dispute controls are required before merchants can publish images into a marketplace other businesses can search and pay to reuse?

Resolve at least:

- Whether images are reviewed before listing, after listing, or only on report.
- What automated checks are required for prohibited content, copied/watermarked images, personal data, and misleading product imagery.
- How merchants report or dispute image ownership, unsafe content, bad AI refinements, or misuse.
- How marketplace listings are suspended, restored, hidden from search, or removed from already-created products.
- How token refunds, payout reversals, and support audit trails should work for disputes.
- What admin tooling is required for MVP versus later.

## Resolution

- MVP uses pre-listing automated checks plus post-listing report/review. High-risk or uncertain assets remain pending manual review before marketplace visibility.
- Automated checks: file type/size, perceptual duplicate hash, basic unsafe content, visible watermark/text, face/person detection warning, obvious personal data, low resolution/blur, and prohibited category tags.
- Merchants can report ownership violation, unsafe content, misleading product image, bad refinement, duplicate/stolen image, or inappropriate listing.
- Listing states: draft, pending_review, listed, hidden, suspended, removed. Hidden/suspended stops future search/purchase; already-created product uses remain unless dispute resolution requires removal.
- Disputes can freeze earned payouts and hold pending refunds until resolved.
- Token refunds and payout reversals are ledger events linked to dispute id and admin actor.
- MVP admin tooling: moderation queue, listing detail, source lineage, report list, hide/suspend/remove/restore actions, refund/reversal action, and audit log. Later: automated rights verification, reputation scoring, appeal portal, watermark detection providers, and bulk moderation.
