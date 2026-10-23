import { expect, test } from "bun:test"
import {
  catalogCreateHandoffSchema,
  catalogCreateScopeMatches,
  missingCatalogItemAnswer,
} from "./catalog-create-handoff"
import { generalAnswerSchema } from "./contracts"

const origin = { tenantId: "freshcare", storeId: "main" }
const input = { query: "Kaftan", kind: "service" as const }

test("an exhaustive empty named search produces a persisted form-only card without invented facts", () => {
  const answer = missingCatalogItemAnswer(
    input,
    { items: [] },
    origin,
    "FreshCare",
  )
  expect(answer).not.toBeNull()
  expect(generalAnswerSchema.parse(answer).catalogCreate).toEqual({
    name: "Kaftan",
    kind: "service",
    origin,
  })
  expect(answer?.title).toBe("Service not listed")
  expect(JSON.stringify(answer)).not.toContain("price")
  expect(JSON.stringify(answer)).not.toContain("proposalId")
})

test("saved variant matches, filtered pages and continuation ends never establish absence", () => {
  expect(
    missingCatalogItemAnswer(
      input,
      { items: [{ name: "Laundry" }] },
      origin,
      "FreshCare",
    ),
  ).toBeNull()
  expect(
    missingCatalogItemAnswer(
      input,
      { items: [], nextCursor: "more" },
      origin,
      "FreshCare",
    ),
  ).toBeNull()
  for (const status of ["active", "archived", "draft"])
    expect(
      missingCatalogItemAnswer(
        { ...input, status },
        { items: [] },
        origin,
        "FreshCare",
      ),
    ).toBeNull()
  expect(
    missingCatalogItemAnswer(
      { ...input, cursor: "last-page" },
      { items: [] },
      origin,
      "FreshCare",
    ),
  ).toBeNull()
  expect(
    missingCatalogItemAnswer(
      { kind: "service" },
      { items: [] },
      origin,
      "FreshCare",
    ),
  ).toBeNull()
  expect(
    missingCatalogItemAnswer(
      { query: "Kaftan" },
      { items: [] },
      origin,
      "FreshCare",
    ),
  ).toBeNull()
})

test("a form handoff cannot carry a price, command or permission and is bound to its original scope", () => {
  const handoff = catalogCreateHandoffSchema.parse({
    kind: input.kind,
    name: input.query,
    origin,
  })
  expect(catalogCreateScopeMatches(handoff, origin)).toBe(true)
  expect(
    catalogCreateScopeMatches(handoff, { ...origin, tenantId: "other" }),
  ).toBe(false)
  expect(
    catalogCreateScopeMatches(handoff, { ...origin, storeId: "other" }),
  ).toBe(false)
  for (const extra of [
    { priceMinor: 0 },
    { approvalToken: "x" },
    { canCreate: true },
  ])
    expect(
      catalogCreateHandoffSchema.safeParse({ ...handoff, ...extra }).success,
    ).toBe(false)
})

test("malformed saved prefill is discarded without losing the answer", () => {
  const answer = missingCatalogItemAnswer(
    input,
    { items: [] },
    origin,
    "FreshCare",
  )
  expect(
    generalAnswerSchema.parse({ ...answer, catalogCreate: { name: "Kaftan" } })
      .catalogCreate,
  ).toBeUndefined()
})
