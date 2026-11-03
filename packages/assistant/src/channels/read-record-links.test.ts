import { expect, test } from "bun:test"
import {
  plannedReportAppInstruction,
  plannedReportAppLink,
  readRecordAppLink,
} from "./read-record-links"

const scope = { tenantId: "business-one", storeId: "store-one" }
const options = {
  trustedAppOrigin: "https://dash.ewatrade.com",
  currentScope: scope,
}

test("trusted static routes open exact catalog and order records and honestly label the customer directory", () => {
  expect(
    readRecordAppLink(
      { kind: "customer", customerId: "customer-one", origin: scope },
      options,
    ),
  ).toEqual({
    href: "https://dash.ewatrade.com/customers?customerDetail=customer-one",
    label: "Open saved customer in EwaTrade",
    kind: "record",
  })
  expect(
    readRecordAppLink(
      { kind: "catalog_item", catalogItemId: "item-one", origin: scope },
      options,
    ),
  ).toEqual({
    href: "https://dash.ewatrade.com/sales?catalogDetail=item-one",
    label: "Open catalog item in EwaTrade",
    kind: "record",
  })
  expect(
    readRecordAppLink(
      { kind: "order", orderId: "order-one", origin: scope },
      options,
    ),
  ).toEqual({
    href: "https://dash.ewatrade.com/sales/orders/order-one",
    label: "Open saved order in EwaTrade",
    kind: "record",
  })
  expect(
    readRecordAppLink({ kind: "customer_directory", origin: scope }, options),
  ).toEqual({
    href: "https://dash.ewatrade.com/customers",
    label: "Open customer directory in EwaTrade",
    kind: "directory",
  })
})

test("different or missing original business/Store scope withholds all navigation", () => {
  for (const origin of [
    { tenantId: "other", storeId: scope.storeId },
    { tenantId: scope.tenantId, storeId: "other" },
    { tenantId: scope.tenantId },
  ]) {
    expect(
      readRecordAppLink({ kind: "customer_directory", origin }, options),
    ).toBeUndefined()
    expect(
      readRecordAppLink(
        { kind: "order", orderId: "order-one", origin },
        options,
      ),
    ).toBeUndefined()
    expect(
      readRecordAppLink(
        { kind: "customer", customerId: "customer-one", origin },
        options,
      ),
    ).toBeUndefined()
  }
})

test("only a configured HTTPS origin without credentials, paths, queries or fragments is allowed", () => {
  const target = { kind: "order", orderId: "order-one", origin: scope }
  for (const trustedAppOrigin of [
    "http://localhost:3094",
    "javascript:alert(1)",
    "https://name:secret@dash.ewatrade.com",
    "https://dash.ewatrade.com/path",
    "https://dash.ewatrade.com/.",
    "https://dash.ewatrade.com/%2e",
    "https://@dash.ewatrade.com",
    "https://dash.ewatrade.com/?",
    "https://dash.ewatrade.com/#",
    "https://dash.ewatrade.com/?token=secret",
    "https://dash.ewatrade.com/#secret",
    "https://dash.ewatrade.com\\@untrusted.test",
    " https://dash.ewatrade.com",
    "bad-origin",
  ]) {
    expect(
      readRecordAppLink(target, { ...options, trustedAppOrigin }),
    ).toBeUndefined()
  }
  expect(
    readRecordAppLink(target, {
      ...options,
      trustedAppOrigin: "https://ewatrade-dashboard.localhost:3094/",
    })?.href,
  ).toBe("https://ewatrade-dashboard.localhost:3094/sales/orders/order-one")
})

test("record identities cannot insert routes, credential parameters or external hosts", () => {
  const hostile = "//untrusted.test/other?token=not-an-auth-token#fragment"
  const catalog = readRecordAppLink(
    { kind: "catalog_item", catalogItemId: hostile, origin: scope },
    options,
  )
  const order = readRecordAppLink(
    { kind: "order", orderId: hostile, origin: scope },
    options,
  )
  expect(catalog).toBeDefined()
  expect(order).toBeDefined()
  expect(new URL(catalog?.href ?? "").origin).toBe(options.trustedAppOrigin)
  expect(new URL(catalog?.href ?? "").searchParams.get("catalogDetail")).toBe(
    hostile,
  )
  expect([...new URL(catalog?.href ?? "").searchParams.keys()]).toEqual([
    "catalogDetail",
  ])
  expect(new URL(order?.href ?? "").pathname).toStartWith(
    "/sales/orders/%2F%2F",
  )
  expect(new URL(order?.href ?? "").search).toBe("")
  expect(new URL(order?.href ?? "").hash).toBe("")
  expect(
    readRecordAppLink(
      {
        kind: "order",
        orderId: "order-one",
        origin: scope,
        url: "https://untrusted.test",
      },
      options,
    ),
  ).toBeUndefined()
})

test("planned reports deep link only to verified stable report pages", () => {
  const reportOptions = { trustedAppOrigin: "https://dash.ewatrade.com" }
  expect(
    plannedReportAppLink("finance.posted_profit.report", reportOptions),
  ).toEqual({
    href: "https://dash.ewatrade.com/finance/reports",
    label: "Open profit and loss in EwaTrade",
    kind: "report",
  })
  expect(
    plannedReportAppLink("customers.debt.report", reportOptions)?.href,
  ).toBe("https://dash.ewatrade.com/customer-ledger")
  expect(
    plannedReportAppLink("inventory.stock.report", reportOptions)?.href,
  ).toBe("https://dash.ewatrade.com/inventory")
  // No single stable page yet: keep the saved chat link only.
  for (const id of [
    "sales.items.report",
    "finance.supplier_aging.report",
    "toString",
    "__proto__",
  ])
    expect(plannedReportAppLink(id, reportOptions)).toBeUndefined()
  expect(
    plannedReportAppLink("finance.posted_profit.report", {
      trustedAppOrigin: "https://dash.ewatrade.com?token=secret",
    }),
  ).toBeUndefined()
  expect(plannedReportAppInstruction).toStartWith("📊 ")
})
