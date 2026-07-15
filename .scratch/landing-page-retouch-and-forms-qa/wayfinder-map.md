# Wayfinder Scratch: Landing Page Retouch And Forms QA

## Destination

Create a clear implementation plan for retouching/restructuring the EwaTrade marketing landing page and verifying every landing-page feature path works: signup CTAs, section anchors, early-access form, waitlist form, and related email/job side effects.

The destination is a handoff-ready plan, not implementation. No landing-page code should be changed from this scratch alone.

## Notes

- Primary design lens: Agency Design / UI Designer.
- Primary engineering lens: Agency Engineering / Frontend Developer.
- Repo context: Next.js App Router marketing app at `apps/marketing`.
- Current forms:
  - `LeadCaptureForm` submits early access to `POST /api/early-access`.
  - `LeadCaptureForm` submits waitlist to `POST /api/waitlist`.
  - Signup CTA routes to `/signup` when `NEXT_PUBLIC_SIGNUP_ENABLED=true`.
- Current email/job context:
  - Marketing leads persist `LeadCapture` rows.
  - Lead routes enqueue `@ewatrade/jobs` notification dispatch.
  - Resend and `TEST_EMAIL` are configured from the prior email setup.
- Standing preference: plan first, then implement only after explicit approval.

## Decisions So Far

- Use a plan-only scratch map instead of changing code in this pass.
- Treat the landing page as a conversion + trust surface, not a generic brochure.
- Keep existing product paths in scope: signup, early access, waitlist, platform anchors, and form/API/email behavior.
- Defer visual implementation until after the user approves the restructure plan.

## Frontier Tickets

### Ticket 1: Define The Landing Page Story

**Type:** grilling  
**Question:** What should the first-viewport promise be for EwaTrade right now: merchant OS, POS/storefront launch, commerce + logistics, or a narrower early-access offer?

**Why it matters:** The current page mentions many surfaces. The retouch should decide the primary promise before moving sections around.

### Ticket 2: Choose The Conversion Model

**Type:** grilling  
**Question:** Should the landing page prioritize immediate workspace signup, early-access consultation, or waitlist collection as the main conversion?

**Why it matters:** CTA hierarchy, nav labels, hero copy, and form placement depend on the primary conversion.

### Ticket 3: Audit Existing Landing Features

**Type:** task  
**Question:** What landing-page interactions must be verified before and after the retouch?

**Initial checklist:**
- Nav anchors: Platform, How it works, forms/lead capture.
- Signup CTAs route to `/signup` when enabled.
- Early-access form validates, submits, shows success/error, persists lead, and dispatches email/job notification.
- Waitlist form validates, submits, shows success/error, persists lead, and dispatches email/job notification.
- Responsive layout works on mobile and desktop.
- Brand images load without layout overlap.

### Ticket 4: Propose The Section Architecture

**Type:** prototype  
**Question:** What exact landing-page section order and content blocks should replace the current structure?

**Candidate scope:**
- Sticky nav with clear CTA.
- First viewport with one product promise and one primary action.
- Product surfaces/features section.
- Operating workflow section.
- Trust/readiness proof section.
- Lead capture/sign-up decision section.
- Footer.

### Ticket 5: Define QA And Acceptance Criteria

**Type:** task  
**Question:** What commands and browser checks should prove the retouch is complete?

**Candidate checks:**
- `bun --filter @ewatrade/marketing typecheck`
- production-profile marketing build if env allows it
- browser screenshots at desktop and mobile widths
- click-through checks for all CTAs/anchors
- form submission checks for early access and waitlist using `TEST_EMAIL`
- verify no new console errors or hydration mismatches

## Not Yet Specified

- Final hero copy and CTA labels.
- Whether to keep both early-access and waitlist forms visible when signup is enabled.
- Whether the route handlers should be hardened to return clean JSON on notification failures.
- Whether the landing page should use the current brand mark as a subtle asset or introduce generated/product imagery.
- Whether this retouch should include `/signup` page polish or only the homepage.

## Out Of Scope

- Changing database schema.
- Changing Resend, Cloudflare, or Trigger.dev configuration.
- Reworking the full signup wizard.
- Building a new design system.
- Deploying the landing page before the plan is approved.
