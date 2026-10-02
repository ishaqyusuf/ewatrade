import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  assertReviewedCostReturnFenceUnchanged,
  readReviewedCostReturnFence,
} from "./reviewed-cost-return-fence"

function fence(facts: string) {
  return [{ kind: "allocation", id: "allocation", facts }]
}
test("retains exact original database row bytes without mutation", () => {
  const original = fence('{"sourceCostMinor":null,"canonicalQuantity":0.5}')
  assertReviewedCostReturnFenceUnchanged(
    original,
    fence('{"sourceCostMinor":null,"canonicalQuantity":0.5}'),
  )
  expect(original[0]?.facts).toBe(
    '{"sourceCostMinor":null,"canonicalQuantity":0.5}',
  )
})
test("detects adjacent BIGINT changes that JavaScript JSON numbers cannot distinguish", () => {
  const before = '{"sourceCostMinor":9007199254740992}'
  const after = '{"sourceCostMinor":9007199254740993}'
  expect(JSON.parse(before)).toEqual(JSON.parse(after))
  expect(() =>
    assertReviewedCostReturnFenceUnchanged(fence(before), fence(after)),
  ).toThrow("facts changed")
})
test("detects canonical decimal drift below JavaScript floating precision", () => {
  const before = '{"canonicalQuantity":0.100000000000000001}'
  const after = '{"canonicalQuantity":0.100000000000000002}'
  expect(JSON.parse(before)).toEqual(JSON.parse(after))
  expect(() =>
    assertReviewedCostReturnFenceUnchanged(fence(before), fence(after)),
  ).toThrow("facts changed")
})
test("rejects unknown value changed to zero", () => {
  expect(() =>
    assertReviewedCostReturnFenceUnchanged(
      fence('{"sourceCostMinor":null}'),
      fence('{"sourceCostMinor":0}'),
    ),
  ).toThrow("facts changed")
})
test("retains nonphysical original returns and detects disposition/date drift", () => {
  const original = [
    {
      kind: "return",
      id: "return",
      facts:
        '{"stockOperationId":null,"disposition":"NO_RESTOCK","createdAt":"2026-02-01"}',
    },
  ]
  expect(() => assertReviewedCostReturnFenceUnchanged(original, [])).toThrow(
    "facts changed",
  )
  expect(() =>
    assertReviewedCostReturnFenceUnchanged(original, [
      {
        ...original[0],
        kind: "return",
        id: "return",
        facts:
          '{"stockOperationId":null,"disposition":"DAMAGED","createdAt":"2026-02-01"}',
      },
    ]),
  ).toThrow("facts changed")
})
test("rejects owning Order identity change before any new Order lock", () => {
  expect(() =>
    assertReviewedCostReturnFenceUnchanged(
      fence('{"orderId":"original"}'),
      fence('{"orderId":"other"}'),
    ),
  ).toThrow("facts changed")
})
test("rejects expanded source records", () => {
  expect(() =>
    assertReviewedCostReturnFenceUnchanged(fence("original"), [
      ...fence("original"),
      { kind: "header", id: "new", facts: "new" },
    ]),
  ).toThrow("facts changed")
})
test("empty scope performs no source query", async () => {
  expect(
    await readReviewedCostReturnFence({} as Prisma.TransactionClient, []),
  ).toEqual([])
})
test("duplicate and excessive root scope reject before any source query", async () => {
  await expect(
    readReviewedCostReturnFence({} as Prisma.TransactionClient, [
      "line",
      "line",
    ]),
  ).rejects.toThrow("unique Order Lines")
  await expect(
    readReviewedCostReturnFence(
      {} as Prisma.TransactionClient,
      Array.from({ length: 129 }, (_, n) => `line-${n}`),
    ),
  ).rejects.toThrow("unique Order Lines")
})
