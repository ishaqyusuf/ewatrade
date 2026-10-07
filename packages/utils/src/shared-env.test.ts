import { describe, expect, test } from "bun:test"
import { EWATRADE_SHARED_ENV_NAMES, applyEwatradeSharedEnv } from "./shared-env"

describe("EwaTrade shared env aliases", () => {
  test("fills plain names from prefixed shared values", () => {
    const env: Record<string, string | undefined> = {
      EWATRADE_BETTER_AUTH_SECRET: "shared-secret",
      EWATRADE_EMAIL_FROM: " EwaTrade <noreply@ewatrade.com> ",
    }
    expect(applyEwatradeSharedEnv(env)).toEqual([
      "BETTER_AUTH_SECRET",
      "EMAIL_FROM",
    ])
    expect(env.BETTER_AUTH_SECRET).toBe("shared-secret")
    expect(env.EMAIL_FROM).toBe("EwaTrade <noreply@ewatrade.com>")
  })

  test("a plain value always wins and blanks are ignored", () => {
    const env: Record<string, string | undefined> = {
      RESEND_API_KEY: "project-value",
      EWATRADE_RESEND_API_KEY: "shared-value",
      EWATRADE_EMAIL_REPLY_TO: "   ",
    }
    expect(applyEwatradeSharedEnv(env)).toEqual([])
    expect(env.RESEND_API_KEY).toBe("project-value")
    expect(env.EMAIL_REPLY_TO).toBeUndefined()
  })

  test("unrelated prefixed names are never copied", () => {
    const env: Record<string, string | undefined> = {
      EWATRADE_DATABASE_URL: "postgres://fixture",
    }
    applyEwatradeSharedEnv(env)
    expect(env.DATABASE_URL).toBeUndefined()
    expect(EWATRADE_SHARED_ENV_NAMES).not.toContain("DATABASE_URL")
  })
})
