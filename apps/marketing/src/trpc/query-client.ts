import { captureMarketingError } from "@/observability/sentry"
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
      onError: (error) => captureMarketingError(error, "marketing.mutation"),
    }),
    queryCache: new QueryCache({
      onError: (error) => captureMarketingError(error, "marketing.query"),
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
