import { expect, test } from "bun:test"
import {
  isAllSelected,
  pruneSelection,
  selectAllIds,
  toggleSelectionId,
} from "./list-selection-model"

test("toggling stops at the cap but always allows deselecting", () => {
  expect(toggleSelectionId(["a"], "b", 2)).toEqual({
    capped: false,
    ids: ["a", "b"],
  })
  expect(toggleSelectionId(["a", "b"], "c", 2)).toEqual({
    capped: true,
    ids: ["a", "b"],
  })
  expect(toggleSelectionId(["a", "b"], "a", 2)).toEqual({
    capped: false,
    ids: ["b"],
  })
})

test("select all picks loaded rows up to the cap, then clears", () => {
  const rows = ["a", "b", "c"]
  expect(selectAllIds([], rows, 5)).toEqual({ capped: false, ids: rows })
  expect(selectAllIds(["b"], rows, 2)).toEqual({
    capped: true,
    ids: ["a", "b"],
  })
  expect(isAllSelected(["a", "b"], rows, 2)).toBe(true)
  expect(selectAllIds(["a", "b"], rows, 2)).toEqual({ capped: false, ids: [] })
  expect(selectAllIds([], [], 2)).toEqual({ capped: false, ids: [] })
})

test("pruning keeps the same array when nothing left", () => {
  const ids = ["a", "b"]
  expect(pruneSelection(ids, new Set(["a", "b", "c"]))).toBe(ids)
  expect(pruneSelection(ids, new Set(["b"]))).toEqual(["b"])
})
