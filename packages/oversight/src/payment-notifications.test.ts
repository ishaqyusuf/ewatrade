import { expect, test } from "bun:test"
import { createOversightRoutes } from "./routes"
const original = {
  read: process.env.OVERSIGHT_READ_KEY,
  write: process.env.OVERSIGHT_WRITE_KEY,
}
async function keys(run: () => Promise<void>) {
  process.env.OVERSIGHT_READ_KEY = "read-".padEnd(40, "r")
  process.env.OVERSIGHT_WRITE_KEY = "write-".padEnd(40, "w")
  try {
    await run()
  } finally {
    if (original.read === undefined)
      Reflect.deleteProperty(process.env, "OVERSIGHT_READ_KEY")
    else process.env.OVERSIGHT_READ_KEY = original.read
    if (original.write === undefined)
      Reflect.deleteProperty(process.env, "OVERSIGHT_WRITE_KEY")
    else process.env.OVERSIGHT_WRITE_KEY = original.write
  }
}
const db = () => {
  throw new Error("Database must not be reached by invalid requests")
}
test("portfolio read credentials never authorize notification policy writes", () =>
  keys(async () => {
    const app = createOversightRoutes(db, {
      allowNotificationPolicyWrites: true,
    })
    expect(
      (
        await app.request("/payment-notifications", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${process.env.OVERSIGHT_READ_KEY}`,
          },
          body: "{}",
        })
      ).status,
    ).toBe(401)
    expect((await app.request("/payment-notifications")).status).toBe(401)
    process.env.OVERSIGHT_WRITE_KEY = process.env.OVERSIGHT_READ_KEY
    expect(
      (
        await app.request("/payment-notifications", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${process.env.OVERSIGHT_WRITE_KEY}`,
          },
          body: "{}",
        })
      ).status,
    ).toBe(401)
  }))
test("standalone read service keeps writes unavailable even with a write credential", () =>
  keys(async () => {
    const app = createOversightRoutes(db)
    const response = await app.request("/payment-notifications", {
      method: "PUT",
      headers: { Authorization: `Bearer ${process.env.OVERSIGHT_WRITE_KEY}` },
      body: "{}",
    })
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: "Configuration writes are unavailable on this read-only service.",
    })
  }))
test("write route rejects malformed, foreign and incomplete policy before database access", () =>
  keys(async () => {
    const app = createOversightRoutes(db, {
      allowNotificationPolicyWrites: true,
    })
    for (const body of [
      "{",
      JSON.stringify({
        actorId: "owner",
        tenantId: "foreign",
        commandId: crypto.randomUUID(),
        tiers: {},
      }),
      "x".repeat(16001),
    ]) {
      expect(
        (
          await app.request("/payment-notifications", {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${process.env.OVERSIGHT_WRITE_KEY}`,
            },
            body,
          })
        ).status,
      ).toBe(400)
    }
  }))
