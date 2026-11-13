import { describe, expect, test } from "bun:test"
import { createHmac } from "node:crypto"
import type { PrismaClient } from "@ewatrade/db"
import { authenticateQaOffice, createQaOfficeRoutes } from "./routes"

const key = "k".repeat(40)
const env = { APP_ENV: "preview", OVERSIGHT_QA_KEY: key } as NodeJS.ProcessEnv
const now = new Date("2026-11-13T10:00:00Z")

function signed(envelope: object, secret = key) {
  const body = JSON.stringify(envelope)
  return {
    body,
    signature: createHmac("sha256", secret).update(body).digest("hex"),
  }
}
const list = {
  version: 1,
  actorId: "emp_1",
  issuedAt: now.toISOString(),
  operation: "list",
  input: {},
}

describe("Oversight QA office authentication", () => {
  test("accepts a fresh signed list request", () => {
    const { body, signature } = signed(list)
    expect(authenticateQaOffice(body, signature, env, now)?.operation).toBe(
      "list",
    )
  })
  test("refuses every request on a production runtime", () => {
    const { body, signature } = signed(list)
    for (const prod of [
      { ...env, APP_ENV: "production" },
      { ...env, VERCEL_ENV: "production" },
      { OVERSIGHT_QA_KEY: key, NODE_ENV: "production" },
    ])
      expect(
        authenticateQaOffice(body, signature, prod as NodeJS.ProcessEnv, now),
      ).toBeNull()
  })
  test("refuses wrong keys, stale requests and reused read keys", () => {
    const wrong = signed(list, "x".repeat(40))
    expect(
      authenticateQaOffice(wrong.body, wrong.signature, env, now),
    ).toBeNull()
    const stale = signed({ ...list, issuedAt: "2026-11-13T09:58:00Z" })
    expect(
      authenticateQaOffice(stale.body, stale.signature, env, now),
    ).toBeNull()
    const { body, signature } = signed(list)
    expect(
      authenticateQaOffice(
        body,
        signature,
        { ...env, OVERSIGHT_READ_KEY: key },
        now,
      ),
    ).toBeNull()
    expect(
      authenticateQaOffice(
        body,
        signature,
        { ...env, OVERSIGHT_QA_KEY: "short" },
        now,
      ),
    ).toBeNull()
  })
  test("only purges reserved .test domains", () => {
    const bad = signed({
      ...list,
      operation: "purge",
      input: { qa: "example.com" },
    })
    expect(authenticateQaOffice(bad.body, bad.signature, env, now)).toBeNull()
    const ok = signed({
      ...list,
      operation: "purge",
      input: { qa: "amina.qa.test", tenantIds: ["t1"] },
    })
    expect(
      authenticateQaOffice(ok.body, ok.signature, env, now)?.operation,
    ).toBe("purge")
  })
})

describe("Oversight QA office route", () => {
  const db = {
    tenant: {
      findMany: async () => [
        {
          id: "t1",
          name: "Amina Fabrics",
          slug: "amina-fabrics",
          isActive: true,
          createdAt: now,
          updatedAt: now,
          qaSourceDomain: "amina.qa.test",
        },
      ],
    },
    membership: {
      groupBy: async () => [{ tenantId: "t1", _count: { _all: 2 } }],
    },
    store: { groupBy: async () => [{ tenantId: "t1", _count: { _all: 1 } }] },
    catalogItem: {
      groupBy: async () => [{ tenantId: "t1", _count: { _all: 12 } }],
    },
    commercialOrder: { groupBy: async () => [] },
    customer: {
      groupBy: async () => [{ tenantId: "t1", _count: { _all: 4 } }],
    },
  } as unknown as PrismaClient

  test("lists QA businesses grouped by tester", async () => {
    const { body, signature } = signed({
      ...list,
      issuedAt: new Date().toISOString(),
    })
    const res = await createQaOfficeRoutes(() => db, env).request("/", {
      method: "POST",
      body,
      headers: { "X-Oversight-Signature": signature },
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      environment: string
      testers: Array<{ qa: string; businesses: Array<Record<string, unknown>> }>
    }
    expect(json.environment).toBe("preview")
    expect(json.testers[0]?.qa).toBe("amina.qa.test")
    expect(json.testers[0]?.businesses[0]).toMatchObject({
      staff: 2,
      stores: 1,
      products: 12,
      orders: 0,
      customers: 4,
    })
  })
  test("is not found in production", async () => {
    const res = await createQaOfficeRoutes(() => db, {
      ...env,
      APP_ENV: "production",
    }).request("/", { method: "POST", body: "{}" })
    expect(res.status).toBe(404)
  })
  test("rejects unsigned requests", async () => {
    const res = await createQaOfficeRoutes(() => db, env).request("/", {
      method: "POST",
      body: JSON.stringify(list),
    })
    expect(res.status).toBe(401)
  })
})
