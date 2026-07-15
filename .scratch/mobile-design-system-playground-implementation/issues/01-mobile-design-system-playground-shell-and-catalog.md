# 01 — Mobile Design-System Playground Shell And Catalog

**What to build:** an internal mobile design-system playground route with a catalog home, section navigation, sample data scaffolding, production-visibility guard, and a clear structure for Tokens, Typography, Headers, Actions, Forms, Lists, Status, Modals/Sheets, Navigation/Footers, Analytics, and Retail Ops Patterns.

**Blocked by:** None — can start immediately.

**Status:** implementation-complete

- [x] The mobile app exposes an internal design-system playground route that can be opened during development.
- [x] The route is guarded so the playground cannot accidentally become a normal production customer workflow.
- [x] The catalog home shows the approved section groups from the spec.
- [x] Catalog sections use static sample data and do not call production APIs.
- [x] The playground shell works in both light and dark mode.
- [x] Basic source QA verifies the playground route and section labels exist.

## Implementation Notes

- Added the `/design-system` Expo route and route registration.
- Added a catalog home backed by static design-system section metadata.
- Added a production-visibility notice based on the app variant.
- Added an asset-led foundation using the provided EwaTrade icon/splash assets, saved design image references, and the Dribbble sales/order app reference before the catalog sections.
- Added the focused `qa:design-system-playground` source check and included the playground route markers it verifies.
