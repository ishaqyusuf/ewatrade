import { expect, test } from "bun:test"
import {
  selectedServiceIntakeOfferings,
  serviceIntakeEditorReadState,
  serviceIntakeOfferingChoices,
} from "./service-intake-editor-options"

const ready = {
  isPending: false,
  isFetching: false,
  isPaused: false,
  isError: false,
  isSuccess: true,
}

test("cached success never permits disclosure during an authorization refresh or pause", () => {
  expect(serviceIntakeEditorReadState([ready])).toBe("ready")
  expect(
    serviceIntakeEditorReadState([ready, { ...ready, isFetching: true }]),
  ).toBe("loading")
  expect(serviceIntakeEditorReadState([{ ...ready, isPaused: true }])).toBe(
    "paused",
  )
  expect(serviceIntakeEditorReadState([{ ...ready, isError: true }])).toBe(
    "unavailable",
  )
  expect(serviceIntakeEditorReadState([{ ...ready, isPending: true }])).toBe(
    "loading",
  )
  expect(serviceIntakeEditorReadState([{ ...ready, isSuccess: false }])).toBe(
    "loading",
  )
})

const offering = (id: string, name = id) => ({
  id,
  name,
  priceMinor: 1000,
  workPolicy: "TRACKED",
})

test("paging retains only selected identities and replaces their labels with the latest read", () => {
  const choices = [
    offering("a", "Old"),
    offering("b"),
    offering("a", "Current"),
  ]
  expect(
    selectedServiceIntakeOfferings(choices, ["a", "missing", "a"]),
  ).toEqual([offering("a", "Current")])
  expect(selectedServiceIntakeOfferings(choices, [])).toEqual([])
  const page = Array.from({ length: 100 }, (_, i) => offering(`page-${i}`))
  expect(
    selectedServiceIntakeOfferings([...choices, ...page], ["a", "page-99"]).map(
      (row) => row.id,
    ),
  ).toEqual(["a", "page-99"])
})

test("an off-page selection remains explicit without inventing availability or a replacement", () => {
  const choices = serviceIntakeOfferingChoices(
    [offering("current")],
    "original",
  )
  expect(choices[0]).toEqual({
    value: "original",
    label: "Selected service is outside this page or unavailable",
  })
  expect(choices[1]?.value).toBe("current")
  expect(
    serviceIntakeOfferingChoices([offering("original")], "original"),
  ).toEqual([{ value: "original", label: "original · tracked" }])
})
