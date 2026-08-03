import { describe, expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  applyDatabaseProfile,
  loadProductionDatabaseUrl,
} from "./database-profile.mjs"

describe("database profile", () => {
  test("uses local DATABASE_URL without generating aliases", () => {
    const env = applyDatabaseProfile(
      {
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55436/ewatrade",
      },
      "postgresql://production:secret@production.example.com/ewatrade",
    )

    expect(env.DATABASE_URL).toBe(
      "postgresql://postgres:postgres@127.0.0.1:55436/ewatrade",
    )
    expect(env.DEV_PROFILE).toBe("local")
    expect(env.LOCAL_DATABASE_URL).toBeUndefined()
    expect(env.POSTGRES_URL).toBeUndefined()
  })

  test("requires DATABASE_URL", () => {
    expect(() =>
      applyDatabaseProfile(
        {},
        "postgresql://production:secret@production.example.com/ewatrade",
      ),
    ).toThrow("Missing DATABASE_URL")
  })

  test("allows a hosted URL in local mode when it is not production", () => {
    const env = applyDatabaseProfile(
      {
        DATABASE_URL: "postgresql://development.example.com/ewatrade",
      },
      "postgresql://production.example.com/ewatrade",
    )

    expect(env.DATABASE_URL).toBe(
      "postgresql://development.example.com/ewatrade",
    )
    expect(env.DEV_PROFILE).toBe("local")
  })

  test("allows a local URL in preview mode when it is not production", () => {
    const env = applyDatabaseProfile(
      {
        APP_ENV: "preview",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55436/ewatrade",
      },
      "postgresql://production.example.com/ewatrade",
    )

    expect(env.DATABASE_URL).toContain("127.0.0.1:55436/ewatrade")
    expect(env.DEV_PROFILE).toBe("preview")
  })

  test("rejects the production database outside production mode", () => {
    expect(() =>
      applyDatabaseProfile(
        {
          DATABASE_URL:
            "postgresql://development:new-secret@production.example.com./%65watrade?sslmode=require",
        },
        "postgres://production:old-secret@production.example.com:5432/ewatrade?sslmode=verify-full",
      ),
    ).toThrow("refuses the production database")
  })

  test("allows a distinct Supabase project on the same pooler endpoint", () => {
    const env = applyDatabaseProfile(
      {
        DATABASE_URL:
          "postgresql://postgres.devref:dev-secret@aws-0-eu.pooler.supabase.com/postgres",
      },
      "postgresql://postgres.prodref:prod-secret@aws-0-eu.pooler.supabase.com/postgres",
    )

    expect(env.DATABASE_URL).toContain("postgres.devref")
  })

  test("rejects one Supabase project across roles, hosts, and pooler modes", () => {
    expect(() =>
      applyDatabaseProfile(
        {
          DATABASE_URL:
            "postgresql://migration_user.prod%72ef:dev-secret@aws-0-eu.pooler.supabase.com:6543/postgres",
        },
        "postgresql://postgres:prod-secret@db.prodref.supabase.co:5432/postgres",
      ),
    ).toThrow("refuses the production database")
  })

  test("rejects one Neon database across pooled and direct routes", () => {
    expect(() =>
      applyDatabaseProfile(
        {
          DATABASE_URL:
            "postgresql://owner:dev-secret@ep-example-pooler.eu-west-2.aws.neon.tech/app",
        },
        "postgresql://owner:prod-secret@ep-example.eu-west-2.aws.neon.tech/app",
      ),
    ).toThrow("refuses the production database")
  })

  test("loads one canonical production URL with local override precedence", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ewatrade-production-env-"))
    writeFileSync(
      path.join(root, ".env.production"),
      "DATABASE_URL=postgresql://production-base.example.com/app\n",
    )
    writeFileSync(
      path.join(root, ".env.production.local"),
      "DATABASE_URL=postgresql://production-override.example.com/app\n",
    )

    expect(loadProductionDatabaseUrl(root)).toContain(
      "production-override.example.com/app",
    )
  })

  test("fails closed when production cannot be identified", () => {
    expect(() =>
      applyDatabaseProfile({
        DATABASE_URL: "postgresql://development.example.com/ewatrade",
      }),
    ).toThrow("production DATABASE_URL is required")
  })
})
