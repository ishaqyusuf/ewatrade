import { expect, test } from "bun:test"
import {
  isSimpleTransferIntent,
  simpleTransferAction,
  simpleTransferStep,
  transferFactsFromText,
} from "./simple-transfer"
test("exact short transfer captions and minor units", () => {
  for (const [caption, amount, from, to] of [
    [
      "move 5k from Shop cash to Ishaq PalmPay",
      500000,
      "Shop cash",
      "Ishaq PalmPay",
    ],
    [
      "transferred ₦1,250.50 from cash to palmpay 02 account",
      125050,
      "cash",
      "palmpay 02",
    ],
    [
      "transfer 20 thousand from Bank to Shop cash",
      2000000,
      "Bank",
      "Shop cash",
    ],
  ] as const) {
    expect(isSimpleTransferIntent(caption)).toBe(true)
    expect(transferFactsFromText(caption)).toMatchObject({
      amountMinor: amount,
      fromAccountName: from,
      toAccountName: to,
    })
  }
})
test("collect missing facts without fake account or note", () => {
  const draft = simpleTransferAction.parse({ action: "money_transfer_simple" })
  expect(simpleTransferStep(draft)).toBe("amount")
  expect(draft.attachmentIds).toEqual([])
  expect(draft.note).toBe("")
  expect(simpleTransferStep({ ...draft, amountMinor: 500000 })).toBe("from")
  expect(
    simpleTransferStep({
      ...draft,
      amountMinor: 500000,
      fromMoneyAccountId: "cash",
    }),
  ).toBe("to")
  expect(
    simpleTransferStep({
      ...draft,
      amountMinor: 500000,
      fromMoneyAccountId: "cash",
      newToAccount: { name: "New bank", kind: "BANK" },
    }),
  ).toBe("review")
  for (const amountMinor of [0, -1, 0.1, 100_000_000_000_001])
    expect(
      simpleTransferAction.safeParse({ ...draft, amountMinor }).success,
    ).toBe(false)
  expect(
    simpleTransferAction.safeParse({ ...draft, extractedImageAmount: 500000 })
      .success,
  ).toBe(false)
})
test("other financial and future transfers keep their own workflow", () => {
  for (const s of [
    "move stock from Shop to farm",
    "transfer loan payment",
    "move 5k tomorrow",
    "order 5k paid to bank",
    "spent 5k on feed",
    "move 5k from cash to bank with 200 fees",
    "transfer 20k with currency conversion",
  ])
    expect(isSimpleTransferIntent(s)).toBe(false)
  expect(
    transferFactsFromText("amount 2k note: transport savings"),
  ).toMatchObject({ amountMinor: 200000, note: "transport savings" })
})
