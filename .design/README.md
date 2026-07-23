# Mobile Design References

This root folder stores owner-provided design boards and captured review evidence.

- `reference-*.png`: immutable source boards used by the internal Design 01 app.
- `qa/design-01-commerce/`: light/dark Android review captures for Orders,
  Customers, Customer overview, and Order overview, including scroll and local
  order-action states plus the horizontally pannable source-board canvas.

The Expo app reads these files through the `@design/*` TypeScript alias. Metro watches this folder directly so source images do not need to be copied into app assets.
Landscape source boards open on a horizontally pannable review canvas so each
screen can be inspected at a useful size on a portrait phone.
