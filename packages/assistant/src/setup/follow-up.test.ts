import { describe, expect, test } from "bun:test"
import { deriveSetupEntityState } from "./contracts"
import { type SetupFollowUpEntity, summarizeSetupFollowUp } from "./follow-up"
import { setupCommitSummaryMessage, setupResumeMessage } from "./messages"

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
  })

  test("resuming lists what is still open", () => {
    expect(
      text(setupResumeMessage(summarizeSetupFollowUp([product("Turkey", {})]))),
    ).toBe(
      "Welcome back. Let's finish your setup list.\n\nWhat is your selling price for one piece of Turkey?",
    )
    expect(text(setupResumeMessage())).toContain("Your setup list is saved.")
  })
})
