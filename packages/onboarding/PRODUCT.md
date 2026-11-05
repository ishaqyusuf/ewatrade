# EwaTrade web onboarding

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Business owners setting up their account and one or more businesses. The owner
confirmed responsive web signup and setup as the design scope on 5 November
2026; native onboarding is a separate follow-up.

## Product Purpose

Create an owner account, verify the chosen sign-in channel, identify the business
activity, group activities when necessary and complete each eligible Store.

## Operating Context

Dashboard owns `/signup` and `/setup`. `packages/onboarding` supplies the web
signup frame and shared account components; Dashboard owns authenticated setup.
The authoritative flow is Account → Code → Business type → optional grouping →
Store, followed by the actual dashboard. Preserve existing API, autosave, session,
permission, legal, age and provider behavior.

## Capabilities and Constraints

- Email, WhatsApp or both contacts, gated by actual provider availability.
- Only the verified channel becomes a login; another contact stays a business
  contact until separately verified.
- Neutral age-band choice and existing 13+ rule; Terms/Privacy acknowledgement.
- Store-link availability and conflict recovery, business-type search and
  selection, grouping with a keyboard Move alternative, per-business country,
  currency, products/services and optional location/description.
- Current plan/entitlement contracts remain authoritative. Older setup text
  mentioning Starter and three items conflicts with the marketing offer copy;
  the design task must flag this rather than silently change plan rules.
- Workshop screens use local example data and never create accounts, send codes,
  accept agreements or write business records.

## Brand Commitments

Use the existing EwaTrade name/marks and the approved marketing v15 visual
language as the web continuity reference. The owner asked to keep current signup
steps/rules, build real HTML screens, and review the Workshop before implementation.

## Evidence on Hand

Implemented signup Workshop direction 02 v2:
`a9b4a59d-4c63-4159-b555-4332ca0b69c5` in
`ewatrade/dashboard/owner-signup-redesign`. Preserve later v3 and all history.
Current source and live local `/signup` are behavior evidence; the new marketing
at `apps/marketing/src/components/marketing/experiences/launch-v4` is visual
continuity evidence. No testimonials or conversion metrics are supplied.

## Product Principles

Keep progress understandable; preserve entered work; distinguish verified login
from contact details; surface recoverable errors; give phone layouts the same
care as desktop.
