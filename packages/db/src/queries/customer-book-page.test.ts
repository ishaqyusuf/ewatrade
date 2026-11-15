import { describe, expect, test } from "bun:test"
import { listCustomerBookPage } from "./customer-book-page"

const at = (day: number) => new Date(Date.UTC(2026, 10, day))
function row(id: string, day: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    customerId: id.startsWith("customer:") ? id.slice(9) : null,
    identityType: "phone",
    name: id,
    phone: "0800",
    email: null,
    orderCount: 1,
    totalMinor: "100",
    firstSeenAt: at(day),
    lastSeenAt: at(day),
    lastOrderNumber: "ORD-1",
    lastOrderPaymentStatus: "PAID",
    lastOrderStatus: "FULFILLED",
    lastOrderTotalMinor: 100,
    owed: null,
    ahead: null,
    net: null,
    ...extra,
  }
}

function fakeDb(rows: unknown[]) {
  const calls: unknown[] = []
  return {
    calls,
    db: {
      $queryRaw: async (sql: unknown) => {
        calls.push(sql)
        return rows
      },
    } as never,
  }
}

describe("customer book page", () => {
  test("one statement, walk-ins named, balances only when present, cursor on overflow", async () => {
    const { db, calls } = fakeDb([
      row("customer:a", 5, { owed: "500", ahead: "0", net: "500" }),
      row("walk-in:all", 4, { identityType: "walk-in", name: null }),
      row("customer:b", 3),
    ])
    const page = await listCustomerBookPage(db, {
      tenantId: "t",
      storeId: "s",
      includeSavedCustomers: true,
      currencyCode: "NGN",
      limit: 2,
    })
    expect(calls).toHaveLength(1)
    expect(page.rows.map((r) => r.id)).toEqual(["customer:a", "walk-in:all"])
    expect(page.rows[0]?.balance).toEqual({
      owedMinor: "500",
      paidAheadMinor: "0",
      netMinor: "500",
    })
    expect(page.rows[1]?.name).toBe("Walk-in sales")
    expect(page.rows[1]?.balance).toBeNull()
    expect(page.nextCursor).not.toBeNull()
    const decoded = JSON.parse(
      Buffer.from(page.nextCursor ?? "", "base64url").toString("utf8"),
    )
    expect(decoded).toEqual({ t: at(4).toISOString(), id: "walk-in:all" })
  })

  test("last page has no cursor and a bad cursor reads the first page", async () => {
    const { db } = fakeDb([row("customer:a", 5)])
    const page = await listCustomerBookPage(db, {
      tenantId: "t",
      storeId: "s",
      includeSavedCustomers: false,
      cursor: "not-a-cursor",
    })
    expect(page.rows).toHaveLength(1)
    expect(page.nextCursor).toBeNull()
  })
})
