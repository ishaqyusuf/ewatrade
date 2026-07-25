import { describe, expect, test } from "bun:test"
import { getListCreateFabBottom } from "./list-create-fab-model"

describe("list create FAB position", () => {
  test("sits above the visible dock and returns to the normal safe-area position when hidden", () => {
    expect(
      getListCreateFabBottom({
        bottomInset: 24,
        dockHidden: false,
        sitsAboveDock: true,
      }),
    ).toBe(124)
    expect(
      getListCreateFabBottom({
        bottomInset: 24,
        dockHidden: true,
        sitsAboveDock: true,
      }),
    ).toBe(40)
  })

  test("adds room for a bottom search footer on secondary screens", () => {
    expect(
      getListCreateFabBottom({
        bottomInset: 24,
        bottomOffset: 88,
      }),
    ).toBe(128)
  })
})
