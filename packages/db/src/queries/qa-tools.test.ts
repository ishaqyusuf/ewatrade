import { describe, expect, test } from "bun:test"
import { resolveAuthenticatedQaFixtureContext } from "./qa-tools"

const now = new Date("2026-10-01T12:00:00Z")
const session = {
  createdAt: now,
  expiresAt: new Date(now.getTime() + 3_600_000),
  user: { id: "tester", email: "tester@example.qa.test", emailVerified: true },
}
const membership = {
  status: "ACTIVE",
  tenant: {
    id: "business",
    currencyCode: "NGN",
    timezone: "Africa/Lagos",
    isActive: true,
    dataClassification: "QA",
    qaPurgeStartedAt: null,
    qaSourceDomain: "example.qa.test",
    stores: [{ id: "store", status: "ACTIVE" }],
  },
}
type QaToolsFacts = Parameters<typeof resolveAuthenticatedQaFixtureContext>[0]
const input = {
  enabled: true,
  domainRoutes: '{"example.qa.test":"tester@example.com"}',
  membership,
  now,
  session,
  storeId: "store",
}

describe("authenticated QA draft tooling", () => {
  test("allows a verified ordinary QA login in the current QA business", () => {
    expect(resolveAuthenticatedQaFixtureContext(input)).toMatchObject({
      qaDomain: "example.qa.test",
      tenantId: "business",
      storeId: "store",
      principalId: "tester",
      expiresAt: new Date(now.getTime() + 60_000),
    })
  })

  test.each<QaToolsFacts>([
    { ...input, enabled: false },
    { ...input, session: null },
    { ...input, membership: null },
    { ...input, domainRoutes: "{}" },
    { ...input, domainRoutes: "invalid-json" },
    { ...input, storeId: "another-store" },
    { ...input, session: { ...session, expiresAt: now } },
    {
      ...input,
      session: { ...session, user: { ...session.user, emailVerified: false } },
    },
    {
      ...input,
      session: {
        ...session,
        user: { ...session.user, email: "tester@lookalike.example.qa.test" },
      },
    },
    {
      ...input,
      session: {
        ...session,
        user: { ...session.user, email: "qa+tester@example.com" },
      },
    },
    {
      ...input,
      session: {
        ...session,
        user: { ...session.user, email: "a@b@example.qa.test" },
      },
    },
    { ...input, membership: { ...membership, status: "SUSPENDED" } },
    {
      ...input,
      membership: {
        ...membership,
        tenant: { ...membership.tenant, dataClassification: "LIVE" },
      },
    },
    {
      ...input,
      membership: {
        ...membership,
        tenant: { ...membership.tenant, isActive: false },
      },
    },
    {
      ...input,
      membership: {
        ...membership,
        tenant: { ...membership.tenant, qaPurgeStartedAt: now },
      },
    },
    {
      ...input,
      membership: {
        ...membership,
        tenant: { ...membership.tenant, qaSourceDomain: "other.qa.test" },
      },
    },
    {
      ...input,
      membership: {
        ...membership,
        tenant: {
          ...membership.tenant,
          stores: [{ id: "store", status: "ARCHIVED" }],
        },
      },
    },
  ])(
    "denies unavailable, unverified, expired or mismatched scope %#",
    (facts) => {
      expect(resolveAuthenticatedQaFixtureContext(facts)).toBeNull()
    },
  )

  test("normalizes the verified email, limits validity to session expiry and returns no routing destinations", () => {
    const result = resolveAuthenticatedQaFixtureContext({
      ...input,
      session: {
        ...session,
        expiresAt: new Date(now.getTime() + 5000),
        user: { ...session.user, email: " Tester@Example.QA.Test " },
      },
    })
    expect(result?.expiresAt).toEqual(new Date(now.getTime() + 5000))
    expect(JSON.stringify(result)).not.toContain("tester@example.com")
  })
})
