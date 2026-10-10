import { expect, test } from "bun:test"
import { countCommercialOrderCustomers } from "@ewatrade/db/queries"

test("order contact count preserves exact integers and rejects lossy conversion", async () => {
  const count = (value: bigint) =>
    countCommercialOrderCustomers(
      {
        $queryRaw: async () => [{ count: value }],
      } as unknown as Parameters<typeof countCommercialOrderCustomers>[0],
      { tenantId: "qa" },
    )
  expect(await count(0n)).toBe(0)
  expect(await count(BigInt(Number.MAX_SAFE_INTEGER))).toBe(
    Number.MAX_SAFE_INTEGER,
  )
  await expect(count(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).rejects.toThrow(
    "Exact order contact count unavailable",
  )
  await expect(count(-1n)).rejects.toThrow(
    "Exact order contact count unavailable",
  )
})

import { generalAnswerSchema } from "@ewatrade/assistant/general/contracts"
import { respondGeneralRehearsal } from "@ewatrade/assistant/general/rehearsal"
import { generalOrderContactCountAnswer } from "./general-order-contact-count-answer"

test("order contact cards disclose scope and identity semantics", () => {
  const answer = generalOrderContactCountAnswer({ count: 6, ownSales: false })
  expect(generalAnswerSchema.safeParse(answer).success).toBe(true)
  expect(answer.scope).toBe(
    "Current business · all Stores · all visible orders",
  )
  expect(answer.detail).toContain("including cancelled/refunded")
  expect(answer.detail).toContain("does not count unique people")
  expect(
    generalOrderContactCountAnswer({
      count: 0,
      ownSales: true,
      storeName: "Shop",
    }).scope,
  ).toBe("Shop · your own sales")
  expect(
    respondGeneralRehearsal([
      { role: "user", content: "count order contacts" },
    ]),
  ).toMatchObject({ toolName: "readOrderContactCount", input: {} })
})
