import { expect, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { QueryClient, type QueryKey } from "@tanstack/react-query"
import { createTRPCClient } from "@trpc/client"
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import { isLoadedFinanceStatement } from "./finance-snapshot-query"

const trpc = createTRPCOptionsProxy<AppRouter>({
  client: createTRPCClient<AppRouter>({ links: [] }),
  queryClient: new QueryClient(),
})
const input = {
  bookId: "book",
  accountId: "account",
  from: new Date("2026-10-01Z"),
  through: new Date("2026-10-30Z"),
  limit: 30,
}
const loaded = (queryKey: QueryKey) => ({
  queryKey,
  state: { status: "success", data: { loaded: true } },
})

test("only loaded statement keys with canonical fixed sequences avoid invalidation", () => {
  for (const snapshotSequence of ["0", "7", "9223372036854775807"]) {
    expect(
      isLoadedFinanceStatement(
        loaded(
          trpc.finance.accountActivity.queryKey({ ...input, snapshotSequence }),
        ),
      ),
    ).toBe(true)
    expect(
      isLoadedFinanceStatement(
        loaded(
          trpc.finance.accountLedger.infiniteQueryKey({
            ...input,
            snapshotSequence,
          }),
        ),
      ),
    ).toBe(true)
  }
  for (const snapshotSequence of [
    undefined,
    "",
    "-1",
    "01",
    "1.5",
    "9223372036854775808",
    "1".repeat(20),
  ])
    expect(
      isLoadedFinanceStatement(
        loaded(
          trpc.finance.accountActivity.queryKey({ ...input, snapshotSequence }),
        ),
      ),
    ).toBe(false)
})
test("failed, pending and absent statement data retain existing refresh behavior", () => {
  const queryKey = trpc.finance.accountActivity.queryKey({
    ...input,
    snapshotSequence: "7",
  })
  for (const status of ["error", "pending"])
    expect(
      isLoadedFinanceStatement({
        queryKey,
        state: { status, data: { retained: true } },
      }),
    ).toBe(false)
  for (const data of [undefined, null])
    expect(
      isLoadedFinanceStatement({
        queryKey,
        state: { status: "success", data },
      }),
    ).toBe(false)
})
test("snapshot numbers alone cannot exempt report metadata or another endpoint", () => {
  for (const queryKey of [
    trpc.finance.reports.queryKey({
      bookId: input.bookId,
      from: input.from,
      through: input.through,
      snapshotSequence: "7",
    }),
    trpc.finance.journal.queryKey({
      bookId: input.bookId,
      snapshotSequence: "7",
    }),
    trpc.customerLedger.statement.queryKey({
      accountId: "ledger",
      snapshotSequence: "7",
      limit: 30,
    }),
    [
      ["finance", "futureRead"],
      { input: { snapshotSequence: "7" }, type: "query" },
    ],
  ])
    expect(isLoadedFinanceStatement(loaded(queryKey))).toBe(false)
})
test("unknown/manual/prefixed key layouts conservatively keep refreshing", () => {
  for (const queryKey of [
    [],
    ["finance"],
    [["finance", "accountActivity"]],
    [["finance", "accountActivity"], { input: null }],
    [
      ["scope"],
      ["finance", "accountActivity"],
      { input: { snapshotSequence: "7" } },
    ],
  ])
    expect(isLoadedFinanceStatement(loaded(queryKey))).toBe(false)
})
