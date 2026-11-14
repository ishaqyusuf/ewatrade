import { describe, expect, test } from "bun:test"
import type { ReturnableBalance } from "@ewatrade/db/queries"
import {
  filterReturnableBalances,
  orderReturnablesSection,
  returnableBalanceAnswers,
  returnableCount,
} from "./general-returnables"

const balance = (
  customerName: string,
  out: number,
  itemName = "Egg crate",
): ReturnableBalance => ({
  customerId: `cus_${customerName}`,
  customerName,
  catalogItemId: itemName === "Egg crate" ? "item_crate" : "item_cyl",
  itemName,
  out,
  oldestOutAt: "2026-10-20T09:00:00.000Z",
  orderCount: 2,
})
const rows = [
  balance("Chidi Eze", 96),
  balance("Ngozi Okeke", 20),
  balance("Musa Ibrahim", 12),
  balance("Musa Ibrahim", 3, "Gas cylinder"),
]

describe("returnable wording", () => {
  test("counts read naturally", () => {
    expect(returnableCount(58, "Egg crate")).toBe("58 Egg crates")
    expect(returnableCount(1, "Egg crate")).toBe("1 Egg crate")
    expect(returnableCount(4, "Glass bottles")).toBe("4 Glass bottles")
  })

  test("order card section shows each balance before → after", () => {
    expect(
      orderReturnablesSection(
        [{ name: "Egg crate", quantity: 58, heldBefore: 12 }],
        "Musa Ibrahim",
      ),
    ).toEqual({
      title: "To come back",
      rows: [{ label: "58 Egg crates", value: "Musa Ibrahim holds 12 → 70" }],
    })
    expect(orderReturnablesSection([], "Musa Ibrahim")).toBeNull()
  })
})

describe("readReturnableBalances", () => {
  test("filters by what the owner called the customer and the item", () => {
    expect(
      filterReturnableBalances(rows, { customerName: "chidi" }).map(
        (row) => row.customerName,
      ),
    ).toEqual(["Chidi Eze"])
    expect(
      filterReturnableBalances(rows, {
        customerName: "Musa",
        itemName: "cylinders",
      }),
    ).toEqual([balance("Musa Ibrahim", 3, "Gas cylinder")])
    expect(filterReturnableBalances(rows, { customerName: "Emeka" })).toEqual(
      [],
    )
  })

  test("answers lead with the total, then one card per holder", () => {
    const answers = returnableBalanceAnswers(rows.slice(0, 3), {}, [
      { name: "Egg crate" },
    ])
    expect(answers[0]).toMatchObject({
      title: "Returnables out",
      value: "128 out",
      summary: "With 3 customers",
    })
    expect(
      answers.slice(1).map((answer) => [answer.title, answer.value]),
    ).toEqual([
      ["Chidi Eze", "96 Egg crates"],
      ["Ngozi Okeke", "20 Egg crates"],
      ["Musa Ibrahim", "12 Egg crates"],
    ])
  })

  test("nothing out is a plain none, and no item set up says so", () => {
    expect(
      returnableBalanceAnswers([], { customerName: "Emeka" }, [
        { name: "Egg crate" },
      ])[0],
    ).toMatchObject({ value: "0 out", summary: "Nothing out" })
    expect(returnableBalanceAnswers([], {}, [])[0]).toMatchObject({
      value: "Not set up",
    })
  })
})
