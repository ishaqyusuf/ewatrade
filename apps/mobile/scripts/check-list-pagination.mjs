import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const SOURCE_DIR = join(MOBILE_DIR, "src")
const contracts = [
  {
    file: "lib/list-pagination.ts",
    markers: [
      "LIST_SEARCH_THRESHOLD = 10",
      "totalCount > LIST_SEARCH_THRESHOLD",
      "LIST_PAGE_SIZE = 20",
    ],
  },
  {
    file: "components/mobile/bottom-search-footer.tsx",
    markers: [
      "totalCount: number",
      "alwaysShowSearch?: boolean",
      "alwaysShowSearch || shouldShowListSearch(totalCount)",
      'layout?: "inline" | "stacked"',
    ],
  },
  {
    file: "components/mobile/admin-tabs/admin-orders-screen.tsx",
    markers: [
      "trpc.orders.listPage.infiniteQueryOptions",
      "orders.fetchNextPage()",
      "shouldShowListSearch",
    ],
  },
  {
    file: "components/mobile/customer-book-sheet.tsx",
    markers: [
      "trpc.orders.listPage.infiniteQueryOptions",
      "trpc.orders.customerCount.queryOptions",
      "orders.fetchNextPage()",
    ],
  },
  {
    file: "components/mobile/catalog-items-sheet.tsx",
    markers: [
      "trpc.catalog.listItemsPage.infiniteQueryOptions",
      "itemsQuery.fetchNextPage()",
      "shouldShowListSearch",
    ],
  },
  {
    file: "components/mobile/create-sale-sheet.tsx",
    markers: [
      "trpc.catalog.listItemsPage.infiniteQueryOptions",
      "trpc.orders.listPage.infiniteQueryOptions",
      "catalog.fetchNextPage()",
      "recentOrders.fetchNextPage()",
    ],
  },
  {
    file: "components/mobile/service-jobs-sheet.tsx",
    markers: [
      "trpc.services.queuePage.infiniteQueryOptions",
      "jobsQuery.fetchNextPage()",
      "shouldShowListSearch",
    ],
  },
]

const failures = []
for (const contract of contracts) {
  const path = join(SOURCE_DIR, contract.file)
  const source = readFileSync(path, "utf8")
  for (const marker of contract.markers) {
    if (!source.includes(marker)) {
      failures.push(`${relative(MOBILE_DIR, path)} is missing ${marker}`)
    }
  }
}

if (failures.length > 0) {
  console.error("Mobile list pagination check failed.")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Mobile list pagination check passed.")
