import { QueryClient, QueryObserver } from "@tanstack/query-core"
import { createTRPCClient } from "@trpc/client"
import { observable } from "@trpc/server/observable"
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "../../src/general/staff-activity-target.ts"

// No server or database. Exercise the actual query library's in-flight
// deduplication and the packet's actual display gate during a scope remount.
async function inspect({ consumeCancellation = false, clearCache = false }) {
  const client = new QueryClient()
  let currentAuthority = "Earlier authority"
  let finishRequest
  const blockedRequest = new Promise((resolve) => {
    finishRequest = resolve
  })
  const requests = []
  const options = {
    queryKey: ["retailOps", "staffActivityShown", { events: ["original-id"] }],
    queryFn: async (context) => {
      // Reading the signal activates the real query library's cancellation.
      // The installed tRPC adapter does this only with abortOnUnmount enabled.
      if (consumeCancellation) void context.signal
      const authorizedScope = currentAuthority
      requests.push(authorizedScope)
      await blockedRequest
      return { authorizedScope, data: ["original-id"] }
    },
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  }
  const original = new QueryObserver(client, options)
  const unsubscribeOriginal = original.subscribe(() => {})
  await Promise.resolve()
  unsubscribeOriginal()
  // Close/reopen itself does not call the app's global cache-clear routines.
  // Ordinary workspace/auth switches DO clear, covered by the third control.
  if (clearCache) client.clear()
  currentAuthority = "Changed authority"
  const nextMount = new QueryObserver(client, options)
  const unsubscribeNext = nextMount.subscribe(() => {})
  finishRequest()
  await new Promise((resolve) => setTimeout(resolve, 0))
  const result = freshShownRead(nextMount.getCurrentResult())
  const observed = {
    consumeCancellation,
    clearCache,
    currentAuthority,
    requests,
    display: result,
    oldAuthorityResponseRendered:
      result.state === "ready" &&
      result.data.authorizedScope !== currentAuthority,
  }
  unsubscribeNext()
  client.clear()
  return observed
}

console.log(
  JSON.stringify(
    await Promise.all([
      inspect({}),
      inspect({ consumeCancellation: true }),
      inspect({ clearCache: true }),
    ]),
    null,
    2,
  ),
)

// The per-mount key must still invoke the canonical procedure through the
// installed tRPC adapter. The link is local only: no HTTP/server/database.
const adapterClient = new QueryClient()
const calls = []
const trpcClient = createTRPCClient({
  links: [
    () =>
      ({ op }) =>
        observable((observer) => {
          calls.push({ path: op.path, input: op.input })
          observer.next({ result: { data: { rows: [] } } })
          observer.complete()
        }),
  ],
})
const proxy = createTRPCOptionsProxy({
  client: trpcClient,
  queryClient: adapterClient,
})
const input = { events: [{ stream: "ORDER", id: "original-id" }] }
const canonical = proxy.retailOps.staffActivityShown.queryOptions(input, {
  trpc: { abortOnUnmount: true },
})
const mounted = mountOwnedRead(canonical, nextReadMount())
const adapterResults = []
for (const [label, options] of [
  ["canonical", canonical],
  ["mount-owned", mounted],
]) {
  try {
    const data = await options.queryFn({
      queryKey: options.queryKey,
      signal: new AbortController().signal,
    })
    adapterResults.push({ label, data })
  } catch (error) {
    adapterResults.push({ label, error: String(error) })
  }
}
console.log(JSON.stringify({ adapterResults, calls }, null, 2))
adapterClient.clear()
