import { describe, expect, test } from "bun:test"
import { deriveSetupEntityState } from "./contracts"
import { type SetupFollowUpEntity, summarizeSetupFollowUp } from "./follow-up"
import { setupCommitSummaryMessage, setupMoreProductsInvite } from "./messages"

function product(
  name: string,
  facts: { priceMinor?: number; openingStock?: string; unitName?: string },
  state?: string,
): SetupFollowUpEntity {
  const payload = {
    kind: "product" as const,
    name,
    unitName: facts.unitName ?? "Piece",
    ...(facts.priceMinor === undefined ? {} : { priceMinor: facts.priceMinor }),
    ...(facts.openingStock === undefined
      ? {}
      : { openingStock: facts.openingStock }),
  }
  const derived = deriveSetupEntityState(payload, [])
  return {
    kind: "PRODUCT",
    state: state ?? derived.state,
    payload,
    openQuestions: derived.questions,
  }
}

const text = (message: { parts: Array<{ type: string; text?: string }> }) =>
  message.parts.map((part) => part.text ?? "").join("")

describe("setup follow-up", () => {
  test("groups missing prices into one question, then asks about stock", () => {
    const followUp = summarizeSetupFollowUp([
      product("Turkey", {}),
      product("Goat meat", { unitName: "Kg" }),
      product("Crate of eggs", { priceMinor: 450_000 }),
      product(
        "Broiler",
        { priceMinor: 900_000, openingStock: "50" },
        "COMMITTED",
      ),
    ])
    expect(followUp).toMatchObject({
      open: 3,
      needsDetails: 2,
      readyToConfirm: 1,
      waitingToAdd: 0,
      failed: 0,
    })
    expect(followUp.questions).toEqual([
      "What is your selling price for Turkey (per piece) and Goat meat (per kg)?",
      "How many Crate of eggs do you have right now?",
    ])
  })

  test("a single record keeps its own question and long lists are shortened", () => {
    expect(summarizeSetupFollowUp([product("Turkey", {})]).questions).toEqual([
      "What is your selling price for one piece of Turkey?",
    ])
    const many = ["A", "B", "C", "D", "E", "F"].map((name) => product(name, {}))
    expect(summarizeSetupFollowUp(many).questions[0]).toBe(
      "What is your selling price for A (per piece), B (per piece), C (per piece) and 3 more?",
    )
  })

  test("nothing open means no questions", () => {
    const followUp = summarizeSetupFollowUp([
      product("Broiler", { priceMinor: 900_000 }, "COMMITTED"),
      product("Old item", { priceMinor: 1 }, "SKIPPED"),
    ])
    expect(followUp).toMatchObject({ open: 0, questions: [] })
  })

  test("the add summary asks the next questions instead of closing", () => {
    const followUp = summarizeSetupFollowUp([
      product("Turkey", {}),
      product("Crate of eggs", { priceMinor: 450_000, openingStock: "20" }),
    ])
    const summary = text(
      setupCommitSummaryMessage({
        products: 2,
        services: 0,
        customers: 0,
        balancesPending: 0,
        failed: 0,
        followUp,
      }),
    )
    expect(summary).toContain("Let's finish the rest of your list.")
    expect(summary).toContain(
      "What is your selling price for one piece of Turkey?",
    )
    expect(summary).toContain("1 record is ready in your setup list.")
    expect(summary).not.toContain("anything else")

    const done = text(
      setupCommitSummaryMessage({
        products: 2,
        services: 0,
        customers: 0,
        balancesPending: 0,
        failed: 0,
        followUp: summarizeSetupFollowUp([]),
      }),
    )
    expect(done).toContain("anything else you'd like to add")
    const invited = text(
      setupCommitSummaryMessage({
        products: 1,
        services: 0,
        customers: 0,
        balancesPending: 0,
        failed: 0,
        followUp: summarizeSetupFollowUp([]),
        inviteMore: true,
      }),
    )
    expect(invited).toContain(setupMoreProductsInvite(false))
    expect(invited).not.toContain("anything else you'd like to add")
    // Photos, files and voice notes are off unless the server says so.
    expect(invited).not.toMatch(/photo|file|price list|voice/i)
    // A service has no stock: the invite asks for prices or per-job quotes.
    const summaryFor = (products: number, services: number) =>
      text(
        setupCommitSummaryMessage({
          products,
          services,
          customers: 0,
          balancesPending: 0,
          failed: 0,
          followUp: summarizeSetupFollowUp([]),
          inviteMore: true,
        }),
      )
    const serviceInvite = summaryFor(0, 1)
    expect(serviceInvite).toContain(setupMoreProductsInvite(false, "services"))
    expect(serviceInvite).not.toMatch(/how many|have now/i)
    expect(summaryFor(1, 1)).toContain(setupMoreProductsInvite(false, "both"))
    const withMedia = text(
      setupCommitSummaryMessage({
        products: 1,
        services: 0,
        customers: 0,
        balancesPending: 0,
        failed: 0,
        followUp: summarizeSetupFollowUp([]),
        inviteMore: true,
        mediaEnabled: true,
      }),
    )
    expect(withMedia).toContain(
      "You can also send a price list, a photo or a file.",
    )
  })
})

describe("add summary", () => {
  test("names items used and cash and bank accounts separately", () => {
    const summary = setupCommitSummaryMessage({
      products: 3,
      services: 0,
      internalUse: 1,
      customers: 1,
      moneyAccounts: 2,
      balancesPending: 0,
      failed: 0,
    })
    const text = summary.parts[0]?.type === "text" ? summary.parts[0].text : ""
    expect(text).toContain(
      "Done! Your business now has 3 products, 1 item you use, 1 customer and 2 cash and bank accounts from this setup.",
    )
    expect(text).toContain(
      "You can find them in Catalog, Customers and Finance, and stock is ready in Inventory.",
    )
  })

  test("accounts only point to Finance without a stock line", () => {
    const summary = setupCommitSummaryMessage({
      products: 0,
      services: 0,
      customers: 0,
      moneyAccounts: 1,
      balancesPending: 0,
      failed: 0,
    })
    const text = summary.parts[0]?.type === "text" ? summary.parts[0].text : ""
    expect(text).toContain(
      "Done! Your business now has 1 cash and bank account from this setup. You can find them in Finance.",
    )
  })
})
