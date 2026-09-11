import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const SOURCE_DIR = join(MOBILE_DIR, "src")
const contracts = [
  {
    file: "components/mobile/admin-tabs/admin-orders-screen.tsx",
    markers: [
      "AdminOrdersScreen",
      "trpc.orders.list",
      "OrdersDispatchLedgerSummary",
      "OrdersDispatchLedgerRow",
      "OrdersDispatchFilterRow",
      "CommercePendingOrderRow",
      "commercialOrderHref",
      "customer-book-modal",
      "30 days",
      "useAdminDockScroll",
      "statusBarColor",
      "showFirstOrderGate",
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
      "orderLinked={Boolean(initialOrderId)}",
      "CommerceCustomerRow",
      "commercialOrderHref",
      "getCustomerBookPresentation",
      "Add first customer",
      'variant="flat"',
      "paddingHorizontal: 8",
      'className="px-2"',
    ],
  },
  {
    file: "components/mobile/commerce/commerce-primitives.tsx",
    markers: [
      "className?: string",
      '"border-b border-border py-4 active:bg-accent"',
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
      "orderLinked",
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
      "OrderDetailDispatchDocket",
      "OrderPaymentSheet",
      "OrderFulfilmentConfirmationSheet",
      "openFulfilProductLine",
      "confirmFulfilProductLine",
    ],
  },
  {
    file: "components/mobile/order-action-sheet.tsx",
    markers: [
      "OrderPaymentSheet",
      "OrderFulfilmentConfirmationSheet",
      "OrderQuietSummary",
      "OrderQuietActionStack",
      "bottomOffset={24}",
      "extraKeyboardSpace={24}",
      'tone="palm"',
    ],
  },
  {
    file: "components/mobile/commerce/commercial-order-overview.tsx",
    markers: [
      "CommercialOrderOverviewContent",
      "Managed in Service jobs",
      "commercial-order-overview-screen",
    ],
  },
  {
    file: "components/mobile/order-detail-dispatch-docket.tsx",
    markers: [
      "OrderDetailDispatchDocket",
      "order-detail-docket-masthead",
      "Dispatch lines",
      "Next movement",
      "OrderDetailDispatchDocketPrimaryAction",
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
]

const scopedContracts = [
  {
    classTokens: [
      "min-h-11",
      "min-w-20",
      "items-center",
      "justify-center",
      "rounded-xl",
      "px-5",
      "active:bg-accent",
    ],
    endMarker: "export function CommerceMetricTile",
    file: "components/mobile/commerce/commerce-primitives.tsx",
    markers: [
      "export function CommerceFilterChip",
      "accessibilityState={{ selected: active }}",
      "\n      transition\n",
    ],
    name: "CommerceFilterChip",
    startMarker: "export function CommerceFilterChip",
  },
]

const forbiddenProductionMarkers = [
  "DESIGN_01_ORDERS",
  "DESIGN_01_CUSTOMERS",
  "ReferenceFabs",
  "ReferenceScreenShell",
]

const failures = []
for (const contract of contracts) {
  const filePath = join(SOURCE_DIR, contract.file)
  const source = readFileSync(filePath, "utf8")
  for (const marker of contract.markers) {
    if (!source.includes(marker)) {
      failures.push(
        `${relative(MOBILE_DIR, filePath)} is missing marker: ${marker}`,
      )
    }
  }
  for (const marker of forbiddenProductionMarkers) {
    if (source.includes(marker)) {
      failures.push(
        `${relative(MOBILE_DIR, filePath)} must not depend on preview marker: ${marker}`,
      )
    }
  }
}

for (const contract of scopedContracts) {
  const filePath = join(SOURCE_DIR, contract.file)
  const source = readFileSync(filePath, "utf8")
  const start = source.indexOf(contract.startMarker)
  const end = source.indexOf(contract.endMarker, start + 1)
  const scope = start === -1 || end === -1 ? "" : source.slice(start, end)

  for (const marker of contract.markers) {
    if (!scope.includes(marker)) {
      failures.push(
        `${relative(MOBILE_DIR, filePath)} ${contract.name} is missing marker: ${marker}`,
      )
    }
  }
  for (const classToken of contract.classTokens ?? []) {
    if (!scope.match(new RegExp(`(?:^|[\\s\"])${classToken}(?=\\s|\")`))) {
      failures.push(
        `${relative(MOBILE_DIR, filePath)} ${contract.name} is missing class token: ${classToken}`,
      )
    }
  }
}

if (failures.length > 0) {
  console.error("Mobile production commerce flow check failed.")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Mobile production commerce flow check passed.")
