import { expect, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { QueryClient } from "@tanstack/react-query"
import { createTRPCClient } from "@trpc/client"
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import { invalidateServiceJobLists } from "./invalidate-service-job-lists"

test("job mutations refresh all stages and paginated queue variants without clearing unrelated data", async () => {
  const cache = new QueryClient()
  const trpc = createTRPCOptionsProxy<AppRouter>({
    client: createTRPCClient<AppRouter>({ links: [] }),
    queryClient: cache,
  })
  const related = [
    trpc.services.queue.queryKey({ storeId: "qa-store" }),
    trpc.services.queuePage.infiniteQueryKey({
      storeId: "qa-store",
      stage: "open",
    }),
    trpc.services.queuePage.infiniteQueryKey({
      storeId: "qa-store",
      stage: "done",
    }),
    trpc.services.queueStageCounts.queryKey({ storeId: "qa-store" }),
  ]
  const unrelated = trpc.tenant.current.queryKey()
  for (const key of [...related, unrelated])
    cache.setQueryData(key, { retained: true })
  await invalidateServiceJobLists(cache, trpc)
  for (const key of related)
    expect(cache.getQueryState(key)?.isInvalidated).toBe(true)
  expect(cache.getQueryState(unrelated)?.isInvalidated).toBe(false)
  expect(cache.getQueryData(unrelated)).toEqual({ retained: true })
  cache.clear()
})
