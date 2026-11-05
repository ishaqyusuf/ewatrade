# Marketing v15 implementation verification

Date: 5 November 2026. Scope: local marketing source and browser review only.
Owner-approved exact revision: `de2f9a33-56be-4bc5-a5f4-c18539494012`, direction
01 v15 in [the canonical Workshop](https://workshop.localhost/ewatrade/marketing/complete-business-2026-10-29/directions/01?rev=de2f9a33-56be-4bc5-a5f4-c18539494012).

## Delivered behavior

The active `launch-v4` now composes the centered serif hero, current Orders HTML,
prominent WhatsApp announcement and draft sequence, five-step How it works,
eight-feature overview, inventory and native illustrations, fourteen moving
business types, actual plan catalog, FAQ and expanded footer. Screens are
HTML/CSS/SVG, not screenshot assets or injected HTML. Native/offline availability
stays Coming soon. Workshop replay controls are absent from the product.

Route/experience selection, server signup policy, destination helpers, plan
catalog, allowlisted interaction analytics, theme persistence and public
AssistantFab remain the existing authorities. Examples do not submit orders,
record payments, send messages or create signed review links.

## Authors

Opus 5.5 at high effort authored scoped CSS, icons and bundled fonts before its
five-hour quota stopped the run. Codex confirmed process termination, preserved
that work, completed React integration and reviewed the result. Exact launch and
session provenance are in the implementation plan. No independent final review
is claimed.

## Checks

- Offline QA doctor: passed. Trusted local marketing service doctor: passed.
- `test:quick --plan --files <24 owned paths>`: no unknown mappings; groups core,
  web, domain and mobile (the assistant impact record selects all groups).
- `test:quick --files <same owned paths>`: passed; 259 tests across 53 files,
  1,679 expectations, QA-tooling types and scoped Biome. Unrelated Agent Chat and
  staged explainers were excluded. This is scoped source smoke, not full-checkout
  or release acceptance. The new verification document is documentation only.
- Marketing TypeScript: passed with `NODE_OPTIONS=--max-old-space-size=8192`.
  The initial default-memory run exhausted its 4GB heap; the final 8GB run passed.
- Five focused existing marketing suites: 18 passed, 210 expectations (signup,
  experience selection/policy, interaction metadata and shared pricing).
- H01 coverage snapshot: passed in local app mode. H02 assistant impact: passed;
  one client record, zero capability/procedure changes.
- Final changed TS/TSX Biome: passed. CSS integration formatting passed.
- Local browser at 1280x900, 390x844 and 320x844: no horizontal document overflow.
  Orders search filters and clears; mobile navigation opens/closes; theme changes
  and retained assistant panel work; real signup/contact/legal destinations were
  inspected without account or provider submissions.
- WhatsApp frame: 350x758 desktop, 288px wide on 320px layout; conversation content
  has no inner overflow. Intentional Watch the conversation restarts; the request,
  typing and draft stages finish and stop. No Play again/Replay/Preview motion
  controls exist in the implementation.
- Walkthrough: manual selection, feature deep links, keyboard Home/arrows, pause/
  resume and final Reports stop verified. At 320px report metric cells are 117px
  with equal client/scroll width. Motion hooks clean up timers/listeners, pause
  offscreen and on hidden documents; reduced-motion static behavior source-reviewed.
- Business animation pause sets both tracks to paused. Duplicate rows are inert
  and hidden from assistive technology. Native preview quantity, item-details and
  Proceed/back work locally; keyboard focus transfers and returns between steps.
- Pricing comparison and mobile-availability FAQ expand without narrow overflow;
  footer links and dark-theme assistant contrast reviewed.
- Review fixes included assistant token scope/contrast, demo restart wiring,
  focus transfer, quantity cap and client-directive ordering. Final fresh browser
  render succeeds after those fixes; no unresolved runtime error observed.

## Evidence and limits

Local preview: [ewatrade.localhost](https://ewatrade.localhost/).
Desktop screenshot: `/Users/M1PRO/.codex/visualizations/2026/11/05/01a1abb7-6541-7eb2-ae56-8b7e43e74579/marketing-v15-implemented-desktop.png`.
Raw local check logs: `/private/tmp/ewm-quick-final.txt`,
`/private/tmp/ewm-types-final.txt`. These temporary artifacts are not repository
assets. Opus log is retained locally; internal reasoning is not published.

`qa:smoke` currently covers authenticated Dashboard/Android existing-data sale
journeys, not the marketing landing. It was not misrepresented as landing-page
acceptance or run against unrelated merchant flows. Marketing acceptance used
focused CUA browser review. No native device acceptance, production build,
Preview/Production release, deployment, provider action or paid transaction is
claimed. Reduced motion was source-reviewed, not OS-emulated. Existing local QA
and Next development controls are runtime tools, not marketing design controls.

Brain impact: updated local `.brain/features/marketing-launch-v4.md`,
`.brain/tasks/2026-11-05-marketing-refinement.md`, `.brain/tasks/in-progress.md`
and `.brain/BRAIN.md`. They are ignored project memory and are not force-added.
API/database/permission/release documentation is unchanged because their behavior
is unchanged. Unrelated staged explainers and mixed Agent Chat history are preserved.

Implementation commit: `40761833d3d41948f299aec65e986f311e7c076b`. Workshop implementation receipt: `0306d64e-32d8-4f78-aec8-d6b3a4e1a276`.
Catalog read-back confirms status `implemented`, selected revision unchanged,
implementation count 1, and the exact commit above. Earlier directions/history
are retained. The subsequent documentation-only commit closes this record.
