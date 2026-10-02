import { expect, test } from "bun:test"
import {
  type InventoryCloseoutSourceGraph,
  resolveLoadedInventoryCloseoutSource,
} from "./inventory-closeout-source"
import {
  closeoutInput,
  closeoutValuationFixture,
} from "./inventory-closeout-test-fixture"
import {
  assertSavedInventoryCloseoutSource,
  recordInventoryCloseoutValuationInTransaction,
} from "./valuation-closeouts"

test("loaded original Closeout replay binds its held Book scope without repository reads or writes", async () => {
  const f = closeoutValuationFixture()
  const events = await recordInventoryCloseoutValuationInTransaction(
    f.tx,
    closeoutInput,
  )
  const source = {
    ...resolveLoadedInventoryCloseoutSource(
      f.closeout as unknown as InventoryCloseoutSourceGraph,
      "tenant",
    ),
    book: f.book,
  }
  const reads = f.reads()
  const writes = f.writes()
  const bookReads = f.bookReads()
  expect(
    assertSavedInventoryCloseoutSource(source).map((event) => event.id),
  ).toEqual((events ?? []).map((event) => event.id))
  for (const book of [
    { ...f.book, tenantId: "foreign" },
    { ...f.book, currencyCode: "USD" },
  ])
    expect(() =>
      assertSavedInventoryCloseoutSource({ ...source, book }),
    ).toThrow("Book differs from its held context")
  expect(f.reads()).toBe(reads)
  expect(f.writes()).toBe(writes)
  expect(f.bookReads()).toBe(bookReads)
})
