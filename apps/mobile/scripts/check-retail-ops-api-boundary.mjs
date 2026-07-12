import { existsSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const ROUTER_FILE = join(REPO_ROOT, "apps/api/src/trpc/routers/retail-ops.ts")
const PRODUCTS_ROUTER_FILE = join(
  REPO_ROOT,
  "apps/api/src/trpc/routers/retail-ops-products.ts",
)
const SALES_ROUTER_FILE = join(
  REPO_ROOT,
  "apps/api/src/trpc/routers/retail-ops-sales.ts",
)
const SESSIONS_ROUTER_FILE = join(
  REPO_ROOT,
  "apps/api/src/trpc/routers/retail-ops-sessions.ts",
)
const SHARE_LINK_ROUTER_FILE = join(
  REPO_ROOT,
  "apps/api/src/trpc/routers/retail-ops-share-links.ts",
)
const STAFF_ROUTER_FILE = join(
  REPO_ROOT,
  "apps/api/src/trpc/routers/retail-ops-staff.ts",
)
const STOCK_ROUTER_FILE = join(
  REPO_ROOT,
  "apps/api/src/trpc/routers/retail-ops-stock.ts",
)
const SUBSCRIPTIONS_ROUTER_FILE = join(
  REPO_ROOT,
  "apps/api/src/trpc/routers/retail-ops-subscriptions.ts",
)
const APP_ROUTER_FILE = join(REPO_ROOT, "apps/api/src/trpc/routers/_app.ts")
const SCHEMA_FILE = join(REPO_ROOT, "apps/api/src/schemas/retail-ops.ts")
const QUERY_FILES = [
  "packages/db/src/queries/retail-ops.ts",
  "packages/db/src/queries/retail-ops-customers.ts",
  "packages/db/src/queries/retail-ops-fulfillment.ts",
  "packages/db/src/queries/retail-ops-products.ts",
  "packages/db/src/queries/retail-ops-sales.ts",
  "packages/db/src/queries/retail-ops-sessions.ts",
  "packages/db/src/queries/retail-ops-share-links.ts",
  "packages/db/src/queries/retail-ops-staff.ts",
  "packages/db/src/queries/retail-ops-stock.ts",
  "packages/db/src/queries/retail-ops-stock-wallets.ts",
  "packages/db/src/queries/retail-ops-subscriptions.ts",
  "packages/db/src/queries/retail-ops-sync.ts",
].map((file) => join(REPO_ROOT, file))
const ROUTER_CONTRACTS = [
  {
    markers: [
      'from "@ewatrade/db/queries"',
      'from "../../schemas/retail-ops"',
      "createTRPCRouter",
      "protectedProcedure",
      "publicProcedure",
    ],
    reason:
      "retail ops router must keep typed tRPC procedures wired through schema and query modules",
  },
  {
    markers: [
      "sharedProduct: publicProcedure",
      "createSharedProductOrderRequest: publicProcedure",
      "summary: protectedProcedure",
      "syncEvents: protectedProcedure",
      "mergeRouters",
      "retailOpsProductsRouter",
      "retailOpsSalesRouter",
      "retailOpsSessionsRouter",
      "retailOpsShareLinksRouter",
      "retailOpsStaffRouter",
      "retailOpsStockRouter",
      "retailOpsSubscriptionsRouter",
    ],
    reason:
      "retail ops API must keep public, authenticated, and protected boundaries for the MVP workflows",
  },
  {
    markers: [
      ".input(retailOpsSharedProductLookupSchema)",
      ".input(retailOpsCreateSharedProductOrderRequestSchema)",
      ".input(retailOpsSyncEventsSchema)",
    ],
    reason:
      "retail ops procedures must keep schema validation at the API boundary",
  },
]
const SALES_ROUTER_CONTRACTS = [
  {
    markers: [
      'from "@ewatrade/db/queries"',
      'from "../../schemas/retail-ops"',
      "createTRPCRouter",
      "protectedProcedure",
      "recentSales: protectedProcedure",
      "creditSales: protectedProcedure",
      "recordCreditPayment: protectedProcedure",
      "createSale: protectedProcedure",
    ],
    reason:
      "focused sales router must keep protected sale creation, recent sales, credit sales, and credit payment procedures",
  },
  {
    markers: [
      ".input(retailOpsRecentSalesSchema)",
      ".input(retailOpsCreditSalesSchema)",
      ".input(retailOpsRecordCreditPaymentSchema)",
      ".input(retailOpsCreateSaleSchema)",
    ],
    reason:
      "focused sales router must keep schema validation at each sales API boundary",
  },
]
const PRODUCTS_ROUTER_CONTRACTS = [
  {
    markers: [
      'from "@ewatrade/db/queries"',
      'from "../../schemas/retail-ops"',
      "createTRPCRouter",
      "protectedProcedure",
      "productUnitPriceAt: protectedProcedure",
      "priceHistory: protectedProcedure",
      "unitTemplates: protectedProcedure",
      "createProduct: protectedProcedure",
      "updateProductUnitPrice: protectedProcedure",
    ],
    reason:
      "focused product router must keep protected product setup, unit template, price lookup, history, and price update procedures",
  },
  {
    markers: [
      ".input(retailOpsProductUnitEffectivePriceSchema)",
      ".input(retailOpsProductUnitPriceHistorySchema)",
      ".input(retailOpsCreateProductSchema)",
      ".input(retailOpsUpdateProductUnitPriceSchema)",
    ],
    reason:
      "focused product router must keep schema validation at each product API boundary",
  },
]
const SESSIONS_ROUTER_CONTRACTS = [
  {
    markers: [
      'from "@ewatrade/db/queries"',
      'from "../../schemas/retail-ops"',
      "createTRPCRouter",
      "protectedProcedure",
      "sessions: protectedProcedure",
      "paymentReconciliation: protectedProcedure",
      "openSession: protectedProcedure",
      "closeSession: protectedProcedure",
      "reviewCloseoutSession: protectedProcedure",
    ],
    reason:
      "focused sessions router must keep protected session listing, payment reconciliation, open/close session, and closeout review procedures",
  },
  {
    markers: [
      ".input(retailOpsSessionsSchema)",
      ".input(retailOpsReportRangeSchema)",
      ".input(retailOpsOpenSessionSchema)",
      ".input(retailOpsCloseSessionSchema)",
      ".input(retailOpsReviewCloseoutSessionSchema)",
    ],
    reason:
      "focused sessions router must keep schema validation at each session API boundary",
  },
]
const SHARE_LINK_ROUTER_CONTRACTS = [
  {
    markers: [
      'from "@ewatrade/db/queries"',
      'from "../../schemas/retail-ops"',
      "createTRPCRouter",
      "protectedProcedure",
      "productShareLinks: protectedProcedure",
      "productShareLinkAnalytics: protectedProcedure",
      "sharedLinkOrderRequests: protectedProcedure",
      "updateSharedLinkOrderRequestStatus: protectedProcedure",
      "deliveryRequests: protectedProcedure",
      "createDeliveryRequest: protectedProcedure",
      "updateDeliveryRequestStatus: protectedProcedure",
      "createProductShareLink: protectedProcedure",
      "deactivateProductShareLink: protectedProcedure",
    ],
    reason:
      "focused share-link router must keep protected link, analytics, order follow-up, and delivery procedures",
  },
  {
    markers: [
      ".input(retailOpsStoreScopeSchema)",
      ".input(retailOpsProductShareLinkAnalyticsSchema)",
      ".input(retailOpsSharedLinkOrderRequestsSchema)",
      ".input(retailOpsUpdateSharedLinkOrderRequestStatusSchema)",
      ".input(retailOpsDeliveryRequestsSchema)",
      ".input(retailOpsCreateDeliveryRequestSchema)",
      ".input(retailOpsUpdateDeliveryRequestStatusSchema)",
      ".input(retailOpsCreateProductShareLinkSchema)",
      ".input(retailOpsDeactivateProductShareLinkSchema)",
    ],
    reason:
      "focused share-link router must keep schema validation at each API boundary",
  },
]
const STOCK_ROUTER_CONTRACTS = [
  {
    markers: [
      'from "@ewatrade/db/queries"',
      'from "../../schemas/retail-ops"',
      "createTRPCRouter",
      "protectedProcedure",
      "stockMovements: protectedProcedure",
      "recordStockIntake: protectedProcedure",
      "recordStockAdjustment: protectedProcedure",
      "recordUnitConversion: protectedProcedure",
    ],
    reason:
      "focused stock router must keep protected stock movement reads, stock intake, stock adjustment, and unit conversion procedures",
  },
  {
    markers: [
      ".input(retailOpsStockMovementsSchema)",
      ".input(retailOpsRecordStockIntakeSchema)",
      ".input(retailOpsRecordStockAdjustmentSchema)",
      ".input(retailOpsRecordUnitConversionSchema)",
    ],
    reason:
      "focused stock router must keep schema validation at each stock API boundary",
  },
]
const STAFF_ROUTER_CONTRACTS = [
  {
    markers: [
      'from "@ewatrade/db/queries"',
      'from "../../schemas/retail-ops"',
      "createTRPCRouter",
      "protectedProcedure",
      "publicProcedure",
      "authenticatedProcedure",
      "completeStaffOnboarding: authenticatedProcedure",
      "resolveStaffInviteToken: publicProcedure",
      "staff: protectedProcedure",
      "updateStaffStatus: protectedProcedure",
      "staffStockWallets: protectedProcedure",
      "assignStaffStock: protectedProcedure",
      "returnStaffStock: protectedProcedure",
      "inviteStaff: protectedProcedure",
    ],
    reason:
      "focused staff router must keep protected staff management, stock wallet, public invite resolution, and authenticated staff onboarding procedures",
  },
  {
    markers: [
      ".input(retailOpsCompleteStaffOnboardingSchema)",
      ".input(retailOpsResolveStaffInviteTokenSchema)",
      ".input(retailOpsStaffListSchema)",
      ".input(retailOpsUpdateStaffStatusSchema)",
      ".input(retailOpsStaffStockWalletsSchema)",
      ".input(retailOpsAssignStaffStockSchema)",
      ".input(retailOpsReturnStaffStockSchema)",
      ".input(retailOpsInviteStaffSchema)",
    ],
    reason:
      "focused staff router must keep schema validation at each staff API boundary",
  },
]
const SUBSCRIPTIONS_ROUTER_CONTRACTS = [
  {
    markers: [
      'from "@ewatrade/db/queries"',
      'from "../../schemas/retail-ops"',
      "createTRPCRouter",
      "protectedProcedure",
      "subscription: protectedProcedure",
      "createSubscriptionCheckoutIntent: protectedProcedure",
    ],
    reason:
      "focused subscription router must keep protected subscription snapshot and checkout intent procedures",
  },
  {
    markers: [
      ".input(retailOpsCreateSubscriptionCheckoutIntentSchema)",
      "assertCanViewRetailOpsSubscription",
      "assertCanManageRetailOpsBilling",
      "getRetailOpsSubscriptionSnapshot",
      "createRetailOpsSubscriptionCheckoutIntent",
    ],
    reason:
      "focused subscription router must keep billing permissions, schema validation, snapshot reads, and provider-neutral checkout intent creation",
  },
]
const QUERY_MARKERS = [
  "createRetailOpsProduct",
  "getRetailOpsProductUnitPriceAt",
  "listRetailOpsProductUnitPriceHistory",
  "listRetailOpsProductUnitTemplates",
  "createRetailOpsSale",
  "inviteRetailOpsStaff",
  "getRetailOpsCustomerBook",
  "recordRetailOpsSyncRun",
  "createRetailOpsProductShareLink",
  "createRetailOpsSharedProductOrderRequest",
  "getRetailOpsSubscriptionSnapshot",
]
const SCHEMA_MARKERS = [
  "retailOpsCreateProductSchema",
  "retailOpsProductUnitEffectivePriceSchema",
  "retailOpsProductUnitPriceHistorySchema",
  "retailOpsCreateSaleSchema",
  "retailOpsInviteStaffSchema",
  "retailOpsSyncEventsSchema",
  "retailOpsCreateProductShareLinkSchema",
  "retailOpsCreateSharedProductOrderRequestSchema",
]
const failures = []

const routerSource = readFileSync(ROUTER_FILE, "utf8")
const productsRouterSource = readFileSync(PRODUCTS_ROUTER_FILE, "utf8")
const salesRouterSource = readFileSync(SALES_ROUTER_FILE, "utf8")
const sessionsRouterSource = readFileSync(SESSIONS_ROUTER_FILE, "utf8")
const shareLinkRouterSource = readFileSync(SHARE_LINK_ROUTER_FILE, "utf8")
const staffRouterSource = readFileSync(STAFF_ROUTER_FILE, "utf8")
const stockRouterSource = readFileSync(STOCK_ROUTER_FILE, "utf8")
const subscriptionsRouterSource = readFileSync(
  SUBSCRIPTIONS_ROUTER_FILE,
  "utf8",
)
const appRouterSource = readFileSync(APP_ROUTER_FILE, "utf8")
const schemaSource = readFileSync(SCHEMA_FILE, "utf8")

if (!appRouterSource.includes("retailOps: retailOpsRouter")) {
  failures.push({
    file: APP_ROUTER_FILE,
    message: "app router must expose the Retail Ops tRPC router.",
  })
}

for (const contract of ROUTER_CONTRACTS) {
  const missingMarkers = contract.markers.filter(
    (marker) => !routerSource.includes(marker),
  )

  if (missingMarkers.length > 0) {
    failures.push({
      file: ROUTER_FILE,
      message: `missing ${missingMarkers.join(", ")} (${contract.reason})`,
    })
  }
}

for (const contract of PRODUCTS_ROUTER_CONTRACTS) {
  const missingMarkers = contract.markers.filter(
    (marker) => !productsRouterSource.includes(marker),
  )

  if (missingMarkers.length > 0) {
    failures.push({
      file: PRODUCTS_ROUTER_FILE,
      message: `missing ${missingMarkers.join(", ")} (${contract.reason})`,
    })
  }
}

for (const contract of SALES_ROUTER_CONTRACTS) {
  const missingMarkers = contract.markers.filter(
    (marker) => !salesRouterSource.includes(marker),
  )

  if (missingMarkers.length > 0) {
    failures.push({
      file: SALES_ROUTER_FILE,
      message: `missing ${missingMarkers.join(", ")} (${contract.reason})`,
    })
  }
}

for (const contract of SESSIONS_ROUTER_CONTRACTS) {
  const missingMarkers = contract.markers.filter(
    (marker) => !sessionsRouterSource.includes(marker),
  )

  if (missingMarkers.length > 0) {
    failures.push({
      file: SESSIONS_ROUTER_FILE,
      message: `missing ${missingMarkers.join(", ")} (${contract.reason})`,
    })
  }
}

for (const contract of SHARE_LINK_ROUTER_CONTRACTS) {
  const missingMarkers = contract.markers.filter(
    (marker) => !shareLinkRouterSource.includes(marker),
  )

  if (missingMarkers.length > 0) {
    failures.push({
      file: SHARE_LINK_ROUTER_FILE,
      message: `missing ${missingMarkers.join(", ")} (${contract.reason})`,
    })
  }
}

for (const contract of STOCK_ROUTER_CONTRACTS) {
  const missingMarkers = contract.markers.filter(
    (marker) => !stockRouterSource.includes(marker),
  )

  if (missingMarkers.length > 0) {
    failures.push({
      file: STOCK_ROUTER_FILE,
      message: `missing ${missingMarkers.join(", ")} (${contract.reason})`,
    })
  }
}

for (const contract of STAFF_ROUTER_CONTRACTS) {
  const missingMarkers = contract.markers.filter(
    (marker) => !staffRouterSource.includes(marker),
  )

  if (missingMarkers.length > 0) {
    failures.push({
      file: STAFF_ROUTER_FILE,
      message: `missing ${missingMarkers.join(", ")} (${contract.reason})`,
    })
  }
}

for (const contract of SUBSCRIPTIONS_ROUTER_CONTRACTS) {
  const missingMarkers = contract.markers.filter(
    (marker) => !subscriptionsRouterSource.includes(marker),
  )

  if (missingMarkers.length > 0) {
    failures.push({
      file: SUBSCRIPTIONS_ROUTER_FILE,
      message: `missing ${missingMarkers.join(", ")} (${contract.reason})`,
    })
  }
}

const directDbAccess =
  `${routerSource}\n${productsRouterSource}\n${salesRouterSource}\n${sessionsRouterSource}\n${shareLinkRouterSource}\n${staffRouterSource}\n${stockRouterSource}\n${subscriptionsRouterSource}`.match(
    /\bctx\.db\.[A-Za-z_]/g,
  ) ?? []
if (directDbAccess.length > 0) {
  failures.push({
    file: REPO_ROOT,
    message: `router must delegate Prisma access to query modules; found direct ctx.db property access: ${[
      ...new Set(directDbAccess),
    ].join(", ")}`,
  })
}

for (const marker of SCHEMA_MARKERS) {
  if (!schemaSource.includes(marker)) {
    failures.push({
      file: SCHEMA_FILE,
      message: `schema module is missing ${marker}.`,
    })
  }
}

const existingQueryFiles = QUERY_FILES.filter((file) => existsSync(file))
if (existingQueryFiles.length !== QUERY_FILES.length) {
  const missingFiles = QUERY_FILES.filter((file) => !existsSync(file)).map(
    (file) => relative(REPO_ROOT, file),
  )

  failures.push({
    file: REPO_ROOT,
    message: `missing focused Retail Ops query modules: ${missingFiles.join(
      ", ",
    )}`,
  })
}

const querySource = existingQueryFiles
  .map((file) => readFileSync(file, "utf8"))
  .join("\n")
for (const marker of QUERY_MARKERS) {
  if (!querySource.includes(marker)) {
    failures.push({
      file: join(REPO_ROOT, "packages/db/src/queries"),
      message: `query modules are missing ${marker}.`,
    })
  }
}

if (failures.length > 0) {
  console.error(
    "Retail Ops API boundary check failed. Keep tRPC validation in the API layer and delegate business/database logic to focused query modules.",
  )

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Retail Ops API boundary check passed.")
