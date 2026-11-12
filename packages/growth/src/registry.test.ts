import { describe, expect, test } from "bun:test"
import { PLAY_IDS, WHATSAPP_REPLIES_PER_MONTH, monthKey } from "./contract"
import { makeContext } from "./fixtures"
import { LIFECYCLE_PLAYS, playRank } from "./registry"

describe("lifecycle play registry", () => {
  test("play ids are unique and registered once", () => {
    const ids = LIFECYCLE_PLAYS.map((play) => play.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(PLAY_IDS).toContain(id)
  })

  test("priority puts WhatsApp exhaustion first and unlisted plays after listed ones", () => {
    expect(playRank("P11_whatsapp_exhausted")).toBe(0)
    expect(playRank("P08_limit")).toBeLessThan(playRank("P02_first_sale"))
    expect(playRank("P15_win_back")).toBeGreaterThan(
      playRank("P03_assistant_channel"),
    )
  })

  test("every registered play is pure on a fixture context", () => {
    const ctx = makeContext()
    for (const play of LIFECYCLE_PLAYS)
      expect(play.eligible(ctx)).toEqual(play.eligible(ctx))
  })

  test("WhatsApp replies follow the owner decision", () => {
    expect(WHATSAPP_REPLIES_PER_MONTH).toEqual({
      free: 200,
      starter: 1000,
      growth: 1000,
      pro: 1000,
    })
  })

  test("month key is UTC", () => {
    expect(monthKey(new Date("2026-11-30T23:30:00-01:00"))).toBe("2026-12")
  })
})
