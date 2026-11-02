import { expect, test } from "bun:test"
import { QueryObserver } from "@tanstack/react-query"
import { TRPCClientError } from "@trpc/client"
import { makeQueryClient } from "./query-client"

const failure = (code: string) =>
  TRPCClientError.from({
    error: { code: -32003, data: { code }, message: "inert failure" },
  } as Parameters<typeof TRPCClientError.from>[0])

async function mountCallsAfterFailure(code: string) {
  const client = makeQueryClient()
  let calls = 0
  const queryFn = async () => {
    calls += 1
    throw failure(code)
  }
  const options = { queryKey: ["detail", code], queryFn, retry: false }
  await client.prefetchQuery(options)
  // Each remount of a detail sheet subscribes a fresh observer.
  for (let mount = 0; mount < 3; mount += 1) {
    const unsubscribe = new QueryObserver(client, options).subscribe(() => {})
    await new Promise((resolve) => setTimeout(resolve, 0))
    unsubscribe()
  }
  client.clear()
  return calls
}

test("a refused detail read is not fetched again by remounting its sheet", async () => {
  for (const code of ["NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED"])
    expect(await mountCallsAfterFailure(code)).toBe(1)
})

test("a transient failure still refetches when its sheet remounts", async () => {
  for (const code of ["INTERNAL_SERVER_ERROR", "TIMEOUT"])
    expect(await mountCallsAfterFailure(code)).toBe(4)
})
