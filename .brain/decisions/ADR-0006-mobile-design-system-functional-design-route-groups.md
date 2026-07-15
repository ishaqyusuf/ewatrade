# ADR-0006: Mobile Design System Functional Design Route Groups

## Status
Accepted

## Context
The mobile design-system approval flow started as reference-led screens under `/design-system/references/[referenceId]`. That was useful for recreating one image, but it does not scale well when a design image becomes a complete mobile experience with home, orders, profile, messages, stock, source images, and future feature screens.

## Decision
Each approved mobile design family will own a functional Expo Router route group under `/design-system/design-XX`.

The route group should keep route files thin and place implementation in a matching component folder:

- Routes: `apps/mobile/src/app/design-system/design-01/_layout.tsx`, `index.tsx`, `reference.tsx`, `image.tsx`, and feature routes such as `orders.tsx`, `messages.tsx`, `profile.tsx`, and `stock.tsx`.
- Implementation: `apps/mobile/src/components/mobile/design-system/designs/design-01/`.

The design route should include one reference hub and one source-image route beside the functional screens. Additional reference images that belong to the same visual direction should be added to that design family's registry instead of creating disconnected reference routes.

Bottom navigation should not automatically appear on every route in a design family. Design 01 reveals the bottom tab dock only on the home/root route; starter feature routes use the same shell and floating actions without the tab dock unless the owner explicitly approves tabs on that route.

Legacy reference routes may remain as compatibility redirects while the owner reviews the migrated structure.

## Consequences
- Design references can grow into usable mini-app flows before promotion into product screens.
- The `/design-system` catalog remains the owner-facing entry point, but each design family has its own real app path.
- Shared primitives stay outside design folders; design-specific shells, tabs, and screens live under the design family until approved for promotion.
- QA must cover the route group, reference hub, source image route, tab navigation, and Android emulator visuals.
