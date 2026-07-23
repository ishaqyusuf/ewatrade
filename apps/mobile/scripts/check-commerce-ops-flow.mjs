import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname);
const SOURCE_DIR = join(MOBILE_DIR, "src");
const contracts = [
  {
    file: "components/mobile/admin-tabs/admin-orders-screen.tsx",
    markers: [
      "AdminOrdersScreen",
      "trpc.orders.list",
      "CommerceMetricTile",
      "CommerceOrderRow",
      "CommercePendingOrderRow",
      "commercialOrderHref",
      "customer-book-modal",
      "Loaded orders",
      "30 days",
      "useAdminDockScroll",
    ],
  },
  {
    file: "components/mobile/customer-book-sheet.tsx",
    markers: [
      "CustomerBookContent",
      "trpc.orders.list",
      "buildCommerceCustomers",
      "activeBusinessOfflineCommands",
      "CustomerOverviewContent",
      "CommerceCustomerRow",
      "commercialOrderHref",
    ],
  },
  {
    file: "components/mobile/commerce/customer-overview-content.tsx",
    markers: [
      "CustomerOverviewContent",
      "Customer information",
      "Recent orders",
      '"Information"',
      '"Orders"',
      '"Wishlist"',
      '"Reviews"',
      '"Loyalty"',
      '"Insights"',
      "CustomerOverviewTab",
      "CommerceOrderRow",
      "CommercePendingOrderRow",
    ],
  },
  {
    file: "components/mobile/commercial-order-screen.tsx",
    markers: [
      "CommercialOrderScreen",
      "trpc.orders.get",
      "trpc.orders.recordPayment",
      "trpc.orders.fulfillProductLine",
      "Payment cannot exceed the balance due",
      "Managed in Service jobs",
      "commercial-order-overview-screen",
    ],
  },
  {
    file: "app/order/[orderId].tsx",
    markers: ["CommercialOrderRoute", "CommercialOrderScreen", "orderId"],
  },
  {
    file: "app/_layout.tsx",
    markers: ['name="order/[orderId]"', "Stack.Protected"],
  },
  {
    file: "app/customer-book-modal.tsx",
    markers: ["customerOrderId", "CustomerBookContent", "allowSalesRep"],
  },
];

const forbiddenProductionMarkers = [
  "DESIGN_01_ORDERS",
  "DESIGN_01_CUSTOMERS",
  "ReferenceFabs",
  "ReferenceScreenShell",
];

const failures = [];
for (const contract of contracts) {
  const filePath = join(SOURCE_DIR, contract.file);
  const source = readFileSync(filePath, "utf8");
  for (const marker of contract.markers) {
    if (!source.includes(marker)) {
      failures.push(
        `${relative(MOBILE_DIR, filePath)} is missing marker: ${marker}`,
      );
    }
  }
  for (const marker of forbiddenProductionMarkers) {
    if (source.includes(marker)) {
      failures.push(
        `${relative(MOBILE_DIR, filePath)} must not depend on preview marker: ${marker}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("Mobile production commerce flow check failed.");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Mobile production commerce flow check passed.");
