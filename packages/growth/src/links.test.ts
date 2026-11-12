import { describe, expect, test } from "bun:test"
import {
  lifecycleEmailLinks,
  lifecycleLinkSecret,
  lifecycleRedirectUrl,
  safeCtaPath,
  signLifecycleClickToken,
  signLifecyclePreferenceToken,
  verifyLifecycleClickToken,
  verifyLifecyclePreferenceToken,
} from "./links"

const secret = "s".repeat(40)

describe("lifecycle links", () => {
  test("click token round-trips and rejects tampering or the wrong purpose", () => {
    const token = signLifecycleClickToken(
      { m: "msg_1", p: "/storefront" },
      secret,
    )
    expect(verifyLifecycleClickToken(token, secret)).toEqual({
      m: "msg_1",
      p: "/storefront",
    })
    expect(verifyLifecycleClickToken(`${token}x`, secret)).toBeNull()
    expect(verifyLifecycleClickToken(token, "t".repeat(40))).toBeNull()
    const prefs = signLifecyclePreferenceToken("user_1", secret)
    expect(verifyLifecycleClickToken(prefs, secret)).toBeNull()
    expect(verifyLifecyclePreferenceToken(prefs, secret)).toEqual({
      u: "user_1",
    })
    expect(verifyLifecyclePreferenceToken(token, secret)).toBeNull()
  })

  test("only app-relative CTA paths are allowed", () => {
    expect(safeCtaPath("/finance/accounts?financeSheet=account")).toBe(
      "/finance/accounts?financeSheet=account",
    )
    for (const bad of [
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "/javascript:alert(1)",
      "storefront",
      "/ x",
    ])
      expect(safeCtaPath(bad)).toBeNull()
    expect(() =>
      signLifecycleClickToken({ m: "m", p: "//evil.test" }, secret),
    ).toThrow()
  })

  test("redirect stays on the Dashboard and adds UTM", () => {
    const url = lifecycleRedirectUrl(
      "https://dash.ewatrade.com",
      "/storefront?tab=1",
      "P04_site_setup",
    )
    expect(url.href).toBe(
      "https://dash.ewatrade.com/storefront?tab=1&utm_source=lifecycle&utm_medium=email&utm_campaign=P04_site_setup",
    )
  })

  test("email links point at the API redirect, the preference page and the one-click endpoint", () => {
    const links = lifecycleEmailLinks({
      apiOrigin: "https://api.ewatrade.com",
      dashboardOrigin: "https://dash.ewatrade.com",
      secret,
      messageId: "msg_1",
      userId: "user_1",
      ctaPath: "/storefront",
    })
    expect(links.ctaHref).toStartWith("https://api.ewatrade.com/go/")
    expect(links.preferencesUrl).toStartWith(
      "https://dash.ewatrade.com/email-preferences?token=",
    )
    expect(links.unsubscribeUrl).toEndWith("&unsubscribe=1")
    expect(links.oneClickUnsubscribeUrl).toStartWith(
      "https://api.ewatrade.com/lifecycle/unsubscribe?token=",
    )
  })

  test("short secrets are refused", () => {
    expect(lifecycleLinkSecret({ LIFECYCLE_LINK_SECRET: "short" })).toBeNull()
    expect(lifecycleLinkSecret({ LIFECYCLE_LINK_SECRET: secret })).toBe(secret)
  })
})
