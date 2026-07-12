# 09 — Product Share Link Generation And Management

**What to build:** an owner or permitted attendant can generate a product share link, copy it for WhatsApp or other channels, and manage generated links from the app. Link management should show status and simple analytics without requiring the future customer app.

**Blocked by:** 02 — First Product Setup Wizard.

**Status:** implementation-complete

- [x] Product actions include a share-link generation path for permitted users.
- [x] Generated links use opaque public tokens rather than predictable database ids.
- [x] Share action clearly copies or presents the link for sending outside the app.
- [x] Generated links list shows product, creator, creation time, active or inactive state, view count, order count, and last activity.
- [x] Users can deactivate generated links so they no longer accept new orders.
- [x] Mobile link management uses production link data online and safe local fallback for queued link actions.

## Implementation Notes

- `apps/mobile/src/app/dashboard.tsx` exposes product share-link management from the product/inventory action path and from the Product links dashboard preview when links exist.
- `apps/mobile/src/components/mobile/product-share-sheet.tsx` lets users select a product, generate a production link when the product has a production id, or use the local queued link flow while offline or before product sync completes.
- Production link generation uses `retailOps.createProductShareLink`; local fallback uses `createShareLink`, queues `share_link_created`, and presents the URL through the native share sheet.
- Protected production share-link management now lives in the focused `apps/api/src/trpc/routers/retail-ops-share-links.ts` router module and is merged back into the public `retailOps.*` namespace. This keeps link creation, link listing, analytics, order follow-up, delivery follow-up, and deactivation out of the larger core Retail Ops router while preserving existing mobile tRPC call names.
- Generated links use server-side opaque tokens/slugs through the durable share-link bridge. Local fallback URLs use a random slug token rather than database ids and queue replay through the sync path.
- Production generated links now prefer verified custom storefront hostnames, then stored tenant storefront hostnames, then a generated tenant storefront subdomain such as `business.ewatrade.com` before falling back to the configured storefront base URL. This keeps newly created businesses on a business subdomain even before hostname rows are provisioned.
- Generated share-link host selection now skips unsafe stored hostnames, including non-HTTP protocols, localhost, IP, and local-device hosts, so a bad primary custom hostname cannot produce an unsafe public link or prevent the next safe business hostname/subdomain from being used.
- Shared-product page metadata now reads the forwarded request host so canonical and Open Graph image URLs use the same business subdomain or storefront domain that the customer opens.
- Link management shows local and production lists with product, creator, creation time, active/inactive state, views, orders, last activity, native share action, explicit copy-link action, copied-state feedback, and deactivation controls.
- Production link management reads `retailOps.productShareLinks`, refreshes analytics online, and deactivates links through `retailOps.deactivateProductShareLink`. Local fallback deactivation queues `share_link_deactivated`.
- The mobile Product links sheet now reads `retailOps.productShareLinkAnalytics` online and shows a compact generated-link analytics panel with range/source, unique visitors, order requests, completed/cancelled requests, reserved/consumed/released quantities, revenue, and top-performing production links. The panel refreshes after production link creation, deactivation, and shared-link order follow-up.
- The mobile Product links sheet now uses Expo Clipboard for a direct `Copy link` action on both local and production rows, while keeping the native share-sheet path for WhatsApp or other channels. `qa:product-share-management` guards `Clipboard.setStringAsync`, `Copy link`, and `Link copied` markers; `bun run --cwd apps/mobile qa:product-share-management`, `bun run --cwd apps/mobile qa:nativewind-style`, `bun --cwd apps/mobile tsc --noEmit --pretty false`, `bun run --cwd apps/mobile qa:mvp-source`, and `bun run --cwd apps/mobile qa:mvp-contracts` passed.
- Added focused DB query coverage for production share-link lifecycle. `packages/db/src/queries/retail-ops-share-links.test.ts` now proves share-link creation writes a durable link, durable audit event, and product metadata mirror with an opaque token URL, falls back to generated tenant storefront subdomains before hostname records exist, prefers stored tenant storefront subdomains and verified custom storefront hostnames when available, and deactivation writes durable inactive state, deactivation audit event, and inactive product metadata for owned links.
- The DB query coverage now also proves unsafe primary custom hostnames are skipped in favor of the next safe business hostname, and that unsafe stored hostnames fall back to the generated tenant storefront subdomain.
- Extended focused DB query coverage for generated-link listing and analytics. `packages/db/src/queries/retail-ops-share-links.test.ts` now proves list reads merge durable share-link rows with product metadata fallback rows, de-duplicate duplicate durable/metadata links by id or token, apply daily rollup view/order counters, and analytics reads filter by creator permissions, product id, and link id while returning daily rows, per-link summaries, range metadata, and aggregate metrics.
- Scoped static and DB contract checks passed. Live production link creation, native share-sheet interaction, production deactivation, link analytics refresh, and hands-on mobile QA still need a production-authenticated device run.
