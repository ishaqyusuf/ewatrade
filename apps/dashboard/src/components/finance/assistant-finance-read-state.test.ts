import { expect, test } from "bun:test"
import { generalCashCountReadInput } from "@ewatrade/assistant/general/contracts"
import { QueryClient, QueryObserver } from "@tanstack/react-query"
import { assistantFinanceReadState } from "./assistant-finance-read-state"
test("cached current review stays hidden through fresh read and revocation failure", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const key = ["g02-original-count"]
  client.setQueryData(key, { status: "MATCHED" })
  let rejectRead: (reason: Error) => void = () => {}
  const pending = new Promise<{ status: string }>((_, reject) => {
    rejectRead = reject
  })
  const observer = new QueryObserver(client, {
    queryKey: key,
    queryFn: () => pending,
    retry: false,
    staleTime: 0,
  })
  const unsubscribe = observer.subscribe(() => {})
  const fetching = observer.getCurrentResult()
  expect(fetching.data).toEqual({ status: "MATCHED" })
  expect(fetching.isFetching).toBe(true)
  expect(assistantFinanceReadState(true, fetching)).toBe("loading")
  const finished = observer.refetch()
  rejectRead(Error("Access revoked"))
  const revoked = await finished
  expect(revoked.isError).toBe(true)
  expect(revoked.data).toEqual({ status: "MATCHED" })
  expect(assistantFinanceReadState(true, revoked)).toBe("error")
  unsubscribe()
  client.clear()
})
test("invalid count identity disables the native query and gives clear invalid state", async () => {
  const client = new QueryClient()
  let calls = 0
  const input = generalCashCountReadInput.safeParse({
    bookId: " ",
    countId: "original-count",
  })
  const observer = new QueryObserver(client, {
    queryKey: ["g02-invalid-count"],
    enabled: input.success,
    queryFn: async () => {
      calls++
      return { id: "wrong" }
    },
  })
  const unsubscribe = observer.subscribe(() => {})
  expect(input.success).toBe(false)
  expect(
    assistantFinanceReadState(input.success, observer.getCurrentResult()),
  ).toBe("invalid")
  expect(calls).toBe(0)
  expect(
    generalCashCountReadInput.safeParse({
      bookId: "book",
      countId: "x".repeat(129),
    }).success,
  ).toBe(false)
  unsubscribe()
  client.clear()
})
