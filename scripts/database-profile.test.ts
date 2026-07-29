import { describe, expect, test } from "bun:test"
import { applyDatabaseProfile } from "./database-profile.mjs"

describe("database profile", () => {
  test("uses local DATABASE_URL without generating aliases", () => {
    const env = applyDatabaseProfile({
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55436/ewatrade",
    })

    expect(env.DATABASE_URL).toBe(
      "postgresql://postgres:postgres@127.0.0.1:55436/ewatrade",
    )
    expect(env.DEV_PROFILE).toBe("local")
    expect(env.LOCAL_DATABASE_URL).toBeUndefined()
    expect(env.POSTGRES_URL).toBeUndefined()
  })

  test("requires DATABASE_URL", () => {
    expect(() => applyDatabaseProfile({})).toThrow("Missing DATABASE_URL")
  })

  test("rejects a hosted URL in local mode", () => {
    expect(() =>
      applyDatabaseProfile({
        DATABASE_URL: "postgresql://remote.example.com/ewatrade",
      }),
    ).toThrow("Local mode requires a local DATABASE_URL")
  })

  test("rejects a local URL in remote mode", () => {
    expect(() =>
      applyDatabaseProfile({
        APP_ENV: "remote-dev",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55436/ewatrade",
      }),
    ).toThrow("remote-dev mode refuses a local DATABASE_URL")
  })
})
