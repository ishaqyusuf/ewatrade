import { describe, expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  envFileForProfile,
  environmentProfileForEnv,
  loadRootEnvironment,
} from "./environment-profile.mjs"

describe("environment profile", () => {
  test("maps each profile to one canonical file", () => {
    expect(envFileForProfile("local")).toBe(".env.local")
    expect(envFileForProfile("dev")).toBe(".env.dev")
    expect(envFileForProfile("preview")).toBe(".env.preview")
    expect(envFileForProfile("production")).toBe(".env.production")
  })

  test("normalizes command-facing profile names", () => {
    expect(environmentProfileForEnv({ DEV_PROFILE: "development" })).toBe("dev")
    expect(environmentProfileForEnv({ DEV_PROFILE: "prod" })).toBe("production")
  })

  test("loads only the base file and selected profile file", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ewatrade-env-profile-"))
    writeFileSync(
      path.join(root, ".env"),
      "SHARED_VALUE=base\nPROFILE_VALUE=base\nEWATRADE_DATABASE_URL=postgresql://base.example/app\n",
    )
    writeFileSync(
      path.join(root, ".env.dev"),
      "PROFILE_VALUE=dev\nEWATRADE_DATABASE_URL=postgresql://dev.example/app\n",
    )

    for (const ignoredFile of [
      ".env.development",
      ".env.development.local",
      ".env.prod",
      ".env.production.local",
      ".env.local",
      ".env.preview",
    ]) {
      writeFileSync(
        path.join(root, ignoredFile),
        `PROFILE_VALUE=${ignoredFile}\nEWATRADE_DATABASE_URL=postgresql://ignored.example/app\n`,
      )
    }

    const loaded = loadRootEnvironment(root, { DEV_PROFILE: "dev" })

    expect(loaded.profile).toBe("dev")
    expect(loaded.profileFile).toBe(".env.dev")
    expect(loaded.env.SHARED_VALUE).toBe("base")
    expect(loaded.env.PROFILE_VALUE).toBe("dev")
    expect(loaded.env.EWATRADE_DATABASE_URL).toBe("postgresql://dev.example/app")
  })

  test("does not treat the base EWATRADE_DATABASE_URL as profile-owned", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ewatrade-env-profile-"))
    writeFileSync(
      path.join(root, ".env"),
      "EWATRADE_DATABASE_URL=postgresql://base.example/app\n",
    )
    writeFileSync(path.join(root, ".env.preview"), "PREVIEW_ONLY=yes\n")

    const loaded = loadRootEnvironment(root, { DEV_PROFILE: "preview" })

    expect(loaded.env.EWATRADE_DATABASE_URL).toBeUndefined()
    expect(loaded.profileEnv.EWATRADE_DATABASE_URL).toBeUndefined()
  })

  test("preserves an explicitly injected database URL", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ewatrade-env-profile-"))
    writeFileSync(path.join(root, ".env"), "SHARED_VALUE=base\n")

    const loaded = loadRootEnvironment(root, {
      EWATRADE_DATABASE_URL: "postgresql://injected.example/app",
      DEV_PROFILE: "production",
    })

    expect(loaded.env.EWATRADE_DATABASE_URL).toBe(
      "postgresql://injected.example/app",
    )
    expect(loaded.profileExists).toBe(false)
  })

  test("does not inject a database URL into an existing incomplete profile", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ewatrade-env-profile-"))
    writeFileSync(path.join(root, ".env.preview"), "PREVIEW_ONLY=yes\n")

    const loaded = loadRootEnvironment(root, {
      EWATRADE_DATABASE_URL: "postgresql://injected.example/app",
      DEV_PROFILE: "preview",
    })

    expect(loaded.env.EWATRADE_DATABASE_URL).toBeUndefined()
    expect(loaded.profileExists).toBe(true)
  })

  test("scrubs the legacy DATABASE_URL from files and process input", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ewatrade-env-profile-"))
    writeFileSync(
      path.join(root, ".env.local"),
      "DATABASE_URL=postgresql://legacy-file.example/app\n",
    )

    const loaded = loadRootEnvironment(root, {
      DATABASE_URL: "postgresql://legacy-process.example/app",
      DEV_PROFILE: "local",
    })

    expect(loaded.env.DATABASE_URL).toBeUndefined()
    expect(loaded.env.EWATRADE_DATABASE_URL).toBeUndefined()
  })

  test("rejects unknown profiles", () => {
    expect(() => environmentProfileForEnv({ DEV_PROFILE: "staging" })).toThrow(
      "Unknown environment profile",
    )
  })
})
