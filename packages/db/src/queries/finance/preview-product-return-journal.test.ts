import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { previewProductReturnJournal } from "./preview-product-return-journal"
const input = { tenantId: "tenant", storeId: "store", orderId: "order", disposition: "restock", bookId: "book", sourceCostMinor: "40" }
const noReads = {} as Prisma.TransactionClient

test("no Book, non-restock and unknown cost explicitly avoid journal claims", async () => {
  expect(await previewProductReturnJournal(noReads, { ...input, bookId: null })).toEqual({ status: "NO_FINANCE_BOOK" })
  expect(await previewProductReturnJournal(noReads, { ...input, disposition: "damaged" })).toEqual({ status: "NO_RESTOCK_JOURNAL" })
  expect(await previewProductReturnJournal(noReads, { ...input, sourceCostMinor: null })).toEqual({ status: "UNKNOWN_ORIGINAL_COST" })
})

test("scoped order selection refuses missing records and waits for completion", async () => {
  const db = (status: string | null) => ({ commercialOrder: { findFirst: async (args: unknown) => {
    expect(args).toEqual({ where: { id: "order", tenantId: "tenant", storeId: "store" } })
    return status ? { status, completedAt: null } : null
  } } }) as unknown as Prisma.TransactionClient
  await expect(previewProductReturnJournal(db(null), input)).rejects.toMatchObject({ code: "NOT_FOUND" })
  expect(await previewProductReturnJournal(db("PARTIALLY_FULFILLED"), input)).toEqual({ status: "WAITING_FOR_ORDER_COMPLETION" })
})
