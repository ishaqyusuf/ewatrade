import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILES = {
  createSale: join(MOBILE_DIR, "src/components/mobile/create-sale-sheet.tsx"),
  customerBook: join(
    MOBILE_DIR,
    "src/components/mobile/customer-book-sheet.tsx",
  ),
  customerQueries: join(
    REPO_ROOT,
    "packages/db/src/queries/retail-ops-customers.ts",
  ),
  dashboard: join(MOBILE_DIR, "src/app/dashboard.tsx"),
  router: join(REPO_ROOT, "apps/api/src/trpc/routers/retail-ops.ts"),
  schemas: join(REPO_ROOT, "apps/api/src/schemas/retail-ops.ts"),
  store: join(MOBILE_DIR, "src/store/retailOpsStore.ts"),
}

const CONTRACTS = [
  {
    file: FILES.createSale,
    markers: [
      "BottomSheetSectionList",
      "trpc.retailOps.customerBook.queryOptions",
      "normalizedCustomerSearch",
      "localCustomerOptions",
      "productionCustomerOptions",
      "visibleCustomerOptions",
      "setSelectedCustomer(null)",
      "selectCustomer",
      "scrollToCustomerInput",
      "Enter customer name",
      "customerEmail: selectedCustomer?.email",
      "customerPhone: selectedCustomer?.phone",
      "customerName: resolvedCustomerName || undefined",
    ],
    reason:
      "checkout must keep keyboard-safe customer entry, production customer search, local fallback options, selection reset, selection handoff, and identity forwarding",
  },
  {
    file: FILES.customerBook,
    markers: [
      "BottomSheetFlatList",
      "StatusBadge",
      "StatusBanner",
      "EmptyState",
      "trpc.retailOps.customerBook.queryOptions",
      "mapProductionCustomer",
      "mapLocalCustomer",
      "visibleCustomers",
      "productionCustomersQuery.isError",
      "Showing customers saved on this device until sync reconnects.",
      "Production customer book includes sales and shared-link requests.",
      "No customers found",
      "New customers appear here after a sale or shared-link request.",
    ],
    reason:
      "customer book sheet must stay virtualized and keep production/local merged rows, offline fallback copy, empty state, and shared-link customer visibility",
  },
  {
    file: FILES.dashboard,
    markers: [
      "CustomerBookSheet",
      "customerModal.present",
      "trpc.retailOps.customerBook.queryOptions",
      "customerPreviewRows",
      "localCustomerPreview",
      "productionCustomerPreview",
      "No saved customers yet",
    ],
    reason:
      "dashboard must keep the customer book entry point and production plus local customer previews",
  },
  {
    file: FILES.store,
    markers: [
      "customers: RetailOpsCustomer[]",
      "const existingCustomer = state.customers.find",
      "saleCount: (customer.saleCount ?? 0) + 1",
      "saleCount: 1",
      'customerName: customerName || "Walk-in customer"',
      '"customer_upsert"',
      "`Customer: ${customerName}`",
      'kind: "customer" as const',
      "remoteId: mapping?.customerId ?? customer.remoteId",
    ],
    reason:
      "local store must save new checkout customers immediately, refresh repeat customers, queue customer_upsert events, and reconcile production ids after sync",
  },
  {
    file: FILES.router,
    markers: [
      "customerBook: protectedProcedure",
      ".input(retailOpsCustomerBookSchema)",
      "getRetailOpsCustomerBook(ctx.db",
      "actorUserId: getRetailOpsActorReadScope",
      "limit: input.limit",
      "search: input.search",
      "tenantId: ctx.tenantContext.tenant.id",
    ],
    reason:
      "API must keep protected customer book reads scoped by tenant, store, role-aware actor, search, and limit",
  },
  {
    file: FILES.schemas,
    markers: [
      "retailOpsCustomerBookSchema",
      "limit: z.coerce.number().int().min(1).max(100).default(50)",
      "search: z.string().trim().min(1).max(120).optional()",
      "retailOpsCustomerUpsertSchema",
      "lastSaleExternalId",
    ],
    reason:
      "API schemas must keep bounded customer book reads and customer upsert payload validation",
  },
  {
    file: FILES.customerQueries,
    markers: [
      "getRetailOpsCustomerBook",
      "getDurableRetailOpsCustomerBook",
      "getOrderDerivedRetailOpsCustomerBook",
      "mergeCustomerBookEntries",
      "recordRetailOpsCustomerUpsert",
      "recordRetailOpsSharedLinkCustomer",
      "createCustomerBookId",
      'source: "customer_upsert"',
      "RetailOpsCustomerError",
    ],
    reason:
      "database queries must merge durable and order-derived customer rows, record sync upserts, keep shared-link customer capture, and produce stable customer ids",
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
    "Customer book flow check failed. Restore checkout customer lookup, customer book listing, API reads, durable queries, or offline customer sync.",
  )

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Customer book flow check passed.")
