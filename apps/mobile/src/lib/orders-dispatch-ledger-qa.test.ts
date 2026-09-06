import { describe, expect, test } from "bun:test"
import {
  ORDERS_DISPATCH_LEDGER_QA_STATES,
  parseOrdersDispatchLedgerQaState,
  resolveOrdersDispatchLedgerQaPath,
} from "./orders-dispatch-ledger-qa"

describe("Orders Dispatch Ledger QA routing", () => {
  test("admits every exact development-only state", () => {
    for (const state of ORDERS_DISPATCH_LEDGER_QA_STATES) {
      expect(
        resolveOrdersDispatchLedgerQaPath(
          `ewatrade-dev://orders-dispatch-ledger?state=${state}`,
          true,
        ),
      ).toBe(`/design-system/orders-dispatch-ledger?state=${state}&theme=light`)
      expect(
        parseOrdersDispatchLedgerQaState({ development: true, state }),
      ).toBe(state)
    }
  })

  test("preserves an exact dark-theme request", () => {
    expect(
      resolveOrdersDispatchLedgerQaPath(
        "ewatrade-dev://orders-dispatch-ledger?state=populated&theme=dark",
        true,
      ),
    ).toBe("/design-system/orders-dispatch-ledger?state=populated&theme=dark")
  })

  test("rejects production, malformed, credentialed, and unknown routes", () => {
    expect(
      resolveOrdersDispatchLedgerQaPath(
        "ewatrade-dev://orders-dispatch-ledger?state=populated",
        false,
      ),
    ).toBeNull()
    expect(
      resolveOrdersDispatchLedgerQaPath(
        "ewatrade-dev://user:secret@orders-dispatch-ledger?state=populated",
        true,
      ),
    ).toBeNull()
    expect(
      resolveOrdersDispatchLedgerQaPath(
        "ewatrade-dev://orders-dispatch-ledger?state=unknown",
        true,
      ),
    ).toBeNull()
    expect(
      resolveOrdersDispatchLedgerQaPath(
        "ewatrade-dev://orders-dispatch-ledger/extra?state=populated",
        true,
      ),
    ).toBeNull()
    expect(
      resolveOrdersDispatchLedgerQaPath(
        "ewatrade-dev://orders-dispatch-ledger?state=populated&state=offline",
        true,
      ),
    ).toBeNull()
    expect(
      resolveOrdersDispatchLedgerQaPath(
        "ewatrade-dev://orders-dispatch-ledger?state=populated&theme=sepia",
        true,
      ),
    ).toBeNull()
    expect(
      resolveOrdersDispatchLedgerQaPath(
        "ewatrade-dev://orders-dispatch-ledger?state=populated&debug=true",
        true,
      ),
    ).toBeNull()
  })
})
