import { expect, test } from "bun:test"
import { listFinancePeriodAudit } from "./period-audit"

const actor = { tenantId: "tenant-1", actorUserId: "owner-1", bookId: "book-1" }
type Row = {
  id: string
  bookId: string
  kind: string
  createdAt: Date
  actorUserId: string
  result: { id: string; audit: { reason: string } }
}
function row(index: number, bookId = "book-1", kind = "PERIOD_CLOSE"): Row {
  return {
    id: `command-${index.toString().padStart(4, "0")}`,
    bookId,
    kind,
    // Repeated timestamps force pagination to use the ID tie-breaker.
    createdAt: new Date(Date.UTC(2026, 9, 1, 12, 0, Math.floor(index / 5))),
    actorUserId: "original-actor",
    result: { id: "period-reclosed", audit: { reason: `Review ${index}` } },
  }
}
function fixture(rows: Row[], authorized = true, bookExists = true) {
  const calls: { book?: unknown; transactionOptions?: unknown; reads: number } =
    {
      reads: 0,
    }
  type Scope = { bookId: string; kind: { in: string[] }; id?: string }
  const match = (entry: Row, scope: Scope) =>
    entry.bookId === scope.bookId &&
    scope.kind.in.includes(entry.kind) &&
    (!scope.id || entry.id === scope.id)
  const tx = {
    $queryRaw: async () => [],
    membership: {
      findFirst: async () =>
        authorized ? { tenant: { id: actor.tenantId, isActive: true } } : null,
    },
    financeBook: {
      findFirst: async (query: unknown) => {
        calls.book = query
        return bookExists ? { id: actor.bookId } : null
      },
    },
    financeCommand: {
      findFirst: async ({ where }: { where: Scope }) => {
        calls.reads += 1
        return rows.find((entry) => match(entry, where)) ?? null
      },
      findMany: async ({
        where,
        take,
      }: {
        where: Scope & {
          OR?: [
            { createdAt: { lt: Date } },
            { createdAt: Date; id: { lt: string } },
          ]
        }
        take: number
      }) => {
        calls.reads += 1
        const boundary = where.OR
        return rows
          .filter(
            (entry) =>
              match(entry, where) &&
              (!boundary ||
                entry.createdAt < boundary[0].createdAt.lt ||
                (entry.createdAt.getTime() ===
                  boundary[1].createdAt.getTime() &&
                  entry.id < boundary[1].id.lt)),
          )
          .sort(
            (left, right) =>
              right.createdAt.getTime() - left.createdAt.getTime() ||
              right.id.localeCompare(left.id),
          )
          .slice(0, take)
      },
    },
  }
  return {
    calls,
    db: {
      $transaction: async (
        callback: (transaction: typeof tx) => unknown,
        options: unknown,
      ) => {
        calls.transactionOptions = options
        return callback(tx)
      },
    } as never,
  }
}

test("all 137 immutable close/reopen audits remain reachable across timestamp ties", async () => {
  const original = Array.from({ length: 137 }, (_, index) =>
    row(index, "book-1", index % 2 ? "PERIOD_REOPEN" : "PERIOD_CLOSE"),
  )
  const { db, calls } = fixture([
    ...original,
    row(999, "foreign-book"),
    row(998, "book-1", "PAY_BILL"),
  ])
  const collected: Row[] = []
  let cursor: string | undefined
  let pages = 0
  do {
    const page = await listFinancePeriodAudit(db, {
      ...actor,
      cursor,
      limit: 17,
    })
    collected.push(...(page.events as Row[]))
    cursor = page.nextCursor ?? undefined
    pages += 1
  } while (cursor)
  expect(pages).toBe(9)
  expect(collected.map((entry) => entry.id)).toEqual(
    original.toReversed().map((entry) => entry.id),
  )
  expect(new Set(collected.map((entry) => entry.id)).size).toBe(137)
  expect(collected[136]?.result).toEqual(original[0]?.result)
  expect(collected[0]?.actorUserId).toBe("original-actor")
  expect(calls.book).toEqual({
    where: { id: actor.bookId, tenantId: actor.tenantId },
    select: { id: true },
  })
  expect(calls.transactionOptions).toEqual({
    maxWait: 10_000,
    timeout: 30_000,
    isolationLevel: "RepeatableRead",
  })
})

test("foreign, non-period and unknown audit cursors refuse before page read", async () => {
  for (const cursor of ["command-0999", "command-0998", "missing"]) {
    const { db, calls } = fixture([
      row(1),
      row(999, "foreign-book"),
      row(998, "book-1", "PAY_BILL"),
    ])
    await expect(
      listFinancePeriodAudit(db, { ...actor, cursor }),
    ).rejects.toMatchObject({
      code: "INVALID_JOURNAL",
    })
    expect(calls.reads).toBe(1)
  }
})

test("unauthorized membership and foreign Book do not expose command history", async () => {
  for (const [authorized, bookExists, code] of [
    [false, true, "FORBIDDEN"],
    [true, false, "NOT_FOUND"],
  ] as const) {
    const { db, calls } = fixture([row(1)], authorized, bookExists)
    await expect(listFinancePeriodAudit(db, actor)).rejects.toMatchObject({
      code,
    })
    expect(calls.reads).toBe(0)
    if (!authorized) expect(calls.book).toBeUndefined()
  }
})

test("empty history and exact last page return no phantom cursor", async () => {
  for (const entries of [[], [row(1), row(2)]]) {
    const { db } = fixture(entries)
    const page = await listFinancePeriodAudit(db, { ...actor, limit: 2 })
    expect(page.events.length).toBe(entries.length)
    expect(page.nextCursor).toBeNull()
  }
})

test("invalid identifiers and unbounded page sizes refuse before transaction", async () => {
  const db = {
    $transaction: () => {
      throw new Error("Invalid inputs must not reach the database")
    },
  } as never
  for (const invalid of [
    { bookId: " " },
    { cursor: "" },
    { cursor: "a".repeat(129) },
    { limit: 0 },
    { limit: 51 },
    { limit: 1.5 },
    { limit: Number.NaN },
  ]) {
    await expect(
      listFinancePeriodAudit(db, { ...actor, ...invalid }),
    ).rejects.toMatchObject({
      code: "INVALID_JOURNAL",
    })
  }
})
