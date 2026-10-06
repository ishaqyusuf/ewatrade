import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { inspectPerformanceProfiles } from "./performance-profile-inventory.mjs"

function inspect(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "ewatrade-perf-profiles-"))
  try {
    for (const [name, contents] of Object.entries(files)) {
      writeFileSync(path.join(root, name), contents)
    }
    return inspectPerformanceProfiles(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const production = "postgresql://owner:PROD_SECRET@ep-prod.aws.neon.tech/app"
const local =
  "postgresql://owner:LOCAL_SECRET@ep-local-pooler.aws.neon.tech/app"

describe("performance profile inventory", () => {
  test("detects pooled/direct aliases and different roles on the same database", () => {
    const report = inspect({
      ".env.local": `EWATRADE_DATABASE_URL=${local}`,
      ".env.preview":
        "EWATRADE_DATABASE_URL=postgres://other:PREVIEW_SECRET@ep-local.aws.neon.tech:5432/app",
      ".env.production": `EWATRADE_DATABASE_URL=${production}`,
    })
    expect(report.sharedTargets).toEqual([
      { targetGroup: "target-1", profiles: ["local", "preview"] },
    ])
    expect(
      report.profiles
        .filter((p) => p.status === "configured")
        .every((p) => p.guard === "passed"),
    ).toBe(true)
    const serialized = JSON.stringify(report)
    for (const secret of [
      "SECRET",
      "postgres://",
      "postgresql://",
      "owner",
      "ep-local",
      "ep-prod",
    ]) {
      expect(serialized).not.toContain(secret)
    }
    expect(report.deployedTargetsVerified).toBe(false)
  })

  test("detects production collisions using the existing profile guard", () => {
    const report = inspect({
      ".env.local": `EWATRADE_DATABASE_URL=${production}`,
      ".env.production": `EWATRADE_DATABASE_URL=${production}`,
    })
    expect(report.profiles[0].guard).toBe("rejected")
    expect(report.sharedTargets[0].profiles).toEqual(["local", "production"])
  })

  test("keeps databases on the same endpoint distinct", () => {
    const report = inspect({
      ".env.local": `EWATRADE_DATABASE_URL=${local}`,
      ".env.preview": `EWATRADE_DATABASE_URL=${local}_preview`,
      ".env.production": `EWATRADE_DATABASE_URL=${production}`,
    })
    expect(report.sharedTargets).toEqual([])
  })

  test("reports missing and malformed profile values without base-env fallback or secret echo", () => {
    const report = inspect({
      ".env": `EWATRADE_DATABASE_URL=${production}`,
      ".env.local": "EWATRADE_DATABASE_URL=INVALID_SECRET",
      ".env.preview": "OTHER_KEY=unused",
    })
    expect(report.profiles.map((p) => p.status)).toEqual([
      "invalid-url",
      "missing-file",
      "missing-url",
      "missing-file",
    ])
    expect(JSON.stringify(report)).not.toContain("SECRET")
  })

  test("refuses local loopback and reports absent production identity", () => {
    const report = inspect({
      ".env.local":
        "EWATRADE_DATABASE_URL=postgresql://owner:secret@localhost/app",
      ".env.preview": `EWATRADE_DATABASE_URL=${local}`,
    })
    expect(report.profiles[0].guard).toBe("rejected")
    expect(report.profiles[2].guard).toBe("rejected")
  })
})
