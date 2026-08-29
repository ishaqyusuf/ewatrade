import { captureDashboardError } from "@/observability/sentry"
import {
  MutationCache,
  QueryCache,
  QueryClient,
  defaultShouldDehydrateQuery,
} from "@tanstack/react-query"
import superjson from "superjson"

export function makeQueryClient() {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error) => captureDashboardError(error, "dashboard.mutation"),
    }),
    queryCache: new QueryCache({
      onError: (error) => captureDashboardError(error, "dashboard.query"),
    }),
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  })
}
