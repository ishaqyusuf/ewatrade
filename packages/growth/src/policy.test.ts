import { describe, expect, test } from "bun:test"
import type { LifecyclePlay, PlayId } from "./contract"
import {
  type MarketingConsent,
  type PolicyRecipient,
  consentAllows,
  emailCapAllows,
  emailSendWindowOpen,
  holdoutBucket,
  isHoldout,
  planLifecycleMessages,
} from "./policy"

const now = new Date("2026-11-12T10:00:00Z")
const day = 86_400_000
const consent: MarketingConsent = {
  productTips: true,
  offers: true,
  monthlyReport: true,
  unsubscribedAllAt: null,
}

function play(
  id: PlayId,
  overrides: Partial<LifecyclePlay> = {},
): LifecyclePlay {
  return {
    id,
    family: "adoption",
    consent: "productTips",
    channels: ["email", "in_app"],
    realtime: false,
    eligible: () => null,
    success: { windowDays: 7, achieved: () => false },
    ...overrides,
  }
}
const decision = { periodKey: "once", templateKey: "t", data: {}, ctaPath: "/" }

function recipient(overrides: Partial<PolicyRecipient> = {}): PolicyRecipient {
  return {
    userId: "u1",
    role: "OWNER",
    consent,
    history: { emailSentAt: [], inAppVisible: false },
    ...overrides,
  }
}

/** A tenant id outside the holdout for every play used below. */
function treatedTenant(...ids: PlayId[]) {
  for (let index = 0; ; index += 1) {
    const tenantId = `tenant_${index}`
    if (ids.every((id) => !isHoldout(tenantId, id))) return tenantId
  }
}
function holdoutTenant(id: PlayId) {
  for (let index = 0; ; index += 1) {
    const tenantId = `tenant_${index}`
    if (isHoldout(tenantId, id)) return tenantId
  }
}

describe("consent", () => {
  test("category toggles block every channel; unsubscribe-all blocks email only", () => {
    expect(
      consentAllows({ ...consent, offers: false }, "offers", "email"),
    ).toBe(false)
    expect(
      consentAllows({ ...consent, offers: false }, "offers", "in_app"),
    ).toBe(false)
    const unsubscribed = { ...consent, unsubscribedAllAt: now }
    expect(consentAllows(unsubscribed, "productTips", "email")).toBe(false)
    expect(consentAllows(unsubscribed, "productTips", "in_app")).toBe(true)
  })

  test("transactional bypasses opt-out", () => {
    const optedOut = {
      productTips: false,
      offers: false,
      monthlyReport: false,
      unsubscribedAllAt: now,
    }
    expect(consentAllows(optedOut, "transactional", "email")).toBe(true)
  })
})

describe("frequency caps", () => {
  test("1 email per 3 days", () => {
    expect(
      emailCapAllows([new Date(now.getTime() - 2 * day)], now, "productTips"),
    ).toBe(false)
    expect(
      emailCapAllows([new Date(now.getTime() - 3 * day)], now, "productTips"),
    ).toBe(true)
  })

  test("2 emails per 7 days", () => {
    const history = [
      new Date(now.getTime() - 4 * day),
      new Date(now.getTime() - 6 * day),
    ]
    expect(emailCapAllows(history, now, "offers")).toBe(false)
    expect(emailCapAllows(history.slice(0, 1), now, "offers")).toBe(true)
  })

  test("transactional is exempt", () => {
    expect(emailCapAllows([now, now], now, "transactional")).toBe(true)
  })
})

describe("quiet hours (WAT, UTC+1)", () => {
  test("08:00–20:00 WAT is open", () => {
    expect(emailSendWindowOpen(new Date("2026-11-12T06:59:00Z"))).toBe(false)
    expect(emailSendWindowOpen(new Date("2026-11-12T07:00:00Z"))).toBe(true)
    expect(emailSendWindowOpen(new Date("2026-11-12T18:59:00Z"))).toBe(true)
    expect(emailSendWindowOpen(new Date("2026-11-12T19:00:00Z"))).toBe(false)
  })
})

