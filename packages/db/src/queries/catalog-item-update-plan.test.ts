import { describe, expect, test } from "bun:test"
import {
  type ExistingUnit,
  matchOfferings,
  matchVariants,
  planOptionGroups,
  planUnits,
} from "./catalog-item-update-plan"

const size = {
  id: "g1",
  key: "option-1",
  name: "Size",
  values: [
    { id: "v1", key: "value-1", label: "Medium" },
    { id: "v2", key: "value-2", label: "Large" },
  ],
}

describe("planOptionGroups", () => {
  test("keeps saved groups and values by id and label, adds new ones with free keys", () => {
    const plan = planOptionGroups(
      [size],
      [{ id: "g1", name: "Egg size", values: ["large", "Jumbo"] }],
    )
    expect(plan.groups).toEqual([
      {
        id: "g1",
        key: "option-1",
        name: "Egg size",
        values: [
          { id: "v2", key: "value-2", label: "large" },
          { key: "value-3", label: "Jumbo" },
        ],
      },
    ])
    expect(plan.deleteValueIds).toEqual(["v1"])
    expect(plan.deleteGroupIds).toEqual([])
  })

  test("drops removed groups and gives new groups unused keys", () => {
    const plan = planOptionGroups(
      [size],
      [{ name: "Colour", values: ["White"] }],
    )
    expect(plan.groups[0]).toEqual({
      key: "option-2",
      name: "Colour",
      values: [{ key: "value-1", label: "White" }],
    })
    expect(plan.deleteGroupIds).toEqual(["g1"])
    expect(plan.deleteValueIds).toEqual([])
  })

  test("rejects empty groups, repeated values and unknown saved ids", () => {
    expect(() =>
      planOptionGroups([], [{ name: "Size", values: [" "] }]),
    ).toThrow("requires a name and at least one value")
    expect(() =>
      planOptionGroups([], [{ name: "Size", values: ["Large", "large"] }]),
    ).toThrow("repeats an option value")
    expect(() =>
      planOptionGroups(
        [size],
        [{ id: "gone", name: "Size", values: ["Large"] }],
      ),
    ).toThrow("Reopen it")
  })
})

describe("matchVariants", () => {
  test("matches by value set regardless of order and archives the rest", () => {
    const result = matchVariants(
      [
        { id: "a", key: "variant-1", valueIds: ["v1", "c1"] },
        { id: "b", key: "variant-2", valueIds: ["v2", "c1"] },
      ],
      [
        ["c1", "v1"],
        ["v3", "c1"],
      ],
    )
    expect(result).toEqual({ matches: ["a", null], archiveIds: ["b"] })
  })

  test("the no-option variant matches the empty selection", () => {
    expect(
      matchVariants([{ id: "d", key: "default", valueIds: [] }], [[]]),
    ).toEqual({
      matches: ["d"],
      archiveIds: [],
    })
  })

  test("rejects a repeated combination", () => {
    expect(() => matchVariants([], [["v1"], ["v1"]])).toThrow(
      "different combination",
    )
  })
})

const egg: ExistingUnit = {
  id: "u1",
  key: "canonical",
  name: "Egg",
  factor: "1.000000000000",
  stockBehavior: "canonical_shared",
  transactionScale: 0,
  symbol: null,
}
const tray: ExistingUnit = {
  id: "u2",
  key: "unit-2",
  name: "Tray",
  factor: "30.000000000000",
  stockBehavior: "alternate_transaction",
  transactionScale: 0,
  symbol: null,
}
const requestedEgg = {
  id: "u1",
  name: "Egg",
  factor: "1",
  stockBehavior: "canonical_shared" as const,
  transactionScale: 0,
}
const requestedTray = {
  id: "u2",
  name: "Tray",
  factor: "30",
  stockBehavior: "alternate_transaction" as const,
  transactionScale: 0,
}

describe("planUnits", () => {
  test("equal units with exact-decimal factors are unchanged", () => {
    expect(planUnits([egg, tray], [requestedEgg, requestedTray])).toEqual({
      mode: "unchanged",
      keys: ["canonical", "unit-2"],
    })
  })

  test("name-only edits rename in place", () => {
    expect(
      planUnits(
        [egg, tray],
        [{ ...requestedEgg, name: "Eggs" }, requestedTray],
      ),
    ).toEqual({
      mode: "rename",
      keys: ["canonical", "unit-2"],
      renames: [{ id: "u1", name: "Eggs" }],
    })
  })

  test("adding, removing or re-factoring republishes with stable keys", () => {
    const added = planUnits(
      [egg, tray],
      [
        requestedEgg,
        requestedTray,
        {
          name: "Carton",
          factor: "180",
          stockBehavior: "packaged_stock",
          transactionScale: 0,
        },
      ],
    )
    expect(added.mode).toBe("republish")
    expect(added.keys).toEqual(["canonical", "unit-2", "unit-1"])
    expect(planUnits([egg, tray], [requestedEgg]).mode).toBe("republish")
    expect(
      planUnits([egg, tray], [requestedEgg, { ...requestedTray, factor: "24" }])
        .mode,
    ).toBe("republish")
  })

  test("the main unit must stay first and cannot be swapped", () => {
    expect(() => planUnits([egg, tray], [requestedTray])).toThrow("main unit")
    expect(() =>
      planUnits([egg, tray], [{ ...requestedEgg, id: "u2" }, requestedTray]),
    ).toThrow("cannot be swapped")
  })
})

describe("matchOfferings", () => {
  test("matches by unit key, creates new units and archives dropped ones", () => {
    const result = matchOfferings(
      [
        { id: "o1", unitKey: "canonical" },
        { id: "o2", unitKey: "unit-2" },
      ],
      [{ unitKey: "canonical" }, { unitKey: "unit-3" }],
    )
    expect(result.update).toEqual([
      { id: "o1", requested: { unitKey: "canonical" } },
    ])
    expect(result.create).toEqual([{ requested: { unitKey: "unit-3" } }])
    expect(result.archiveIds).toEqual(["o2"])
  })

  test("a Service variant keeps its single offering", () => {
    expect(
      matchOfferings([{ id: "s1", unitKey: null }], [{ unitKey: null }]).update,
    ).toEqual([{ id: "s1", requested: { unitKey: null } }])
  })
})
