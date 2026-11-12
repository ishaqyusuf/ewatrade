import { describe, expect, test } from "bun:test"
import { type GrowthSnapshot, WHATSAPP_REPLIES_PER_MONTH } from "../../contract"
import { makeContext } from "../../fixtures"
import {
  whatsappCapOffers,
  whatsappCapStage,
  whatsappExhaustedPlay,
  whatsappWarningPlay,
} from "./whatsapp-cap"

const linkedFree = (used: number | null): Partial<GrowthSnapshot> => ({
  planId: "free",
  whatsappLinked: true,
  waRepliesUsed: used,
  waRepliesCap: used === null ? null : WHATSAPP_REPLIES_PER_MONTH.free,
})

const linkedPaid = (used: number): Partial<GrowthSnapshot> => ({
  planId: "growth",
  whatsappLinked: true,
  waRepliesUsed: used,
  waRepliesCap: WHATSAPP_REPLIES_PER_MONTH.growth,
})

describe("WhatsApp cap stage boundaries (Free, 200 replies)", () => {
  test.each([
    [158, null],
    [159, null],
    [160, "warning"],
    [179, "warning"],
    [180, "warning"],
    [199, "warning"],
    [200, "exhausted"],
    [230, "exhausted"],
  ] as const)("%i of 200 → %p", (used, stage) => {
    expect(whatsappCapStage(makeContext(linkedFree(used)).snapshot)).toBe(stage)
  })

  test("paid plans use 1,000: 790 quiet, 800 warning, 1,000 exhausted", () => {
    expect(whatsappCapStage(makeContext(linkedPaid(790)).snapshot)).toBeNull()
    expect(whatsappCapStage(makeContext(linkedPaid(800)).snapshot)).toBe(
      "warning",
    )
    expect(whatsappCapStage(makeContext(linkedPaid(1000)).snapshot)).toBe(
      "exhausted",
    )
  })
})

describe("dormant until the quota ledger exists", () => {
  test("null used and cap never qualify", () => {
    const ctx = makeContext(linkedFree(null))
    expect(whatsappWarningPlay.eligible(ctx)).toBeNull()
    expect(whatsappExhaustedPlay.eligible(ctx)).toBeNull()
  })

  test("a null cap with a count, or a zero cap, never qualifies", () => {
    for (const snapshot of [
      { ...linkedFree(500), waRepliesCap: null },
      { ...linkedFree(500), waRepliesCap: 0 },
      { ...linkedFree(null), waRepliesCap: 200 },
    ]) {
      const ctx = makeContext(snapshot)
      expect(whatsappWarningPlay.eligible(ctx)).toBeNull()
      expect(whatsappExhaustedPlay.eligible(ctx)).toBeNull()
    }
  })
})

describe("a Telegram-only business never triggers P10 or P11", () => {
  test.each([0, 160, 200, 5000])("%i Telegram replies", (used) => {
    const ctx = makeContext({
      planId: "free",
      whatsappLinked: false,
      telegramLinked: true,
      waRepliesUsed: used,
      waRepliesCap: WHATSAPP_REPLIES_PER_MONTH.free,
    })
    expect(whatsappWarningPlay.eligible(ctx)).toBeNull()
    expect(whatsappExhaustedPlay.eligible(ctx)).toBeNull()
  })
})

describe("offers by plan", () => {
  test("Free offers Starter first, then Telegram", () => {
    expect(whatsappCapOffers("free", { hasTopUp: false })).toEqual([
      "upgrade_starter",
      "telegram",
    ])
    expect(whatsappCapOffers("free", { hasTopUp: true })).toEqual([
      "upgrade_starter",
      "telegram",
    ])
  })

  test("paid plans offer a top-up first only when one exists", () => {
    for (const planId of ["starter", "growth", "pro"] as const) {
      expect(whatsappCapOffers(planId, { hasTopUp: true })).toEqual([
        "top_up",
        "telegram",
      ])
      expect(whatsappCapOffers(planId, { hasTopUp: false })).toEqual([
        "telegram",
      ])
    }
  })

  test("Free at 80%: Starter with 5× the replies, preselected at checkout", () => {
    const decision = whatsappWarningPlay.eligible(makeContext(linkedFree(160)))
    expect(decision).toMatchObject({
      periodKey: "2026-11",
      templateKey: "lifecycle-whatsapp-warning",
      ctaPath: "/settings/billing?plan=starter&from=P10_whatsapp_80",
    })
    expect(decision?.data).toMatchObject({
      left: 40,
      resetsOn: "1 Dec",
      offers: "upgrade_starter,telegram",
      starterMultiple: 5,
      ctaLabel: "Upgrade to Starter",
    })
  })

  test("Free exhausted without checkout falls back to Plan and billing", () => {
    const decision = whatsappExhaustedPlay.eligible(
      makeContext(linkedFree(200), { checkoutAvailable: false }),
    )
    expect(decision?.ctaPath).toBe("/settings/billing")
    expect(decision?.data.ctaLabel).toBe("See plans")
  })

  test("paid exhausted with no top-up product goes to Telegram", () => {
    const decision = whatsappExhaustedPlay.eligible(
      makeContext(linkedPaid(1000)),
    )
    expect(decision?.ctaPath).toBe("/account/telegram")
    expect(decision?.data).toMatchObject({
      offers: "telegram",
      ctaLabel: "Connect Telegram",
    })
  })

  test("paid with Telegram already linked: open it, not connect it", () => {
    const decision = whatsappWarningPlay.eligible(
      makeContext({ ...linkedPaid(850), telegramLinked: true }),
    )
    expect(decision?.data.ctaLabel).toBe("Open Telegram")
  })

  test("P10 and P11 never fire together", () => {
    for (const used of [160, 200]) {
      const ctx = makeContext(linkedFree(used))
      const both = [whatsappWarningPlay, whatsappExhaustedPlay].filter((play) =>
        play.eligible(ctx),
      )
      expect(both).toHaveLength(1)
    }
  })

  test("exhaustion is transactional; the 80% notice is an offer", () => {
    expect(whatsappExhaustedPlay.consent).toBe("transactional")
    expect(whatsappWarningPlay.consent).toBe("offers")
  })
})

describe("cap success", () => {
  const sentOn = makeContext(linkedFree(200)).snapshot
  test("upgrade, Telegram link or a higher cap all count", () => {
    expect(
      whatsappExhaustedPlay.success.achieved(sentOn, {
        ...sentOn,
        planId: "starter",
      }),
    ).toBe(true)
    expect(
      whatsappExhaustedPlay.success.achieved(sentOn, {
        ...sentOn,
        telegramLinked: true,
      }),
    ).toBe(true)
    expect(
      whatsappExhaustedPlay.success.achieved(sentOn, {
        ...sentOn,
        waRepliesCap: 400,
      }),
    ).toBe(true)
    expect(whatsappExhaustedPlay.success.achieved(sentOn, sentOn)).toBe(false)
  })
})
