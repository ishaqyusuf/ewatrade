import { expect, test } from "bun:test"
import { buildMissingLegalAcceptanceFilter } from "./legal-acceptance-audit"

test("orphan audit scopes users to the effective UTC day and exact accepted snapshot", () => {
  expect(
    buildMissingLegalAcceptanceFilter({
      version: "2026-10-01",
      documentHash: "a".repeat(64),
      effectiveDate: "2026-10-01",
    }),
  ).toEqual({
    createdAt: { gte: new Date("2026-10-01T00:00:00.000Z") },
    legalAcceptances: {
      none: { version: "2026-10-01", documentHash: "a".repeat(64) },
    },
  })
})

test("orphan audit refuses invalid or missing publication identity", () => {
  expect(() =>
    buildMissingLegalAcceptanceFilter({
      version: "draft",
      documentHash: "",
      effectiveDate: "2026-10-01",
    }),
  ).toThrow("exact effective legal publication")
  expect(() =>
    buildMissingLegalAcceptanceFilter({
      version: "approved",
      documentHash: "a".repeat(64),
      effectiveDate: "2026-02-30",
    }),
  ).toThrow("exact effective legal publication")
})
