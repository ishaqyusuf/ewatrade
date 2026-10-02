import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  ReviewedCostBookContext,
  readReviewedCostBook,
} from "./reviewed-cost-book-context"

const scope = { tenantId: "tenant", actorUserId: "owner", bookId: "book" }
function fixture(
  options: { denied?: boolean; inactive?: boolean; missing?: boolean } = {},
) {
  const calls: string[] = []
  const book = {
    id: "book",
    tenantId: "tenant",
    currencyCode: "NGN",
    timezone: "Africa/Lagos",
    startsAt: new Date("2026-01-01"),
    closedThrough: new Date("2026-02-01"),
    lastSequence: 9007199254740993n,
    createdById: "owner",
    createdAt: new Date("2026-01-01"),
  }
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      calls.push(
        strings.join("").includes('"FinanceBook"')
          ? "book-lock"
          : "membership-lock",
      )
      return options.missing ? [] : [{ id: "book" }]
    },
    membership: {
      findFirst: async () => {
        calls.push("permission")
        return options.denied
          ? null
          : {
              tenant: {
                id: "tenant",
                currencyCode: "NGN",
                timezone: "Africa/Lagos",
                isActive: !options.inactive,
              },
            }
      },
    },
    financeBook: {
      findUniqueOrThrow: async () => {
        calls.push("book-read")
        return book
      },
    },
  } as unknown as Prisma.TransactionClient
  return { tx, calls, book }
}

test("composition retains one authorized Book snapshot, exact sequence and closed date", async () => {
  const f = fixture()
  const context = await ReviewedCostBookContext.acquire(f.tx, scope)
  for (let i = 0; i < 5; i++)
    expect(await readReviewedCostBook(f.tx, scope, context)).toBe(f.book)
  expect(f.calls).toEqual([
    "book-lock",
    "membership-lock",
    "permission",
    "book-read",
  ])
  expect(context.read(f.tx, scope).lastSequence).toBe(9007199254740993n)
  expect(context.read(f.tx, scope).closedThrough).toEqual(
    new Date("2026-02-01"),
  )
})
for (const field of ["tenantId", "actorUserId", "bookId"] as const) {
  test(`a held read cannot authorize a different ${field}`, async () => {
    const f = fixture()
    const context = await ReviewedCostBookContext.acquire(f.tx, scope)
    await expect(
      readReviewedCostBook(f.tx, { ...scope, [field]: "other" }, context),
    ).rejects.toThrow("cannot cross")
    expect(f.calls).toHaveLength(4)
  })
}
test("a held read cannot cross transactions", async () => {
  const f = fixture()
  const other = fixture()
  const context = await ReviewedCostBookContext.acquire(f.tx, scope)
  await expect(readReviewedCostBook(other.tx, scope, context)).rejects.toThrow(
    "cannot cross",
  )
  expect(other.calls).toHaveLength(0)
})
for (const option of ["denied", "inactive"] as const) {
  test(`context acquisition preserves ${option} manager refusal`, async () => {
    const f = fixture({ [option]: true })
    await expect(ReviewedCostBookContext.acquire(f.tx, scope)).rejects.toThrow(
      "Only active",
    )
    expect(f.calls).not.toContain("book-read")
  })
}
test("context acquisition rejects a missing Book", async () => {
  const f = fixture({ missing: true })
  await expect(ReviewedCostBookContext.acquire(f.tx, scope)).rejects.toThrow(
    "not found",
  )
  expect(f.calls).not.toContain("book-read")
})
test("context acquisition rejects crossed actual Book identity", async () => {
  const f = fixture()
  f.book.tenantId = "other"
  await expect(ReviewedCostBookContext.acquire(f.tx, scope)).rejects.toThrow(
    "scope differs",
  )
})
test("standalone reads still authorize independently with no shared cache", async () => {
  const f = fixture()
  await readReviewedCostBook(f.tx, scope)
  await readReviewedCostBook(f.tx, scope)
  expect(f.calls).toHaveLength(8)
  const denied = fixture({ denied: true })
  await expect(readReviewedCostBook(denied.tx, scope)).rejects.toThrow(
    "Only active",
  )
})
