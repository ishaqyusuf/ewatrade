# Business Type Onboarding And Dry Cleaning

## Purpose
Add a v1 business-template layer so new stores can start as Product Sales, Dry Cleaning / Laundry, or Other business without weakening the existing Retail Ops product-sales flow.

## Current Phase
Implemented as a metadata-backed v1 in the main Retail Ops stack:

- `Product Sales` remains the default effective template for stores without explicit template metadata.
- `Dry Cleaning / Laundry` enables service items, service orders, service request links, request conversion, customer tracking tokens, notification intents, and operational reports.
- `Other business` captures raw unsupported-business demand in onboarding metadata and completed onboarding sessions so internal tooling can rank requested templates.
- Dashboard first-store setup now presents the three v1 outcomes and submits template-specific setup answers.
- The dashboard exposes a Dry Cleaning / Laundry service workspace at `/services` for dry-cleaning stores, including service catalog management, express surcharge settings, service-order intake, status/evidence updates, due-work review, public request review/conversion, and request-link visibility.
- The mobile app exposes a production-backed dry-cleaning/service-order workflow at `/service-orders-modal` for owner/admin and sales-rep users. The workflow can create service items with SM/LG variants, update express surcharge settings, create service orders with customer details plus captured photo/video or manual-link evidence metadata, review due work, and advance service-order status through the existing `retailOps` tRPC contracts.
- Mobile real-session QA now has a dev/preview-only import route and runner that create local API-backed owner or staff bearer sessions through the mobile OTP/staff tRPC flows, switch a fresh store to `dry_cleaning_laundry`, optionally seed the dry-cleaning case study services/orders, and open `/service-orders-modal` in the Android emulator. The QA import route is gated away from production builds.
- Protected tRPC procedures under `retailOps` expose template reads/updates plus dry-cleaning catalog, settings, order, request-link, request, and report operations.
- Public tRPC procedures and the web `/service-request/[token]` route resolve dry-cleaning service-request links, submit public service requests, render share metadata, and resolve opaque tracking tokens.

## Data Model
No Prisma schema migration was added in this phase.

- `Store.metadata.retailOps.businessTemplate` stores the effective template key, label, source, and selected timestamp.
- `Store.metadata.retailOps.onboarding` stores the cleaned setup answers and selected template snapshot.
- `Store.metadata.retailOps.dryCleaning` stores bounded settings, service items, service orders, request links, service requests, and notification intents.
- `Store.metadata.retailOps.businessTemplateChanges` stores bounded template-change audit entries.
- Completed `OnboardingSession.formData.onboarding` stores the same template/setup snapshot for analytics and support review.

## Product Rules
- Product Sales inventory, stock wallets, share links, sales, sessions, and reports must continue to use their existing Product/Order/Inventory tables and behavior.
- Dry-cleaning service catalog entries are service items, not inventory products. Creating service orders must not deduct Product Sales stock or staff wallet balances.
- Service-order lines snapshot service name, variant, price, quantity, and total so later price edits do not rewrite historical orders.
- Express service uses store-level metadata settings for surcharge percentage and snapshots express pricing onto each affected order line.
- Service-order intake and status changes can attach evidence metadata such as label and URL, with private evidence kept out of public tracking responses.
- Ready and delay status updates can create manual notification intents with customer-facing fallback copy.
- Public service-request and tracking flows use opaque tokens, not raw database ids.
- Public service-request pages are currently served by both the storefront app and the marketing app because early production uses the marketing Vercel project for customer-facing links.
- Template changes are owner/admin-only at the API layer and are blocked by default when products, orders, or dry-cleaning operational records already exist.

## Deferred
- Dedicated Prisma tables for dry-cleaning service catalog, service orders, requests, notifications, and unsupported-business demand signals.
- Cloud media upload/storage for captured intake evidence; the first native mobile capture stores the camera-returned URI or a manual evidence link through the existing evidence metadata contract.
- Offline service-order creation and status sync; the first mobile workflow requires a live connection for dry-cleaning service operations while Product Sales retains the existing offline queue.
- Provider-native WhatsApp/SMS delivery for dry-cleaning notification intents.
- Rich internal admin UI for unsupported-business ranking; v1 exposes an internal procedure for ranked demand.
- Unified customer dashboard across Product Sales and service orders.
