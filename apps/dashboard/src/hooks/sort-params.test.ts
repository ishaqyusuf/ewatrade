import { expect, test } from "bun:test"
import { expenseSortFields, getTableSort, loadSortParams } from "./sort-params"

test("server sort loader and client validation agree on supported field and direction", async () => {
  const params = await loadSortParams({ sort: "totalMinor,desc" })
  expect(getTableSort(params.sort, expenseSortFields)).toEqual({
    field: "totalMinor",
    direction: "desc",
  })
  expect(getTableSort(["tenantId", "desc"], expenseSortFields)).toBeUndefined()
  expect(
    getTableSort(["paidMinor", "descending"], expenseSortFields),
  ).toBeUndefined()
  expect(
    getTableSort(["paidMinor", "asc", "extra"], expenseSortFields),
  ).toBeUndefined()
  expect(getTableSort(null, expenseSortFields)).toBeUndefined()
})
