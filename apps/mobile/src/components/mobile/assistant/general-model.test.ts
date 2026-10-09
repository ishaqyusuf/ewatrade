import { expect, test } from "bun:test"
import {
  generalAnswers,
  generalReceiptRoute,
  generalSavedSnapshot,
  readGeneralCache,
  readGeneralSnapshot,
} from "./general-model"
const data = readGeneralSnapshot({
  conversation: { id: "conversation", title: "Saved chat" },
  messages: [
    {
      id: "message",
      role: "assistant",
      parts: [{ type: "text", text: "Saved answer" }],
    },
  ],
  proposals: [
    {
      id: "proposal",
      revision: 1,
      payload: { action: "customer_create", name: "Amina" },
      status: "PENDING",
      expiresAt: "2030-01-01T00:00:00.000Z",
      receipt: null,
      approvalToken: "secret",
    },
  ],
  activeRunId: "run",
  allowance: {
    remainingRequests: 2,
    remainingTokens: 100,
    resetsAt: "2030-01-01",
  },
  businessName: "Shop",
  storeName: "Store",
  currencyCode: "NGN",
})
if (!data) throw new Error("Invalid General snapshot fixture")
test("offline snapshot never persists approval tokens or active execution state", () => {
  const saved = generalSavedSnapshot(data)
  expect(JSON.stringify(saved)).not.toContain("secret")
  expect(saved.activeRunId).toBe(null)
  expect(data.proposals[0]?.approvalToken).toBe("secret")
  const raw = JSON.stringify({ scope: "scope", savedAt: 1000, data })
  expect(
    readGeneralCache(raw, "scope", 1001)?.data.proposals[0]?.approvalToken,
  ).toBeUndefined()
  expect(readGeneralCache(raw, "other", 1001)).toBe(null)
  expect(readGeneralCache(raw, "scope", 1000 + 24 * 60 * 60 * 1000 + 1)).toBe(
    null,
  )
  expect(readGeneralCache(raw, "scope", -100000)).toBe(null)
  expect(readGeneralCache("broken", "scope")).toBe(null)
})
test("receipt navigation uses actual command IDs and the existing native route parameters", () => {
  expect(
    generalReceiptRoute({
      kind: "payment",
      recordId: "payment-real",
      orderId: "order-real",
      title: "Paid",
      detail: "Saved",
    }),
  ).toEqual({ pathname: "/order/[orderId]", params: { orderId: "order-real" } })
  expect(
    generalReceiptRoute({
      kind: "product",
      recordId: "product-real",
      title: "Added",
      detail: "Saved",
    }),
  ).toEqual({
    pathname: "/catalog-item/[catalogItemId]",
    params: { catalogItemId: "product-real" },
  })
})

test("only validated server answer cards survive saved history", () => {
  const answer = {
    id: "summary",
    title: "Sales",
    value: "NGN 20.00",
    scope: "QA Store · Your orders",
    asOf: "2030-01-01T00:00:00.000Z",
    detail: "2 orders · order value, not cash collected.",
  }
  const parts = [{ type: "data-general-answer", data: answer }]
  expect(generalAnswers(parts)).toEqual([answer])
  expect(
    generalAnswers([
      { type: "data-general-answer", data: { ...answer, asOf: "invalid" } },
    ]),
  ).toEqual([])
  expect(
    generalAnswers([{ type: "data-general-proposal", data: answer }]),
  ).toEqual([])
  const snapshot = readGeneralSnapshot({
    ...data,
    messages: [{ id: "answer", role: "assistant", parts }],
  })
  expect(snapshot).not.toBeNull()
  if (!snapshot) throw Error("Expected saved answer")
  expect(
    generalAnswers(generalSavedSnapshot(snapshot).messages[0]?.parts),
  ).toEqual([answer])
  expect(
    readGeneralSnapshot({
      ...data,
      messages: [
        {
          id: "bad",
          role: "assistant",
          parts: [
            {
              type: "data-general-answer",
              data: { ...answer, approvalToken: "secret" },
            },
          ],
        },
      ],
    }),
  ).toBeNull()
})
