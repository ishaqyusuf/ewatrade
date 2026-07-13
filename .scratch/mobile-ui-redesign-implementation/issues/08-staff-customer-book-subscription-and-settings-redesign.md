# 08 — Staff, Customer Book, Subscription, And Settings Redesign

**What to build:** secondary operational screens using shared list/detail/form patterns: staff invite, attendant onboarding status, customer book list/detail/add, subscription tier/usage/upgrade handoff, settings grouping, profile, and business switching.

**Blocked by:** 01 — Mobile Design Foundation And Reusable Primitives; 02 — Floating App Shell And Role-Aware Navigation; 05 — Owner And Attendant Dashboard Redesign

**Status:** implementation-complete

- [x] Staff invite and attendant onboarding status screens use short, clear forms and role-safe copy.
- [x] Customer book list, detail, search, and add flows reuse the same list/detail language as product management.
- [x] Subscription screen shows plan, tier comparison, usage, and upgrade handoff without becoming a marketing page.
- [x] Settings, profile, and business switching are grouped calmly and predictably.
- [x] Empty, loading, error, and offline fallback states are covered for each secondary surface.
- [x] Light and dark states are verified for dense list/detail screens.

## Implementation Notes

- Customer book, staff invite, subscription, business switching, and staff onboarding now reuse shared `StatusBadge`, `StatusBanner`, and `EmptyState` primitives for source, status, empty, limit, loading, and error states.
- Staff invite remains short and role-safe: attendant name and email address, cashier role submission, production invite where available, and local/offline fallback when needed.
- Customer book stays virtualized with production/local merged rows, search, order-count badges, synced/pending labels, and shared empty-state treatment.
- Subscription remains an operational plan/usage screen with tier cards, usage limits, production billing source, upgrade handoff, and local fallback notice.
- Business switching keeps predictable workspace grouping, search, active business badges, and business-limit warning without changing local business creation behavior.
