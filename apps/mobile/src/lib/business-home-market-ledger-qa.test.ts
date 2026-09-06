import { describe, expect, test } from "bun:test"
import {
  BUSINESS_HOME_MARKET_LEDGER_QA_STATES,
  parseBusinessHomeMarketLedgerQaState,
  resolveBusinessHomeMarketLedgerQaPath,
} from "./business-home-market-ledger-qa"

describe("Business Home Market Ledger QA routing", () => {
  test("admits each exact development-only state", () => {
    for (const state of BUSINESS_HOME_MARKET_LEDGER_QA_STATES) {
      expect(
        resolveBusinessHomeMarketLedgerQaPath(
          `ewatrade-dev://business-home-market-ledger?state=${state}`,
          true,
        ),
      ).toBe(
        `/design-system/business-home-market-ledger?state=${state}&theme=light`,
      )
      expect(
        parseBusinessHomeMarketLedgerQaState({ development: true, state }),
      ).toBe(state)
    }
    expect(
      resolveBusinessHomeMarketLedgerQaPath(
        "ewatrade-dev://business-home-market-ledger?state=operational-populated&theme=dark",
        true,
      ),
    ).toBe(
      "/design-system/business-home-market-ledger?state=operational-populated&theme=dark",
    )
  })

  test("rejects production, unknown, and array-valued states", () => {
    expect(
      resolveBusinessHomeMarketLedgerQaPath(
        "ewatrade-dev://business-home-market-ledger?state=setup",
        false,
      ),
    ).toBeNull()
    expect(
      parseBusinessHomeMarketLedgerQaState({
        development: true,
        state: "unknown",
      }),
    ).toBeNull()
    expect(
      parseBusinessHomeMarketLedgerQaState({
        development: true,
        state: ["setup"],
      }),
    ).toBeNull()
  })
})
