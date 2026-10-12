import { expect, test } from "bun:test"
import { makeReportCursor, readReportCursor, reportCursorScope } from "./cursor"
test("G01 detail cursors bind original filters, Store, Tenant and creator", () => {
  const filters = {
    tenantId: "tenant",
    storeId: "store",
    creator: "rep",
    currency: "NGN",
    from: "start",
  }
  const scope = reportCursorScope(filters)
  const cursor = makeReportCursor("original", scope)
  expect(readReportCursor(cursor, scope)).toBe("original")
  for (const change of [
    { tenantId: "foreign" },
    { storeId: "foreign" },
    { creator: "other" },
    { currency: "USD" },
    { from: "other" },
  ])
    expect(() =>
      readReportCursor(cursor, reportCursorScope({ ...filters, ...change })),
    ).toThrow()
  expect(() => readReportCursor("bad", scope)).toThrow()
})
