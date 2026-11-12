import { expect, test } from "bun:test"
import {
  type LifecycleDeps,
  basePlayId,
  lifecycleRuntime,
  runGrowthLifecycleSweep,
  sendLifecycleEmail,
} from "./lifecycle"

const ready = {
  GROWTH_LIFECYCLE_ENABLED: "true",
  LIFECYCLE_EMAIL_FROM: "Ishaq from EwaTrade <ishaq@mail.ewatrade.com>",
  LIFECYCLE_LINK_SECRET: "x".repeat(40),
  NEXT_PUBLIC_DASHBOARD_URL: "https://dash.ewatrade.com",
  NEXT_PUBLIC_API_URL: "https://api.ewatrade.com",
}

/** Any database access throws: proves a path issues no SQL. */
const noDb = new Proxy(
  {},
  {
    get() {
      throw new Error("unexpected database access")
    },
  },
) as LifecycleDeps["db"]

function deps(env: Record<string, string>, now: string): LifecycleDeps {
  return {
    db: noDb,
    env,
    now: () => new Date(now),
    plays: [],
    templates: {},
    transport: { send: async () => undefined },
    assertProviderAllowed: async () => undefined,
  }
}

test("flag off: the hourly step is a no-op with no SQL", async () => {
  expect(
    await runGrowthLifecycleSweep(deps({}, "2026-11-12T10:00:00Z")),
  ).toEqual({ enabled: false })
})

test("email needs the flag, the lifecycle sender, a long secret and HTTPS origins", () => {
  expect(lifecycleRuntime(ready).emailReady).toBe(true)
  // The Dashboard origin falls back to dash.<platform domain>; nothing else may be missing.
  for (const key of Object.keys(ready).filter(
    (key) => key !== "NEXT_PUBLIC_DASHBOARD_URL",
  )) {
    const env: Record<string, string> = { ...ready }
    delete env[key]
    expect(lifecycleRuntime(env).emailReady).toBe(false)
  }
  expect(
    lifecycleRuntime({ ...ready, NEXT_PUBLIC_DASHBOARD_URL: "http://x.test" })
      .emailReady,
  ).toBe(false)
  expect(
    lifecycleRuntime({
      ...ready,
      EMAIL_FROM: "a@b.co",
      LIFECYCLE_EMAIL_FROM: "",
    }).from,
  ).toBeNull()
  expect(
    lifecycleRuntime({
      ...ready,
      GROWTH_LIFECYCLE_PLAYS: "P04_site_setup, P06_money_accounts",
    }).enabledPlays,
  ).toEqual(new Set(["P04_site_setup", "P06_money_accounts"]))
})

test("quiet hours defer the send before touching the database", async () => {
  expect(
    await sendLifecycleEmail("m1", deps(ready, "2026-11-12T20:30:00Z")),
  ).toBe("deferred")
})

test("ledger sub-ids map to their play", () => {
  expect(basePlayId("P08_limit:products")).toBe("P08_limit")
  expect(basePlayId("P04_site_setup")).toBe("P04_site_setup")
})
