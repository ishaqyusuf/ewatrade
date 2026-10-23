import type { useTRPC } from "@/trpc/client"
import type { QueryClient } from "@tanstack/react-query"

/** Refresh every list view and stage total after a Service Job changes. */
export async function invalidateServiceJobLists(
  cache: QueryClient,
  trpc: ReturnType<typeof useTRPC>,
) {
  await Promise.all(
    [
      trpc.services.queue.pathKey(),
      trpc.services.queuePage.pathKey(),
      trpc.services.queueStageCounts.pathKey(),
    ].map((queryKey) => cache.invalidateQueries({ queryKey })),
  )
}