describe("holdout", () => {
  test("is stable and close to 10%", () => {
    expect(holdoutBucket("t1", "P04_site_setup")).toBe(
      holdoutBucket("t1", "P04_site_setup"),
    )
    let held = 0
    for (let index = 0; index < 5000; index += 1)
      if (isHoldout(`tenant_${index}`, "P04_site_setup")) held += 1
    expect(held / 5000).toBeGreaterThan(0.08)
    expect(held / 5000).toBeLessThan(0.12)
  })

  test("a holdout business gets a holdout row, never a send", () => {
    const tenantId = holdoutTenant("P04_site_setup")
    const { planned } = planLifecycleMessages({
      now,
      tenantId,
      eligible: [{ play: play("P04_site_setup"), decision }],
      recipients: [recipient()],
    })
    expect(planned).toHaveLength(1)
    expect(planned[0]).toMatchObject({ status: "holdout", variant: "control" })
  })
})

describe("planLifecycleMessages", () => {
  test("only Owner and Admin receive messages", () => {
    const tenantId = treatedTenant("P04_site_setup")
    const { planned } = planLifecycleMessages({
      now,
      tenantId,
      eligible: [{ play: play("P04_site_setup"), decision }],
      recipients: [
        recipient({ userId: "owner" }),
        recipient({ userId: "admin", role: "ADMIN" }),
        recipient({ userId: "staff", role: "STAFF" }),
      ],
    })
    expect(planned.map((row) => row.userId)).toEqual(["owner", "admin"])
  })

  test("highest priority play takes the email; the next falls back to in-app; a third is deferred", () => {
    const ids: PlayId[] = ["P02_first_sale", "P08_limit", "P06_money_accounts"]
    const tenantId = treatedTenant(...ids)
    const { planned, deferred } = planLifecycleMessages({
      now,
      tenantId,
      eligible: ids.map((id) => ({ play: play(id), decision })),
      recipients: [recipient()],
    })
    expect(planned.map((row) => [row.playId, row.channel, row.status])).toEqual(
      [
        ["P08_limit", "email", "pending"],
        ["P02_first_sale", "in_app", "sent"],
      ],
    )
    expect(deferred).toEqual([
      { userId: "u1", playId: "P06_money_accounts", reason: "email_cap" },
    ])
  })

  test("a visible nudge blocks a second in-app play", () => {
    const tenantId = treatedTenant("P04_site_setup")
    const { planned, deferred } = planLifecycleMessages({
      now,
      tenantId,
      eligible: [
        { play: play("P04_site_setup", { channels: ["in_app"] }), decision },
      ],
      recipients: [
        recipient({ history: { emailSentAt: [], inAppVisible: true } }),
      ],
    })
    expect(planned).toEqual([])
    expect(deferred[0]?.reason).toBe("nudge_visible")
  })

  test("opted-out recipients get a suppressed row; unsubscribed email falls back to in-app", () => {
    const tenantId = treatedTenant("P08_limit", "P04_site_setup")
    const offersOff = planLifecycleMessages({
      now,
      tenantId,
      eligible: [{ play: play("P08_limit", { consent: "offers" }), decision }],
      recipients: [recipient({ consent: { ...consent, offers: false } })],
    })
    expect(offersOff.planned[0]).toMatchObject({
      status: "suppressed",
      suppressedReason: "consent",
    })
    const unsubscribed = planLifecycleMessages({
      now,
      tenantId,
      eligible: [{ play: play("P04_site_setup"), decision }],
      recipients: [
        recipient({ consent: { ...consent, unsubscribedAllAt: now } }),
      ],
    })
    expect(unsubscribed.planned[0]).toMatchObject({
      channel: "in_app",
      status: "sent",
    })
  })

  test("existing ledger rows are skipped so they do not use up today's slot", () => {
    const ids: PlayId[] = ["P08_limit", "P04_site_setup"]
    const tenantId = treatedTenant(...ids)
    const { planned } = planLifecycleMessages({
      now,
      tenantId,
      eligible: ids.map((id) => ({
        play: play(id, { channels: ["email"] }),
        decision,
      })),
      recipients: [recipient()],
      alreadyRecorded: (_user, playId) => playId === "P08_limit",
    })
    expect(planned.map((row) => row.playId)).toEqual(["P04_site_setup"])
  })

  test("ledger play id and staged-rollout allowlist", () => {
    const tenantId = treatedTenant("P08_limit", "P04_site_setup")
    const { planned } = planLifecycleMessages({
      now,
      tenantId,
      eligible: [
        {
          play: play("P08_limit"),
          decision: { ...decision, ledgerPlayId: "P08_limit:products" },
        },
        { play: play("P04_site_setup"), decision },
      ],
      recipients: [recipient()],
      enabledPlays: new Set(["P08_limit"]),
    })
    expect(planned.map((row) => row.playId)).toEqual(["P08_limit:products"])
  })
})
