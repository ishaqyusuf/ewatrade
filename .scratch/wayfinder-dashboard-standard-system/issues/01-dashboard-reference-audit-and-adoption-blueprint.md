# 01 - Dashboard Reference Audit And Adoption Blueprint

**What to build:** a verified dashboard reference blueprint that lets an agent understand the current EwaTrade dashboard, the HalalVest fast-start reference, and the Midday target standard before changing product code. The result should decide what can be copied, what must be ported through Midday conventions, what should be skipped, and what temporary shims are allowed.

**Blocked by:** None - can start immediately.

**Status:** implementation-complete

- [x] The audit compares current EwaTrade, HalalVest, and Midday dashboard structures across shell, auth, routes, providers, tables, sheets, modals, forms, analytics, search, and desktop wrapper patterns.
- [x] The output includes a copy/port/skip/temporary-shim decision matrix for HalalVest patterns.
- [x] The output includes a Midday compliance checklist that later tickets can cite before implementation.
- [x] The output explicitly calls out locale/i18n timing and whether it is adopted immediately or deferred.
- [x] Brain documentation is updated if the audit changes dashboard architecture guidance.

## Implementation Notes

- Published the reference audit at `.scratch/wayfinder-dashboard-standard-system/reference-audit.md`.
- Closed the HalalVest copy/port boundary: HalalVest is a fast-start implementation reference, but product code should be ported through Midday conventions.
- Closed the locale question for the initial scaffold: defer `[locale]` routing until the web shell and primary dashboard flows are stable, while keeping new copy extractable.
- Updated `.brain/features/dashboard-standard-system.md` with the resolved guidance.
