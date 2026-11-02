import { expect, mock, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createTRPCClient } from "@trpc/client"
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import { NuqsTestingAdapter } from "nuqs/adapters/testing"
import { renderToStaticMarkup } from "react-dom/server"

// Actual totals strip, URL state and tRPC query keys. Data is seeded in the
// QueryClient; the transport is never reached.
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
})
const trpc = createTRPCOptionsProxy<AppRouter>({
  client: createTRPCClient<AppRouter>({
    links: [
      () => () => {
        throw new Error("Unexpected request")
      },
    ],
  }),
  queryClient: () => client,
})
mock.module("@/trpc/client", () => ({ useTRPC: () => trpc }))
const { StockHistoryTotals } = await import("./stock-history-totals")

const row = (
  productName: string,
  netCanonicalQuantity: string,
  operationCount: number,
) => ({
  storeId: "store-a",
  storeName: "Main store",
  productId: `${productName}-product`,
  catalogItemId: null,
  productName,
  variantId: `${productName}-variant`,
  variantName: productName,
  configurationVersionId: `${productName}-config`,
  canonicalUnitName: "Egg",
  netCanonicalQuantity,
  operationCount,
})

function render(search: string, data: unknown, storeId?: string) {
  const ids = new URLSearchParams(search).get("categories")
  const categoryNameIds = ids ? ids.split(",").map(Number) : []
  const uncategorized = new URLSearchParams(search).get("uncategorized")
  client.setQueryData(
    trpc.inventory.operationTotals.queryKey({
      storeId,
      ...(uncategorized ? { uncategorized: true } : {}),
      ...(categoryNameIds.length ? { categoryNameIds } : {}),
    }),
    data as never,
  )
  if (categoryNameIds.length)
    client.setQueryData(
      trpc.inventory.categorySuggestions.queryKey({
        ids: categoryNameIds,
        limit: 10,
      }),
      [
        { id: 4, name: "Egg collection" },
        { id: 9, name: "Row 1" },
      ],
    )
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NuqsTestingAdapter searchParams={search}>
        <StockHistoryTotals
          storeId={storeId}
          storeLabel={storeId ? "Main store" : "All stores"}
        />
      </NuqsTestingAdapter>
    </QueryClientProvider>,
  )
}

test("names the chosen categories and shows signed net change per product", () => {
  const html = render(
    "?categories=4,9",
    {
      operationCount: 3,
      correctionCount: 1,
      rows: [row("Eggs", "1180", 3), row("Broken eggs", "-24", 1)],
    },
    "store-a",
  )
  expect(html).toContain("Egg collection + Row 1 · Main store")
  expect(html).toContain("From 3 changes · 1 correction included")
  expect(html).toContain("+1,180 eggs")
  expect(html).toContain("−24 eggs")
  expect(html).toContain("From 1 change<")
  expect(html).not.toContain("only filter")
})

test("says what the totals cover when search or a group narrows only the list", () => {
  const html = render(
    "?categories=4,9&q=house&filter=in",
    { operationCount: 3, correctionCount: 0, rows: [row("Eggs", "1180", 3)] },
    "store-a",
  )
  expect(html).toContain(
    "Search “house” and Stock in only filter the list below. Net change counts every change with these categories.",
  )
})

test("all stores list the Store; extra rows wait behind Show all", () => {
  const html = render("?uncategorized=true", {
    operationCount: 4,
    correctionCount: 0,
    rows: ["A", "B", "C", "D"].map((name) => row(name, "1", 1)),
  })
  expect(html).toContain("Uncategorized · All stores")
  expect(html).toContain(" · Main store")
  expect(html).toContain("+1 egg")
  expect(html).toContain("Show all 4")
  expect(html).not.toContain(">D<")
})

test("no matches says so instead of a zero", () => {
  const html = render(
    "?categories=4",
    { operationCount: 0, correctionCount: 0, rows: [] },
    "store-a",
  )
  expect(html).toContain("No changes")
  expect(html).toContain("No changes with these categories.")
})
