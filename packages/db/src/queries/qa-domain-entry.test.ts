import { describe, expect, test } from "bun:test"
import { authorizeQaDomain } from "./qa-access"

const env = {
  APP_ENV: "preview",
  QA_ACCELERATOR_ENABLED: "true",
  QA_ACCELERATOR_SECRET: "domain-entry-server-signing-secret-32-chars",
  EMAIL_QA_DOMAIN_ROUTES: '{"example.qa.test":"tester@example.com"}',
}
const input = {
  clientId: "test-device-123",
  clientPlatform: "mobile" as const,
  qaDomain: "example.qa.test",
}

describe("domain-only non-production QA entry", () => {
  test.each([
    { ...env, APP_ENV: "production", QA_ACCELERATOR_ENABLED: "false" },
    { ...env, APP_ENV: "unknown" },
    { ...env, QA_ACCELERATOR_ENABLED: "false" },
    { ...env, QA_ACCELERATOR_SECRET: "short" },
    { ...env, EMAIL_QA_DOMAIN_ROUTES: "{}" },
  ])(
    "denies unsafe or disabled environments before database access %#",
    async (environment) => {
      let touched = false
      const db = {
        qaTesterGrant: {
          upsert: () => {
            touched = true
            throw new Error("Unexpected write")
          },
        },
      }
      await expect(
        authorizeQaDomain(db as never, input, environment),
      ).rejects.toThrow()
      expect(touched).toBe(false)
    },
  )

  test("rejects an unmapped domain before writes", async () => {
    await expect(
      authorizeQaDomain(
        {} as never,
        { ...input, qaDomain: "lookalike.example.qa.test" },
        env,
      ),
    ).rejects.toThrow()
  })

  test("issues a bounded client authorization without requiring or returning a tester credential", async () => {
    let eventType = ""
    const db = {
      qaTesterGrant: {
        upsert: async ({
          create,
        }: { create: { expiresAt: Date; testerIdentity: string } }) => ({
          ...create,
          id: "grant",
          status: "ACTIVE",
          revokedAt: null,
        }),
      },
      qaClientAuthorization: {
        upsert: async ({ create }: { create: { expiresAt: Date } }) => ({
          id: "authorization",
          expiresAt: create.expiresAt,
        }),
      },
      qaAccessAuditEvent: {
        create: async ({ data }: { data: { eventType: string } }) => {
          eventType = data.eventType
        },
      },
    }
    const result = await authorizeQaDomain(db as never, input, env)
    expect(result.authorization.qaDomain).toBe("example.qa.test")
    expect(result.token.startsWith("qaa_")).toBe(true)
    expect(result.authorization.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 12 * 3_600_000,
    )
    expect(result).not.toHaveProperty("credential")
    expect(eventType).toBe("domain_entry")
  })

  test("does not reactivate a revoked domain-entry grant", async () => {
    const db = {
      qaTesterGrant: {
        upsert: async () => ({
          id: "revoked",
          status: "REVOKED",
          revokedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    }
    await expect(authorizeQaDomain(db as never, input, env)).rejects.toThrow()
  })
})
