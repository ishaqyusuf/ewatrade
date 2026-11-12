import { describe, expect, test } from "bun:test"
import { IN_APP_NUDGE_KEYS, toInAppNudge } from "./in-app-nudge"

describe("in-app nudge card", () => {
  test("maps each in-app adoption play to one card", () => {
    const keys = [
      "P02_first_sale",
      "P03_assistant_channel",
      "P04_site_setup",
      "P06_money_accounts",
    ].map((playId) => toInAppNudge({ id: "m1", playId })?.key)
    expect(keys).toEqual([...IN_APP_NUDGE_KEYS])
  })

  test("keeps the ledger id for dismissal and opens the real screen", () => {
    expect(toInAppNudge({ id: "m1", playId: "P04_site_setup" })).toMatchObject({
      id: "m1",
      ctaPath: "/storefront",
      ctaLabel: "Publish my site",
    })
  })

  test("no card for no row, email-only plays or unknown plays", () => {
    expect(toInAppNudge(null)).toBeNull()
    expect(toInAppNudge({ id: "m1", playId: "P15_win_back" })).toBeNull()
    expect(toInAppNudge({ id: "m1", playId: "P08_limit:products" })).toBeNull()
  })
})
