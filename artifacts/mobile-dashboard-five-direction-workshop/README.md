# EwaTrade Android Home: five-direction workshop

Review-only Classic Android Home study, delivered 2 October 2026. Market Day is excluded. Production source and design selection are unchanged.

[Comparison board](https://ewatrade-home-workshop.localhost/) · [01](https://ewatrade-home-workshop.localhost/#direction-01) · [02](https://ewatrade-home-workshop.localhost/#direction-02) · [03](https://ewatrade-home-workshop.localhost/#direction-03) · [04](https://ewatrade-home-workshop.localhost/#direction-04) · [05](https://ewatrade-home-workshop.localhost/#direction-05)

## What to review

Light/Dark changes all five board previews. Explore opens paired 390 × 844 phone previews. Scroll inside each phone. Business state applies comparable facts across directions. The 200% control doubles phone typography and activates vertical reflow.

| Direction | Hierarchy and composition | Best fit | Tradeoff |
| --- | --- | --- | --- |
| 01 Clear Counter | Next action, compact facts, quiet revenue row, orders, utilities | Everyday owner Home | Less immersive than 02; secondary setup stays below the fold |
| 02 Order First | Brand action panel, secondary totals, utility tiles, activity | Repeated order entry | Summary/setup receive less emphasis |
| 03 Quiet Ledger | Flat ruled label/value rows and direct utilities | A restrained owner overview | Less warmth and setup guidance |
| 04 Guided Start | Setup path with one expanded current step; returning mode removes the sequence | First-time setup | Requires a distinct returning composition |
| 05 Order Desk | Records lead; facts live in Store snapshot | Reviewing recent orders | Revenue/readiness need a disclosure |

**Recommendation: 01 Clear Counter.** It balances action, real business facts and recent records, with the least extra navigation. 02 suits frequent selling; 04 is strongest when onboarding is the deciding priority. No option is selected for production.

A star records temporary workshop interest. Reset clears local orders/items, drafts, filters, invitation acknowledgement, favorite, text scaling and board theme. It keeps the current detail route.

## Native reference provenance

All three PNGs were viewed before designing. Five available PNG/XML files are archived under references/, with source paths and SHA-256 hashes in references/manifest.json.

- Primary: B05-current-qa-state.png and matching XML.
- Supporting loaded Home: 17-current-session.png and matching XML.
- Supporting loading Home: 16-auto-renderer-session.png. No matching XML existed at the provided source location.

The primary Light Android QA Owner capture shows Ishaq / Jawdah, Switch Business, Catalog Ready, Recent orders 0, Recent revenue R0.00, setup tasks and the recent-orders empty state. Navigation is Home / Orders / Create / Products / More. Its bell-shaped header action is **Open sync status** in the actual XML, so the preview uses a sync icon and accurate accessible name. The other action is **Open global search**.

The studies use restrained Android status/gesture chrome. Browser artwork is not a fresh native screenshot.

## Comparable business states and actual data meaning

1. **Ready / no orders:** observed reference facts, R0.00 across loaded orders. Actual item names are unknown.
2. **Catalog not ready:** explicit onboarding fixture, zero orders/value. Add a local item to enable first-order entry.
3. **Established:** explicit local fixture, Sample customer A / Consultation / R450.00 and Sample customer B / Setup service / R250.00. Two loaded records, R700.00, Catalog Ready. Fixtures are labeled outside the phone.

The workshop sums exact integer minor-unit order values and caps its loaded list at eight records. It demonstrates Home transitions rather than checkout. Typed strings are escaped; invalid values with more than two decimal places are rejected.

Inspected production controller: apps/mobile/src/components/mobile/dashboard/operations-dashboard-screen.tsx.

- Orders query requests limit 8.
- Recent order count is loaded rows plus provisional commercial orders.
- Recent revenue sums order.totalMinor across loaded rows. It is not all-time/period revenue, profit or money received.
- Queued count and queued value are distinct. The connected fixtures contain no provisional orders.
- Catalog readiness means hasActiveSellableItems, not a Product or stock count.
- Established production overview may show **Stock balances**, **Active work** or **Catalog** based on real capability flags. Their values retain their ledger/work meanings.
- Operational actions adapt to Products, packaged stock and Services: Receive/adjust stock, Transform stock units or Manage service work.

The study holds catalog readiness constant for comparison. Implementing a selection must carry the conditional overview metrics and operational actions into the summary/utility slots. Do not substitute Product counts for stock-balance rows. The guide marks catalog/first-order progress; team invitation remains optional.

## Bounded local interactions

Order creation updates the active direction’s count, loaded value and recent list. Light/Dark for one direction share data; different directions stay isolated. Add item changes readiness. Orders / See all opens the local list; records open detail. Search filters the active direction’s local records. Team invitation creates an acknowledgement without sending. Switch Business shows only the known Jawdah identity. Sync remains the connected reference state.

05 All loaded / Latest changes the visible slice while totals remain scoped to all loaded rows. Store snapshot discloses readiness and revenue. Order drafts survive close/reopen; Reset clears them. Dialogs have modal focus, Escape dismissal and opener focus return. Favorites expose pressed state and remain review feedback.

Real domain forms, routes, permissions, auth, offline replay and backend mutation behavior stay production-controller responsibilities.

## Native implementation handoff after selection

Keep operations-dashboard-screen.tsx as behavior/data owner and use its shared presentation contracts. Change the Classic presentation in apps/mobile/src/components/mobile/appearances/classic/dashboard-screen.tsx, composing reusable primitives in dashboard-kit.tsx. Keep routes and the appearance resolver shared under ADR-0042. Use native components rather than copying the HTML.

Reusable pieces: identity/business header; scope-aware summary including conditional live metrics; next-action region; task/utility rows; recent-order rows; optional summary disclosure or guide; existing Create chooser and shell navigation callbacks. Props continue to own loading, unavailable, disabled and permission states.

Use NativeWind className for layout and semantic colors such as bg-background, bg-card, text-foreground, text-muted-foreground, bg-primary, text-primary-foreground, bg-accent and border-border. Never combine style and className on one native element.

useColors() in apps/mobile/src/hooks/use-color.ts resolves THEME through the existing observable theme runtime. THEME imports BRAND_THEME; nativewindThemeVars() maps the same values into Tailwind variables. Use useColors at native boundaries such as icon color props and navigation properties. Do not create another palette or theme state.

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | #F3F4F5 | #111715 |
| Card | #FFFFFF | #1B2320 |
| Raised/muted surface | #F6F7F7 | #232E28 |
| Text | #182420 | #F0F3F1 |
| Supporting text | #626D69 | #AAB7AF |
| Action | #17684F | #8CD5B5 |
| Action text | #FFF9ED | #10271D |
| Soft accent | #ECF3EE | #26372D |
| Rule/border | #DCE2DF | #3D4A43 |

If 02 is selected, define heroSurface, heroForeground, heroBorder, heroAction and heroActionForeground once in the shared theme and map them through NativeWind. Its preview uses brand green in Light and a deeper green surface in Dark, with explicit foreground/action contrast. 03 uses canvas as its flat surface, leaving unrelated component colors intact.

Reuse current loading, unavailable, offline-unknown and query-error presentations. Never flash Ready / 0 / R0.00 as results while queries are loading. The supporting loading screenshot documents that distinction. Give essential scope labels full multiline space.

## Accessibility and verification

100% is the visual target; 200% is a browser typography study, not proof of Android font scaling or TalkBack.

Native implementation must use useLargeTextLayout() at the existing fontScale >= 1.5 or effective-width threshold. Stack fact/header columns; let names, values and actions wrap; grow rows; preserve body/value font scaling; keep content reachable above safe-area navigation. Navigation retains the shared bounded-label policy. No essential information depends on horizontal swiping.

Minimum 48-point phone button targets, text status, clear gated-action reasons, visible keyboard focus, readable Light/Dark and reduced-motion support are included. Selection requires later native 100%/200%, long-value/business-name, TalkBack, Android Back, sheet-footer, permission and offline acceptance.

Evidence in evidence/browser-qa.json records:

- Five successful order creations with count/value changes and isolation.
- Five setup unlocks and five populated checks, both records and R700.00.
- Thirty 200% theme/state previews, zero horizontal overflow and zero buttons below 48 points.
- 390 × 844 browser check, no page/phone horizontal overflow.
- Lower-action reachability, search/detail, draft retention/reset, decimal validation and safe literal input.
- No captured console errors/warnings.

Initial target checks found 44-point 05 filter controls; they were enlarged to 48. Currency formatting was corrected to the reference’s R0.00. Full-page pairs were captured after painting the lower viewport so bottom navigation is present.

Screenshots: board-light.jpg, board-dark.jpg, board-onboarding-light.jpg, board-onboarding-dark.jpg, five NN-ready-light-dark.jpg pairs, five NN-established-light-dark.jpg pairs and 01-ready-200-light-dark.jpg. 05-established-mobile-200.jpg records narrow-browser controls/context. Live phone scroll exposes content below each static top capture.

## Preview ownership

The isolated loopback static server serves only this artifact directory through the existing Portless proxy. Route: https://ewatrade-home-workshop.localhost ; backing port 4004 ; managed exec session 22175. Keep it available during review; stop only the owned session after a final selection/handoff. Do not kill ports globally.

Direct file-protocol browser preview was blocked. The supported local HTTP preview serves only the artifact rather than arbitrary filesystem paths. The default sandbox could not reach the running proxy; automatic review approved the narrowly scoped preview-server start. No shared proxy/app server or emulator was restarted.

The Catalog workshop and unrelated Finance source/docs are untouched. No ADB, emulator-5554/Pixel_10a interaction, device theme/settings change, merchant mutation or parent-chat message occurred.

## Brain impact and roadmap

Updated .brain/design/2026-10-02-mobile-dashboard-five-direction-workshop.md and the matching dashboard handoff in .brain/tasks/in-progress.md. No API/database/schema docs require changes: this is an isolated review artifact. No ADR is needed because a durable production design was not selected.

- [x] Inspect/archive actual native screenshots.
- [x] Read relevant Brain, Classic controller/presentation and theme source.
- [x] Build five comparable Light/Dark directions and three states.
- [x] Exercise interactions, text reflow and narrow browser rendering.
- [x] Archive visuals, QA and native implementation guidance.
- [x] Complete scoped Brain handoff.
- [ ] Human selects/iterates a direction.
- [ ] Implement the selected native design.
- [ ] Complete native accessibility/behavior acceptance.

Workshop delivery is complete. Selection and implementation are future work.

## Selected-base refinement — guided journey

The owner selected 01 Clear Counter as the visual base and requested a new guided-state workshop borrowing 04 Guided Start. See [journey/README.md](journey/README.md) and https://ewatrade-home-workshop.localhost/journey/ for eight connected state previews. The original five directions remain preserved. This records base selection; the new guided behavior remains in workshop review before native integration.
