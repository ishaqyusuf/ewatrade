import { describe, expect, test } from "bun:test"
import {
  SALES_REP_SHIFT_LEDGER_QA_STATES,
  resolveSalesRepShiftLedgerQaPath,
} from "./sales-rep-shift-ledger-qa"

describe("Sales Rep Shift Ledger QA routing", () => {
  test("maps every exact development state through the app-specific scheme", () => {
    for (const state of SALES_REP_SHIFT_LEDGER_QA_STATES) {
      expect(
        resolveSalesRepShiftLedgerQaPath(
          `ewatrade-dev://sales-rep-home-shift-ledger?state=${state}&theme=dark`,
          true,
        ),
      ).toBe(
        `/design-system/sales-rep-home-shift-ledger?state=${state}&theme=dark`,
      )
    }
  })

  test("rejects production, unknown states, and the wrong hostname", () => {
    expect(
      resolveSalesRepShiftLedgerQaPath(
        "ewatrade-dev://sales-rep-home-shift-ledger?state=empty",
        false,
      ),
    ).toBeNull()
    expect(
      resolveSalesRepShiftLedgerQaPath(
        "ewatrade-dev://sales-rep-home-shift-ledger?state=unknown",
        true,
      ),
    ).toBeNull()
    expect(
      resolveSalesRepShiftLedgerQaPath(
        "ewatrade-dev://business-home-market-ledger?state=empty",
        true,
      ),
    ).toBeNull()
  })
})
