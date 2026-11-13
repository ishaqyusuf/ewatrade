import { afterEach, beforeEach, expect, test } from "bun:test"
import { parseQaPolicy } from "./qa-policy"
import {
  getQaPolicy,
  getQaPolicyEnvironment,
  managedQaDomainEnabled,
  managedQaIdentity,
  qaPolicyTarget,
} from "./qa-policy-server"
const originalFetch = globalThis.fetch
const originalNow = Date.now
const originalEnv = { ...process.env }
let clock = originalNow()
const policy = {
  projectId: "ewatrade",
  revision: 1,
  environments: { development: true, preview: true },
  entries: [
    {
      id: "57da5d46-6b28-44ef-8be7-d29eb6171f3f",
      qa: "sample.qa.test",
      email: "tester@example.com",
      phone: "+2348000000000",
      accountId: null,
      active: true,
    },
  ],
}
beforeEach(() => {
  process.env.APP_ENV = "preview"
  process.env.QA_POLICY_URL =
    "https://oversight.example.test/api/qa-policy/v1/ewatrade"
  process.env.QA_POLICY_READ_KEY = crypto.randomUUID()
  clock = originalNow()
  Date.now = () => clock
  globalThis.fetch = Object.assign(async () => Response.json(policy), {
    preconnect: originalFetch.preconnect,
  }) as typeof fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
  Date.now = originalNow
  for (const k of [
    "APP_ENV",
    "QA_POLICY_URL",
    "QA_POLICY_READ_KEY",
    "VERCEL_ENV",
  ]) {
    if (originalEnv[k] === undefined) delete process.env[k]
    else process.env[k] = originalEnv[k]
  }
})
test("disabled and mismatched selected phones deny QA, without falling back to deployment flags", async () => {
  await expect(
    managedQaIdentity({
      entryId: policy.entries[0]?.id,
      phone: "+2348111111111",
    }),
  ).rejects.toThrow("no longer matches")
  globalThis.fetch = Object.assign(
    async () =>
      Response.json({
        ...policy,
        environments: { development: true, preview: false },
      }),
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch
  process.env.QA_POLICY_READ_KEY = crypto.randomUUID()
  await expect(
    managedQaIdentity({ phone: policy.entries[0]?.phone }),
  ).rejects.toThrow("disabled")
  const denied = await getQaPolicyEnvironment({
    APP_ENV: "preview",
    QA_ACCELERATOR_ENABLED: "true",
    EMAIL_QA_DOMAIN_ROUTES: '{"old.test":"old@example.com"}',
  })
  expect(denied.QA_TOOLS_ENABLED).toBe("false")
  expect(denied.EMAIL_QA_DOMAIN_ROUTES).toBe("{}")
})
test("one cached policy read serves concurrent callers and expires after a failed refresh", async () => {
  let reads = 0
  globalThis.fetch = Object.assign(
    async () => {
      reads++
      return Response.json(policy)
    },
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch
  await Promise.all([getQaPolicy(), getQaPolicy(), getQaPolicy()])
  expect(reads).toBe(1)
  globalThis.fetch = Object.assign(
    async () => {
      throw new Error("offline")
    },
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch
  clock += 31_000
  expect((await getQaPolicy()).revision).toBe(1)
  clock += 30_000
  await expect(getQaPolicy()).rejects.toThrow("unavailable")
})
test("revoked entries deny QA and duplicate phone bindings cannot be stored", async () => {
  globalThis.fetch = Object.assign(
    async () =>
      Response.json({
        ...policy,
        entries: policy.entries.map((e) => ({ ...e, active: false })),
      }),
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch
  await expect(
    managedQaIdentity({ phone: policy.entries[0]?.phone }),
  ).rejects.toThrow("disabled")
  expect(() =>
    parseQaPolicy({
      ...policy,
      entries: [
        ...policy.entries,
        { ...policy.entries[0], id: crypto.randomUUID(), qa: "other.qa.test" },
      ],
    }),
  ).toThrow()
})
test("production never enables QA, even when an old policy says it may", async () => {
  const legacy = parseQaPolicy({
    ...policy,
    environments: { development: true, preview: true, production: true },
  })
  expect(legacy.environments).toEqual({ development: true, preview: true })
  globalThis.fetch = Object.assign(
    async () =>
      Response.json({
        ...policy,
        environments: { development: true, preview: true, production: true },
      }),
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch
  for (const runtime of [
    { APP_ENV: "production" },
    { APP_ENV: "preview", VERCEL_ENV: "production" },
    { NODE_ENV: "production" },
  ]) {
    const env = {
      QA_POLICY_URL: process.env.QA_POLICY_URL,
      QA_POLICY_READ_KEY: process.env.QA_POLICY_READ_KEY,
      QA_ACCELERATOR_ENABLED: "true",
      EMAIL_QA_DOMAIN_ROUTES: '{"sample.qa.test":"tester@example.com"}',
      ...runtime,
    }
    expect(qaPolicyTarget(env)).toBeNull()
    await expect(getQaPolicy(env)).rejects.toThrow(
      "not available in production",
    )
    const managed = await getQaPolicyEnvironment(env)
    expect(managed.QA_TOOLS_ENABLED).toBe("false")
    expect(managed.QA_ACCELERATOR_ENABLED).toBe("false")
    expect(managed.EMAIL_QA_DOMAIN_ROUTES).toBe("{}")
  }
  process.env.APP_ENV = "production"
  await expect(
    managedQaIdentity({ email: "owner@sample.qa.test" }),
  ).rejects.toThrow("not available in production")
  await expect(
    managedQaIdentity({
      entryId: policy.entries[0]?.id,
      phone: policy.entries[0]?.phone,
    }),
  ).rejects.toThrow("not available in production")
  expect(
    await managedQaIdentity({ phone: policy.entries[0]?.phone }),
  ).toBeNull()
  expect(await managedQaDomainEnabled("sample.qa.test")).toBe(false)
})
test("Development and Preview keep reading their own flags", () => {
  expect(qaPolicyTarget({ APP_ENV: "local" })).toBe("development")
  expect(qaPolicyTarget({ APP_ENV: "preview", VERCEL_ENV: "preview" })).toBe(
    "preview",
  )
})
