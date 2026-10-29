import { captureDashboardError } from "@/observability/sentry"
import {
  MutationCache,
  QueryCache,
  QueryClient,
  defaultShouldDehydrateQuery,
} from "@tanstack/react-query"
import superjson from "superjson"
import { isRejectedRead } from "./query-read-errors"
import { shouldRetryQuery } from "./query-retry"

export function makeQueryClient() {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error) => captureDashboardError(error, "dashboard.mutation"),
    }),
    queryCache: new QueryCache({
      onError: (error, query) => {
        captureDashboardError(error, "dashboard.query")
        if (isRejectedRead(error)) {
          // A rejected fresh read must not keep an earlier authorized payload visible.
          query.setState({ data: undefined, status: "error" })
        }
      },
    }),
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
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
