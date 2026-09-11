import { describe, expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  applyDatabaseProfile,
  directDatabaseUrlForPrismaCli,
  loadProductionDatabaseUrl,
} from "./database-profile.mjs"

describe("database profile", () => {
  test("uses Neon's direct endpoint for Prisma CLI migration operations", () => {
    expect(
      directDatabaseUrlForPrismaCli(
        "postgresql://owner:secret@ep-development-pooler.eu-west-2.aws.neon.tech/ewatrade?sslmode=require&channel_binding=require",
      ),
    ).toBe(
      "postgresql://owner:secret@ep-development.eu-west-2.aws.neon.tech/ewatrade?sslmode=require",
    )
    expect(
      directDatabaseUrlForPrismaCli(
        "postgresql://owner:secret@development.example.com/ewatrade",
      ),
    ).toBe("postgresql://owner:secret@development.example.com/ewatrade")
  })

  test("uses the Neon development EWATRADE_DATABASE_URL without generating aliases", () => {
    const env = applyDatabaseProfile(
      {
        DATABASE_URL: "postgresql://legacy.example.com/ewatrade",
        EWATRADE_DATABASE_URL:
          "postgresql://owner:secret@ep-development.eu-west-2.aws.neon.tech/ewatrade",
      },
      "postgresql://production:secret@production.example.com/ewatrade",
    )

    expect(env.EWATRADE_DATABASE_URL).toBe(
      "postgresql://owner:secret@ep-development.eu-west-2.aws.neon.tech/ewatrade",
    )
    expect(env.DATABASE_URL).toBeUndefined()
    expect(env.DEV_PROFILE).toBe("local")
    expect(env.LOCAL_DATABASE_URL).toBeUndefined()
    expect(env.POSTGRES_URL).toBeUndefined()
  })

  test("requires EWATRADE_DATABASE_URL", () => {
    expect(() =>
      applyDatabaseProfile(
        {},
        "postgresql://production:secret@production.example.com/ewatrade",
      ),
    ).toThrow("Missing EWATRADE_DATABASE_URL")
  })

  test("rejects Docker or loopback PostgreSQL in local mode", () => {
    expect(() =>
      applyDatabaseProfile(
        {
          EWATRADE_DATABASE_URL:
            "postgresql://postgres:postgres@127.0.0.1:55436/ewatrade",
        },
        "postgresql://production:secret@production.example.com/ewatrade",
      ),
    ).toThrow("local mode requires the Neon development EWATRADE_DATABASE_URL")
  })

  test("allows a hosted Neon URL in local mode when it is not production", () => {
    const env = applyDatabaseProfile(
      {
        EWATRADE_DATABASE_URL:
          "postgresql://owner:secret@ep-development.eu-west-2.aws.neon.tech/ewatrade",
      },
      "postgresql://production.example.com/ewatrade",
    )

    expect(env.EWATRADE_DATABASE_URL).toBe(
      "postgresql://owner:secret@ep-development.eu-west-2.aws.neon.tech/ewatrade",
    )
    expect(env.DEV_PROFILE).toBe("local")
  })

  test("allows a hosted URL in dev mode when it is not production", () => {
    const env = applyDatabaseProfile(
      {
        DEV_PROFILE: "dev",
        EWATRADE_DATABASE_URL: "postgresql://development.example.com/ewatrade",
      },
      "postgresql://production.example.com/ewatrade",
    )

    expect(env.EWATRADE_DATABASE_URL).toBe(
      "postgresql://development.example.com/ewatrade",
    )
    expect(env.DEV_PROFILE).toBe("dev")
  })

  test("keeps an explicit dev profile non-production during production builds", () => {
    expect(() =>
      applyDatabaseProfile(
        {
          EWATRADE_DATABASE_URL: "postgresql://production.example.com/ewatrade",
          DEV_PROFILE: "dev",
          NODE_ENV: "production",
        },
        "postgresql://production.example.com/ewatrade",
      ),
    ).toThrow("dev mode refuses the production database")
  })

  test("rejects loopback PostgreSQL in every non-production profile", () => {
    for (const host of [
      "127.0.0.1",
      "127.0.0.2",
      "127.1",
      "[::1]",
      "[::ffff:127.0.0.1]",
      "host.docker.internal",
      "gateway.docker.internal",
      "postgres",
      "ewatrade-postgres",
    ]) {
      expect(() =>
        applyDatabaseProfile(
          {
            APP_ENV: "preview",
            EWATRADE_DATABASE_URL: `postgresql://postgres:postgres@${host}:55436/ewatrade`,
          },
          "postgresql://production.example.com/ewatrade",
        ),
      ).toThrow("preview mode refuses local Docker or loopback PostgreSQL")
    }
  })

  test("rejects the production database outside production mode", () => {
    expect(() =>
      applyDatabaseProfile(
        {
          EWATRADE_DATABASE_URL:
            "postgresql://development:new-secret@production.example.com./%65watrade?sslmode=require",
          DEV_PROFILE: "dev",
        },
        "postgres://production:old-secret@production.example.com:5432/ewatrade?sslmode=verify-full",
      ),
    ).toThrow("refuses the production database")
  })

  test("allows a distinct Supabase project on the same pooler endpoint", () => {
    const env = applyDatabaseProfile(
      {
        EWATRADE_DATABASE_URL:
          "postgresql://postgres.devref:dev-secret@aws-0-eu.pooler.supabase.com/postgres",
        DEV_PROFILE: "dev",
      },
      "postgresql://postgres.prodref:prod-secret@aws-0-eu.pooler.supabase.com/postgres",
    )

    expect(env.EWATRADE_DATABASE_URL).toContain("postgres.devref")
  })

  test("rejects one Supabase project across roles, hosts, and pooler modes", () => {
    expect(() =>
      applyDatabaseProfile(
        {
          EWATRADE_DATABASE_URL:
            "postgresql://migration_user.prod%72ef:dev-secret@aws-0-eu.pooler.supabase.com:6543/postgres",
          DEV_PROFILE: "dev",
        },
        "postgresql://postgres:prod-secret@db.prodref.supabase.co:5432/postgres",
      ),
    ).toThrow("refuses the production database")
  })

  test("rejects one Neon database across pooled and direct routes", () => {
    expect(() =>
      applyDatabaseProfile(
        {
          EWATRADE_DATABASE_URL:
            "postgresql://owner:dev-secret@ep-example-pooler.eu-west-2.aws.neon.tech/app",
        },
        "postgresql://owner:prod-secret@ep-example.eu-west-2.aws.neon.tech/app",
      ),
    ).toThrow("refuses the production database")
  })

  test("loads production identity only from the canonical production file", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ewatrade-production-env-"))
    writeFileSync(
      path.join(root, ".env.production"),
      "EWATRADE_DATABASE_URL=postgresql://production-base.example.com/app\n",
    )
    writeFileSync(
      path.join(root, ".env.production.local"),
      "EWATRADE_DATABASE_URL=postgresql://production-override.example.com/app\n",
    )

    expect(loadProductionDatabaseUrl(root)).toContain(
      "production-base.example.com/app",
    )
  })

  test("fails closed when production cannot be identified", () => {
    expect(() =>
      applyDatabaseProfile({
        EWATRADE_DATABASE_URL:
          "postgresql://owner:secret@ep-development.eu-west-2.aws.neon.tech/ewatrade",
      }),
    ).toThrow("production EWATRADE_DATABASE_URL is required")
  })
})
