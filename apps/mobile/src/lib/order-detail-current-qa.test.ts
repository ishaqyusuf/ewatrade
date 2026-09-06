import { describe, expect, test } from "bun:test"
import { resolveOrderDetailCurrentQaPath } from "./order-detail-current-qa"

describe("current Order detail QA route", () => {
  test("admits only its exact development-only light and dark URLs", () => {
    expect(
      resolveOrderDetailCurrentQaPath(
        "ewatrade-dev://order-detail-current?theme=dark",
        true,
      ),
    ).toBe("/design-system/order-detail-current?theme=dark")
    expect(
      resolveOrderDetailCurrentQaPath(
        "ewatrade-dev://order-detail-current",
        true,
      ),
    ).toBe("/design-system/order-detail-current?theme=light")
    expect(
      resolveOrderDetailCurrentQaPath(
        "ewatrade-dev://order-detail-current?theme=dark",
        false,
      ),
    ).toBeNull()
    expect(
      resolveOrderDetailCurrentQaPath(
        "ewatrade-dev://order-detail-current/extra?theme=dark",
        true,
      ),
    ).toBeNull()
    expect(
      resolveOrderDetailCurrentQaPath(
        "ewatrade-dev://order-detail-current?theme=sepia",
        true,
      ),
    ).toBeNull()
  })
})
