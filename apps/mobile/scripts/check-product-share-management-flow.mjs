import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILES = {
  fulfillmentQueries: join(
    REPO_ROOT,
    "packages/db/src/queries/retail-ops-fulfillment.ts",
  ),
  router: join(REPO_ROOT, "apps/api/src/trpc/routers/retail-ops.ts"),
  shareRouter: join(
    REPO_ROOT,
    "apps/api/src/trpc/routers/retail-ops-share-links.ts",
  ),
  shareQueries: join(
    REPO_ROOT,
    "packages/db/src/queries/retail-ops-share-links.ts",
  ),
  contractRunner: join(MOBILE_DIR, "scripts/run-mvp-contract-tests.mjs"),
  shareSheet: join(MOBILE_DIR, "src/components/mobile/product-share-sheet.tsx"),
  shareLinkFlow: join(MOBILE_DIR, "src/components/mobile/share-link-flow.tsx"),
  store: join(MOBILE_DIR, "src/store/retailOpsStore.ts"),
}

const CONTRACTS = [
  {
    file: FILES.shareSheet,
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "InventoryProductCard",
      "ShareLinkActionButton",
      "ShareLinkMetricTile",
      "ShareLinkOptionPill",
      "ShareLinkPanel",
      "ShareLinkRecordRow",
      "StatusBadge",
      "StatusBanner",
      "EmptyState",
      "trpc.retailOps.productShareLinks",
      "trpc.retailOps.productShareLinkAnalytics",
      "trpc.retailOps.sharedLinkOrderRequests",
      "trpc.retailOps.createProductShareLink",
      "trpc.retailOps.deactivateProductShareLink",
      "trpc.retailOps.updateSharedLinkOrderRequestStatus",
      "trpc.retailOps.createDeliveryRequest",
      "trpc.retailOps.updateDeliveryRequestStatus",
      "createShareLink",
      "deactivateShareLink",
      "shareGeneratedLink",
      "Share.share",
      "expo-clipboard",
      "Clipboard.setStringAsync",
      "copyGeneratedLink",
      "Copy link",
      "Link copied",
      "visibleProducts",
      "visibleShareLinks",
      "visibleOrderRequests",
      "visibleDeliveryRequests",
      "ShareLinkAnalyticsPanel",
      "Generated-link analytics",
      "uniqueVisitorCount",
      "completedOrderCount",
      "reservedQuantity",
      "consumedQuantity",
      "releasedQuantity",
      "Generate and share link",
      "Pending link orders",
      "Delivery follow-up",
    ],
    reason:
      "product share sheet must keep keyboard safety, reusable share-link rows/metrics/actions, product/link lists, share creation/deactivation, pending order requests, delivery follow-up, and native share handoff",
  },
  {
    file: FILES.shareLinkFlow,
    markers: [
      "ShareLinkMetricTile",
      "ShareLinkOptionPill",
      "ShareLinkPanel",
      "ShareLinkRecordRow",
      "ShareLinkActionButton",
      "border-t border-border py-4",
      "rounded-full bg-muted",
      "bg-destructive/10",
      "haptic",
    ],
    reason:
      "share-link management must use reusable flat metric tiles, generated-link rows, and native action buttons instead of local card-heavy widgets",
  },
  {
    file: FILES.shareSheet,
    markers: [
      "paymentMethodOptions",
      "fulfillmentStatusOptions",
      "fulfillmentMethodOptions",
      "SharedLinkOrderRequestRow",
      "DeliveryRequestRow",
      "ShareLinkRecordRow",
      "ShareLinkActionButton",
      "border-y border-border py-3",
      "paymentMethod",
      "fulfillmentStatus",
      "fulfillmentMethod",
      "Complete",
      "Cancel",
      "createDeliveryRequestMutation.isPending",
      "updateDeliveryRequestStatusMutation.isPending",
      "updateOrderRequestStatusMutation.isPending",
    ],
    reason:
      "order and delivery follow-up must keep reusable flat record/action rows, payment, fulfillment, complete/cancel, and pending-operation protections",
  },
  {
    file: FILES.shareRouter,
    markers: [
      "assertCanUseRetailOpsShareLinks",
      "productShareLinks: protectedProcedure",
      "productShareLinkAnalytics: protectedProcedure",
      "sharedLinkOrderRequests: protectedProcedure",
      "updateSharedLinkOrderRequestStatus: protectedProcedure",
      "createDeliveryRequest: protectedProcedure",
      "updateDeliveryRequestStatus: protectedProcedure",
      "createProductShareLink: protectedProcedure",
      "deactivateProductShareLink: protectedProcedure",
      "canManageAllLinks: canManageSalesOperations(role)",
      "canManageAllRequests: canManageSalesOperations(role)",
    ],
    reason:
      "API must keep role-gated protected share-link, analytics, order-request, and delivery procedures",
  },
  {
    file: FILES.router,
    markers: ["mergeRouters", "retailOpsShareLinksRouter"],
    reason:
      "Retail Ops router must merge the focused share-link router without changing the public tRPC namespace",
  },
  {
    file: FILES.shareQueries,
    markers: [
      "listRetailOpsProductShareLinks",
      "getRetailOpsProductShareLinkAnalytics",
      "listRetailOpsSharedLinkOrderRequests",
      "updateRetailOpsSharedLinkOrderRequestStatus",
      "createRetailOpsProductShareLink",
      "deactivateRetailOpsProductShareLink",
      "getPreferredStorefrontBaseUrl",
      "getTenantSubdomainBaseUrl",
      "isLocalOrIpHostname",
      '["http:", "https:"].includes(url.protocol)',
    ],
    reason:
      "database share-link queries must keep durable link listing, analytics, order request status updates, creation, deactivation, and safe business-host URL selection",
  },
  {
    file: FILES.fulfillmentQueries,
    markers: [
      "listRetailOpsDeliveryRequests",
      "createRetailOpsDeliveryRequest",
      "updateRetailOpsDeliveryRequestStatus",
      "mergeDeliveryRequests",
      "createDurableRetailOpsDeliveryRequest",
      "createMetadataRetailOpsDeliveryRequest",
    ],
    reason:
      "fulfillment queries must keep durable and metadata fallback delivery request handling",
  },
  {
    file: FILES.contractRunner,
    markers: [
      "apps/api/src/trpc/routers/retail-ops-follow-up.test.ts",
      "API retail ops follow-up router",
    ],
    reason:
      "MVP contract tests must keep authenticated Retail Ops follow-up router coverage",
  },
  {
    file: FILES.store,
    markers: [
      "createShareLink",
      "deactivateShareLink",
      'createSyncEvent(\n              "share_link_created"',
      'createSyncEvent(\n              "share_link_deactivated"',
      "deviceId: get().offlineDeviceId",
      "deviceId: state.offlineDeviceId",
    ],
    reason:
      "offline store must keep local product share link creation/deactivation and queue sync events with device metadata",
  },
]
const failures = []

for (const contract of CONTRACTS) {
  const source = readFileSync(contract.file, "utf8")
  const missingMarkers = contract.markers.filter(
    (marker) => !source.includes(marker),
  )

  if (missingMarkers.length > 0) {
    failures.push({
      file: contract.file,
      message: `missing ${missingMarkers.join(", ")} (${contract.reason})`,
    })
  }
}

if (failures.length > 0) {
  console.error(
    "Product share management flow check failed. Restore the mobile share sheet, API procedures, durable queries, or offline link fallback contract.",
  )

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Product share management flow check passed.")
