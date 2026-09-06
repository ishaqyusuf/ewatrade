import { describe, expect, test } from "bun:test"

import { APP_LOCK_QUIET_SEAL_LAYOUT } from "./app-lock-quiet-seal-layout"

describe("App Lock Quiet Seal layout contract", () => {
  test("keeps the approved PIN rail and keypad proportions", () => {
    expect(APP_LOCK_QUIET_SEAL_LAYOUT).toMatchObject({
      pinCellGap: 10,
      pinCellSize: 28,
      pinRailWidth: 218,
      keypadWidth: 254,
      keyWidth: 62,
      keyHeight: 52,
      keyColumnGap: 34,
      keyRowGap: 8,
    })
  })

  test("keeps the approved top-control and display-type scale", () => {
    expect(APP_LOCK_QUIET_SEAL_LAYOUT).toMatchObject({
      choiceLabelFontScaleCap: 1,
      closeButtonSize: 42,
      sealSize: 115,
      titleFontSize: 33,
      titleLineHeight: 34,
    })
  })
})
