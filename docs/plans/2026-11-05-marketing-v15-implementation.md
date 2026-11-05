# Marketing v15 implementation

The owner approved implementation on 5 November 2026, with Claude Opus 5.5 at
explicit high effort implementing and Codex coordinating acceptance review.
Direction 01 v15, `de2f9a33-56be-4bc5-a5f4-c18539494012`, is selected in
[the existing Workshop](https://workshop.localhost/ewatrade/marketing/complete-business-2026-10-29/directions/01?rev=de2f9a33-56be-4bc5-a5f4-c18539494012).
This supersedes the design-only boundary of the earlier refinement packet. It
does not authorize deployment. Work remains in the current `main` checkout.

## Execution contract

- [x] Record the exact approved revision and handoff.
- [x] Implement the approved page in the current marketing application.
- [x] Review source, desktop/mobile rendering and working interactions.
- [x] Commit owned changes and record verified implementation in Workshop.

The four checkpoints describe delivery progress, not measured test coverage.

## Reference and boundaries

Target: `apps/marketing/src/app/page.tsx`, `marketing-page-view.tsx`, the experience
registry/policy, `experiences/launch-v4/index.tsx`, existing CTA, header, pricing,
assistant and static-section components. The route continues to resolve the
registered experience and server-derived signup policy. Account creation remains
owned by Dashboard; marketing does not introduce an account, business or payment
write. The public assistant retains its existing implementation and authority.

Midday reference: `apps/website/src/app/page.tsx`, `components/startpage.tsx`,
`components/footer.tsx`, and the section components under `components/sections/`.
The applicable pattern is a thin route composing focused landing sections and
isolated animation state, with product actions supplied by existing helpers.
The approved Workshop determines visual composition and EwaTrade domain copy.

The implementation stays under `apps/marketing`, with only needed self-hosted
fonts and licenses in public assets. Split illustrations, header/footer, motion
hooks and section composition by responsibility. No dependency or shared-package
change is required. CSS must stay scoped to the experience so legal/auth pages
retain their behavior. Retire obsolete imports from the active landing rather
than deleting historical experiences or shared product previews.

## Required behavior

Centered serif hero and Orders illustration; prominent WhatsApp entry; compact
five-step How it works replacing the old journey; eight-feature overview;
fourteen business types moving in two rows; preserved inventory/native/pricing/
FAQ coverage; expanded footer with actual support/legal links. All interface
illustrations use semantic HTML/CSS/SVG grounded in implemented screens.

Keep actual signup gating, login destinations, pricing/plan authority, analytics
and theme persistence. Native availability stays Coming soon. Product screen
examples never submit transactions, create signed review links or send messages.
Workshop Preview motion/Play again/Replay controls do not ship. Intentional
demonstration actions and accessible section pause controls remain.

Animation has one-pass WhatsApp and walkthrough sequences, manual keyboard
selection, reduced-motion static states, offscreen/hidden-document pausing and
effect cleanup. Business rows pause on their own hover area and by explicit
control; duplicate visual rows are hidden from assistive technology.

Dashboard table/sheet/form migration, URL-filter state, infinite querying,
virtualization, mutations and cache invalidation are intentionally inapplicable:
this is a public marketing page, not a new merchant operations workspace. The
existing assistant's form/command behavior is reused rather than migrated.

## Verification and conformance

Run offline doctor, scoped fast-source plan/check for every owned changed path,
marketing types and focused existing checks. Review current local marketing at
`https://ewatrade.localhost` at desktop and representative mobile widths, including
320px fit, navigation/theme, motion/manual selection, pricing, FAQ and CTA/link
destinations. No account submission, provider send, fixture creation or release.
Native illustrations are marketing examples, not native-device acceptance.

Final conformance requires every applicable item above, no unintended route or
domain boundary change, exact revision/commit linkage, and honest test limits.
Record results in the implementation receipt after review; source presence alone
is not verification or live availability.

## Authoring and review outcome

Claude Code 2.1.318 started the exact `claude-opus-5-5` model with explicit
`--effort high` (session `e904d7c6-3b18-4b16-acfe-c958695a9b2b`; returned model
metadata verified). Opus prepared scoped styles, named SVG icons and font assets,
then stopped at its five-hour usage limit. Its process exited before takeover.
Codex preserved those artifacts and completed the React sections, integration,
accessibility repairs and final review under the owner's standing fallback rule.
No model substitution or effort downgrade occurred. This is mixed authorship;
the final acceptance review is coordinator review, not an independent Opus review.

See [verification](../verification/2026-11-05-marketing-v15-implementation.md).

Implementation commit: `40761833d3d41948f299aec65e986f311e7c076b`. Workshop implementation receipt: `0306d64e-32d8-4f78-aec8-d6b3a4e1a276`.
All four delivery checkpoints are complete; no deployment was performed.
