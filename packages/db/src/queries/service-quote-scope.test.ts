import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { issueServiceQuote } from "./service-public"

test("agreed service scope is screened by canonical Quote release before persistence", async () => {
  let transactions = 0
  const db = {
    $transaction: () => {
      transactions++
      throw Error("Unsafe scope must never reach persistence")
    },
  } as unknown as PrismaClient
  await expect(
    issueServiceQuote(db, {
      actorUserId: "owner-1",
      clientQuoteId: "scope-quote-1",
      clientVersionId: "scope-version-1",
      customerNote: "[[qa-reject]]",
      lines: [
        {
          offeringId: "home-cleaning",
          quantity: "1",
          unitPriceMinor: 2_500_000,
        },
      ],
      requestId: "request-1",
      storeId: "store-1",
      tenantId: "tenant-1",
    }),
  ).rejects.toMatchObject({ code: "QUOTE_CONFLICT" })
  expect(transactions).toBe(0)
})
