import { expect, test } from "bun:test"
import {
  parseSetupRehearsalLines,
  respondSetupRehearsal,
  singularUnitName,
} from "./rehearsal"

test("exact saved workflow review/list requests cannot become CSV drafts in local rehearsal", () => {
  for (const text of [
    "Review draft product:eggs",
    "Review drafts product:eggs, service:haircut",
    "Draft list",
    "Draft list page 2",
  ]) {
    expect(respondSetupRehearsal([{ role: "user", content: text }]).kind).toBe(
      "text",
    )
  }
  expect(
    respondSetupRehearsal([{ role: "user", content: "Eggs, 150, 3 pieces" }]),
  ).toMatchObject({ kind: "tool", toolName: "setup_draft_upsert_items" })
})

test("stock units are named in the singular, including -es, -ies and -ves plurals", () => {
  const units = parseSetupRehearsalLines(
    "Family bread, 1800, 30 loaves\nCupcake box, 3600, 12 boxes\nEggs, 150, 3 pieces",
  ).items.map((item) => item.unitName)
  expect(units).toEqual(["Loaf", "Box", "Piece"])
  expect(
    [
      "bags",
      "crates",
      "glasses",
      "inches",
      "batteries",
      "kg",
      "Pcs",
      "dish",
    ].map(singularUnitName),
  ).toEqual(["bag", "crate", "glass", "inch", "battery", "kg", "Pc", "dish"])
})
