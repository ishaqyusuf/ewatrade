# Web signup and setup refinement

Owner confirmed web signup and setup first, preserving existing steps/rules and
aligning with the approved marketing page. Native UI and product implementation
are outside this design delivery. Marketing Production release remains pending
at the owner's request; no push, deployment or release worktree was made.

Canonical Workshop: `ewatrade/dashboard/owner-signup-redesign`, direction 02.
Implemented baseline: v2 `a9b4a59d-4c63-4159-b555-4332ca0b69c5`, implementation
record `152962b1-8bc8-49ff-b2f8-c7e885574e7e`. Keep v3/all other directions.

Author: Claude Opus 5.5 with explicit high effort. Codex coordinates and reviews.
The standing bounded takeover policy applies if unavailable or blocked.

Preserve the full Account, Code, Business type, grouping and per-business Store
flow. Refine hierarchy, form rhythm, preview usefulness and responsive layouts.
Use real HTML/CSS/SVG and existing source fields, no generic placeholder screens.
The visual reference is marketing v15: white/paper, ink, restrained serif display
and clean sans controls. Account/Code should feel quiet; complex setup gets room.

Review desktop, 390px and 320px, one full synthetic path, multi-business controls,
validation/provider-off states, keyboard focus and narrow containment. Publish
one immutable revision under the same direction; do not select or implement it.

Known policy-copy mismatch: current signup preview says Starter/three items,
where marketing shows Free/ten. Record this outside the design canvas and preserve
runtime policy; no billing or entitlement decision is authorized by this refinement.

## Source review findings

- `owner-signup.ts` still models Starter/Growth/Pro for setup. Marketing's
  `marketing-offers.ts` explicitly separates approved offers from runtime
  entitlement/billing rollout. This is a policy reconciliation issue, not a CSS fix.
- Live local `/signup` is usable at 390px with 48px fields and no horizontal
  overflow. The visual problem is hierarchy/density and the generic preview,
  not a need to shrink the touch targets.
- The implemented frame contains a large green pane and a placeholder catalog.
  Refine it into a useful summary of entered business details. Current Home
  continuation, provider/Terms gating and saved draft behavior remain source truth.
- Exact Opus model metadata verified for session
  `ab9b42d3-2521-44a0-9267-3fd2bb4704eb`; launch passed explicit `--effort high`.

## Review delivery

Direction 02 v5 `4cc2151f-74ab-42bc-a7fe-74d7a4ba78a4` is ready for owner review.
Opus authored and corrected the compact link-status layout; Codex performed
browser review. The independent reviewer scored its single requested correction
resolved. Existing implemented v2 selection is unchanged. No product integration
is authorized by publication. See the [verification record](../verification/2026-11-05-web-signup-refinement.md)
for tested behavior, source hashes, prototype limits and Brain impact.
