import { expect, test } from "bun:test"
import {
  answerConversation,
  confirmConversation,
  conversationIds,
  startConversation,
} from "./marketing-conversations"
import { MARKETING_OFFERS, getMarketingPlanCta } from "./marketing-offers"

test("business setup leads, asks missing stock and stays a draft until explicit confirmation", () => {
  expect(conversationIds[0]).toBe("setup")
  const initial = startConversation("setup")
  expect(initial.messages[0]?.text).toContain(
    "Al-Jawdah Agro-Biz, poultry in Ilorin",
  )
  expect(initial.stage).toBe("question")
  const draft = answerConversation("setup", initial, "120 crates, 40 birds")
  expect(draft.stage).toBe("draft")
  expect(draft.draft?.rows).toContainEqual(["City", "Ilorin"])
  expect(draft.draft?.rows).toContainEqual(["Catalog", "2 items"])
  const saved = confirmConversation(draft)
  expect(saved.stage).toBe("saved")
  expect(confirmConversation(saved)).toBe(saved)
  expect(initial.stage).toBe("question")
  expect(startConversation("product").draft).toBeUndefined()
})
test("count-later preserves unknown stock and product pack quantity never becomes the price", () => {
  const skipped = answerConversation(
    "setup",
    startConversation("setup"),
    "I’ll count later",
  )
  expect(
    skipped.draft?.rows.find(([label]) => label === "Crate of eggs")?.[1],
  ).toContain("Not counted yet")
  expect(
    answerConversation(
      "setup",
      startConversation("setup"),
      "-5 crates, 40 birds",
    ).stage,
  ).toBe("question")
  const pack = answerConversation(
    "product",
    startConversation("product"),
    "₦12,000 per pack of 3",
  )
  expect(pack.draft?.rows).toContainEqual(["Price", "₦12,000"])
  expect(pack.draft?.rows).toContainEqual(["Unit", "pack of 3"])
  expect(
    answerConversation(
      "product",
      startConversation("product"),
      "₦4,500 per piece",
    ).draft?.rows,
  ).toContainEqual(["Price", "₦4,500"])
})
test("simple-sale sample preserves stock semantics; marketing prices do not activate billing", () => {
  const money = startConversation("money")
  expect(money.draft?.rows).toContainEqual(["Stock", "No change"])
  expect(confirmConversation(money).messages.at(-1)?.text).toContain("₦192,000")
  expect(MARKETING_OFFERS.map((p) => p.price)).toEqual([0, 5000, 15000, 30000])
  expect(MARKETING_OFFERS[0].items).toBe(10)
  expect(MARKETING_OFFERS[0].orders).toBe(50)
  for (const id of ["starter", "growth", "pro"] as const)
    expect(getMarketingPlanCta(id, true).href).toBe("/contact")
  expect(getMarketingPlanCta("free", false).href).toBe("/contact")
})

test("confirmed sample money changes later sales answers without moving stock", () => {
  const saved = confirmConversation(startConversation("money"))
  expect(
    answerConversation("money", saved, "How are sales today?").messages.at(-1)
      ?.text,
  ).toContain("₦192,000")
  expect(
    answerConversation(
      "product",
      startConversation("product"),
      "-4500 per piece",
    ).stage,
  ).toBe("question")
})
