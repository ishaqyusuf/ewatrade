import { afterEach, beforeEach, expect, test } from "bun:test"
import { parseQaPolicy } from "./qa-policy"
import {
  getQaPolicy,
  getQaPolicyEnvironment,
  managedQaIdentity,
} from "./qa-policy-server"
const originalFetch = globalThis.fetch
const originalNow = Date.now
const originalEnv = { ...process.env }
let clock = originalNow()
const policy = {
  projectId: "ewatrade",
  revision: 1,
  environments: { development: true, preview: true, production: false },
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
  for (const k of ["APP_ENV", "QA_POLICY_URL", "QA_POLICY_READ_KEY"]) {
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
  process.env.APP_ENV = "production"
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
