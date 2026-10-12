import { describe, expect, test } from "bun:test"
import {
  getListCreateFabBottom,
  getListCreateFabFooterOffset,
} from "./list-create-fab-model"

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

  test("sits 14 points above a floating search footer", () => {
    const footerHeight = 52 + 24 + 10
    const offset = getListCreateFabFooterOffset({
      bottomInset: 24,
      footerHeight,
    })
    expect(
      getListCreateFabBottom({ bottomInset: 24, bottomOffset: offset }),
    ).toBe(footerHeight + 14)
    expect(
      getListCreateFabFooterOffset({ bottomInset: 48, footerHeight: 0 }),
    ).toBe(0)
  })
})
