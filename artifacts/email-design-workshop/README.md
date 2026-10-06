# Shared email design workshop

Owner requested five alternatives to the existing shared email design and a
combination of their strongest elements on 2 October 2026.

Selected: **06 Warm Desk**, implemented in the shared React Email components.
Saved comparison: `implementation/index.html` (serve locally to use its controls).
Actual standalone rendered documents: `implementation/current/`.

Workshop delivery: **3/3 — 100%** (source grounding, alternatives/combination,
browser checks and handoff). Selected shared implementation: **3/3 — 100%**.
The four remaining families are also integrated: **3/3 — 100%**, total18 states.
Hosted rollout, approved final outcome content/digest, delivery discrepancy
investigation and email-client/provider acceptance remain separate pending work.

## Directions

1. Warm Letter: personal paper letter, serif headline, terracotta action.
2. Clear Desk: modern document, green action, clear hierarchy.
3. Commerce Receipt: centered masthead, compact ruled facts.
4. Market Postcard: green title panel with warm citrus accents.
5. Quiet Note: unboxed message with a small brand signature.
6. Warm Desk: recommended combination of 02 hierarchy/action, 01 warm paper,
   03 ruled facts, 04 restrained accent and 05 light footer.

Nine consistent fictional scenarios per direction produce 54 exported email
documents under `samples/`. The baseline is rendered from the actual
`renderMarketingWaitlistAdminTemplate` using fictional name/email/lead ID.
Waitlist samples do not invent company, phone, queue position or a setup action.
The outcome sample contains fictional placeholder text rather than approved legal
wording. Its implemented renderer uses the supplied subject/text and escapes both;
the sender requires canonical rendered HTML and the existing final-message digest.

The full-size viewer supports desktop/phone widths, local action feedback,
editable escaped sample values, isolated favorites and complete reset. Download
uses the current rendered sample values. Direct samples use inert fragment links.
Preview controls are outside the product email. No dependencies, live API calls,
provider sends, databases or shared app processes changed during the workshop.
The selected implementation subsequently changes the shared production templates.

## Verification

- JavaScript syntax checks pass for `design.js` and `app.js`.
- All nine combined states rendered at desktop and 390px page widths.
- All six directions checked with the long privacy alert at desktop and 375px
  email viewer width. No horizontal overflow in these 30 recorded render cases.
- Standalone recommended waitlist inspected at exactly 375px and 640px.
- Setup action stayed local; escaped HTML-like recipient text created no image;
  two independent favorites and reset restored the default state.
- Final viewer fits its frame to the email body to avoid nested scrollbars.
- Evidence: `evidence/browser-checks.json`, `comparison.jpg`,
  `warm-desk-waitlist.jpg`, `warm-desk-waitlist-mobile.jpg`.
- The in-app browser logged MutationObserver exceptions during iframe inspection.
  This artifact contains no MutationObserver code; their origin is unconfirmed.
  An override reset also temporarily exposed a zero-sized background viewport;
  those frames were excluded. Final saved standalone captures were visually checked.

These are browser previews. Gmail/Outlook, dark-mode transformations, provider
delivery and production deployment have not been checked for the new design.
Production should retain React Email, inline table-compatible layout, readable
plain text, escaped values, routing, idempotency, expiry and workflow permissions.
Rounded corners are cosmetic; client fallbacks must remain readable.

## Selected implementation verification

Follow-up all-email checkpoint supersedes the initial14-state figures below:

- All18 states use Warm Desk, including deletion code/outcome and privacy/Play
  alerts. The alert texts and hourly keys remain unchanged.
- Focused55tests/319assertions, email TypeScript/Biome54files, scoped62filelint,
  affected API/jobs syntax bundles and diff checks pass.
- `implementation/all-email-browser-checks.json` records36 desktop/phone cases
  without overflow; long unbroken outcome text/subject also fits375px.
- Added captures: `deletion-code-mobile.jpg`, `deletion-outcome-mobile.jpg`,
  `privacy-alert-mobile.jpg`, `refund-alert-mobile.jpg`, `outcome-long-mobile.jpg`.
- Raw standalone comparison files use the former renderer shapes and fictional
  inputs. No approved legal message or provider acceptance is fabricated.
- Outcome submissions must include exact canonical renderer HTML (bounded128k
  for the existing16k text limit) and its final approved digest. Old raw HTML
  cannot authorize a new styled message. Processing/delivery gates remain.

Initial shared implementation checkpoint:

- Shared warm paper/green action/lime rail, ruled details and quiet footer are
  applied across all 14 actual shared states, including setup verification.
- 18 tests/192 assertions, package TypeScript/Biome (46 files), scoped diff pass.
- `implementation/contracts.json` records unchanged links for all 14 states,
  unchanged plain text for 13, and the intended waitlist admin headline change.
- `implementation/browser-checks.json` records 28 desktop/phone states without
  overflow, including the final React Email body-wrapper mobile padding fix.
- `implementation/waitlist-actual-mobile.jpg` is the final exact-375px capture.
  Earlier `mobile.jpg` documents the padding issue before its repair.
- The preview setup action is intercepted; fictional data only, zero sends.

## Rebuild and serve

The workshop `baseline.html` and `implementation/before/` are historical source
snapshots. Preserve them; do not rerun the original `build.ts` or the production
builder with `--before` after migration. Regenerate only current renders:

```sh
bun --env-file=/dev/null artifacts/email-design-workshop/build-production.ts
PORTLESS_SYNC_HOSTS=0 portless ewatrade-email-workshop bun --env-file=/dev/null artifacts/email-design-workshop/serve.ts
```

Owned workshop managed session **63866**, backing port **4203**, was stopped
after final selection and implementation verification; listener absence checked.
Browser viewport override was reset. Saved documents/evidence remain available.
Follow-up session97446/backing4615 was also stopped and listener absence checked.

Brain impact: design handoff, email feature, migration plan, accepted Warm Desk
decision, BRAIN and task ledgers updated. No API/database documentation changes
are needed because transport and persistence are unchanged. The follow-up also
updates the API contract and records the canonical outcome presentation decision.
