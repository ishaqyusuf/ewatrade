import { expect, test } from "bun:test"
import { catalogChoiceDraftIdentity } from "./catalog-choice-drafts"

test("moving values preserves their draft identity without handing prices to another choice", () => {
  const values = [
    { key: "value-1", label: "Small" },
    { key: "value-2", label: "Large" },
  ]
  const before = [{ id: "size", key: "group-1", values }]
  const small = catalogChoiceDraftIdentity(
    [{ groupKey: "group-1", valueKey: "value-1" }],
    before,
  )
  const after = [
    {
      id: "size",
      key: "group-1",
      values: [
        { key: "value-1", label: "Large" },
        { key: "value-2", label: "Small" },
      ],
    },
  ]
  expect(
    catalogChoiceDraftIdentity(
      [{ groupKey: "group-1", valueKey: "value-2" }],
      after,
    ),
  ).toBe(small)
  expect(
    catalogChoiceDraftIdentity(
      [{ groupKey: "group-1", valueKey: "value-1" }],
      after,
    ),
  ).not.toBe(small)
  expect(
    catalogChoiceDraftIdentity(
      [{ groupKey: "group-1", valueKey: "value-1" }],
      [{ id: "grade", key: "group-1", values }],
    ),
  ).not.toBe(small)
})
