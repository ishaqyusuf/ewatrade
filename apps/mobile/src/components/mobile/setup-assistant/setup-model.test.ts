import { expect, test } from "bun:test"
import {
  readSetupCache,
  readSetupRun,
  readSetupSnapshot,
  setupAreas,
  setupCommitKeys,
  setupCounts,
  setupPlainText,
  setupRecordRoute,
} from "./setup-model"
const entity = {
  key: "eggs",
  kind: "PRODUCT",
  state: "CONFIRMED" as const,
  payload: {
    kind: "product",
    name: "Eggs",
    unitName: "Crate",
    priceMinor: 450000,
  },
}
test("only explicitly confirmed records and unresolved committed balances may be added", () => {
  const es = [
    entity,
    { ...entity, key: "needs", state: "NEEDS_INPUT" as const },
    { ...entity, key: "skip", state: "SKIPPED" as const },
    {
      ...entity,
      key: "balance",
      state: "COMMITTED" as const,
      errorCode: "OPENING_BALANCE_PENDING",
    },
  ]
  expect(setupCommitKeys(es)).toEqual(["eggs", "balance"])
  expect(setupCounts(es)).toEqual({ open: 2, confirmed: 1, check: 1, added: 1 })
})

test("guided progress retains server marks and old snapshots derive staged counts only", () => {
  const data = readSetupSnapshot({
    enabled: true,
    conversation: null,
    currencyCode: "NGN",
    messages: [],
    draft: { revision: 1, entities: [entity] },
    areas: [{ area: "sell", label: "Sell", status: "DONE", records: 1 }],
  })
  expect(setupAreas(data)[0]?.status).toBe("DONE")
  expect(
    setupAreas(data ? { ...data, areas: undefined } : null)[0],
  ).toMatchObject({ status: "STARTED", records: 1 })
  expect(setupAreas(null).every((area) => area.status === "OPEN")).toBe(true)
})

test("cash and bank receipts open only the actual saved Finance account", () => {
  const money = {
    ...entity,
    kind: "MONEY_ACCOUNT",
    committedRecordId: "account/123",
  }
  expect(setupRecordRoute(money)).toBeNull()
  expect(setupRecordRoute({ ...money, state: "COMMITTED" })).toBe(
    "/finance-account/account%2F123",
  )
  expect(
    setupRecordRoute({ ...money, state: "COMMITTED", committedRecordId: null }),
  ).toBeNull()
})
test("offline setup cache refuses another scope, stale snapshots and malformed data", () => {
  const data = {
    enabled: true,
    conversation: null,
    currencyCode: "NGN",
    messages: [],
    draft: null,
  }
  const cache = JSON.stringify({ scope: "owner/store", savedAt: 100, data })
  expect(readSetupCache(cache, "owner/store", 101)?.data).toEqual(data)
  expect(readSetupCache(cache, "other/store", 101)).toBeNull()
  expect(readSetupCache(cache, "owner/store", 86400101)).toBeNull()
  expect(readSetupCache("bad", "owner/store")).toBeNull()
})
test("rendering keeps model and attachment instructions as text and routes only real receipts", () => {
  expect(
    setupPlainText([
      { type: "text", text: "<script>bad</script>" },
      { type: "tool-write", payload: "never execute" },
    ]),
  ).toBe("<script>bad</script>")
  expect(setupRecordRoute(entity)).toBeNull()
  expect(
    setupRecordRoute({
      ...entity,
      state: "COMMITTED",
      committedRecordId: "a/b",
    }),
  ).toBe("/catalog-item/a%2Fb")
})

test("malformed or foreign run replies cannot unlock sending", () => {
  expect(
    readSetupRun({ conversationId: "other", status: "COMPLETED" }, "current"),
  ).toBeNull()
  expect(
    readSetupRun({ conversationId: "current", status: "UNKNOWN" }, "current"),
  ).toBeNull()
  expect(
    readSetupRun({ conversationId: "current", status: "RUNNING" }, "current")
      ?.status,
  ).toBe("RUNNING")
})
