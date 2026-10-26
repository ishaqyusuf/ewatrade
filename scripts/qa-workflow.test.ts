import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  inspectDoctorConfig,
  inspectDoctorServices,
  parseDoctorArgs,
} from "./qa-doctor"
import {
  normalizeQuickPaths,
  parseQuickArgs,
  quickEnvironment,
  readQuickChanges,
  selectQuickPlan,
} from "./test-quick"

describe("fast workflow scope", () => {
  test("keeps documentation changes on the core suite", () => {
    const plan = selectQuickPlan(["docs/testing.md"])
    expect(plan.groups).toEqual(["core"])
    expect(plan.unknown).toEqual([])
  })
  test("shared changes broaden the smoke set across clients", () => {
    expect(selectQuickPlan(["packages/utils/src/currency.ts"]).groups).toEqual([
      "core",
      "domain",
      "web",
      "mobile",
    ])
    expect(selectQuickPlan(["bun.lock"]).groups).toHaveLength(4)
    const payments = selectQuickPlan(["packages/payments/src/payment-link.ts"])
    expect(payments.unknown).toEqual([])
    expect(payments.groups).toEqual(["core", "domain", "web", "mobile"])
  })
  test("reports unsupported source and deleted tests instead of inventing coverage", () => {
    expect(
      selectQuickPlan(["packages/unknown/src/payment.ts"]).unknown,
    ).toEqual(["packages/unknown/src/payment.ts"])
    // Explicit list remains stable even if the changed file no longer exists.
    expect(
      selectQuickPlan(["apps/mobile/src/lib/quantity.test.ts"]).tests,
    ).toContain("apps/mobile/src/lib/quantity.test.ts")
  })
  test("deduplicates paths and refuses traversal/flag injection", () => {
    expect(normalizeQuickPaths(["./package.json", "package.json"])).toEqual([
      "package.json",
    ])
    for (const file of [
      "../secret",
      "/tmp/source",
      "--preload=anything",
      "scripts/../x",
      "x\ny",
    ])
      expect(() => normalizeQuickPaths([file])).toThrow()
  })
  test("keeps local explicit scope separate from a comparison base", () => {
    expect(
      parseQuickArgs([
        "--files",
        "package.json",
        "scripts/qa-doctor.ts",
        "--plan",
      ]).files,
    ).toHaveLength(2)
    expect(() => parseQuickArgs(["--base", "HEAD", "--files", "x"])).toThrow()
    expect(() => parseQuickArgs(["--base", "--upload"])).toThrow()
  })
  test("does not forward credentials or live-test switches", () => {
    const env = quickEnvironment({
      PATH: "/bin",
      HOME: "/tmp",
      OPENAI_API_KEY: "private",
      RUN_LIVE: "1",
      DATABASE_URL: "private",
      EWATRADE_DATABASE_URL: "private",
    })
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.RUN_LIVE).toBeUndefined()
    expect(env.DATABASE_URL).toBeUndefined()
    expect(env.EWATRADE_DATABASE_URL).toContain("127.0.0.1:1")
    expect(env.PATH).toBe("/bin")
  })
  test("Git comparison includes committed, dirty and untracked paths; a missing base refuses", () => {
    const root = mkdtempSync(join(tmpdir(), "ewatrade-quick-"))
    const git = (...args: string[]) => {
      const result = spawnSync("git", args, { cwd: root, encoding: "utf8" })
      if (result.status !== 0) throw new Error(result.stderr)
      return result.stdout.trim()
    }
    try {
      git("init", "-q")
      git("config", "user.name", "QA fixture")
      git("config", "user.email", "qa@example.test")
      writeFileSync(join(root, "first.md"), "one")
      git("add", ".")
      git("commit", "-qm", "fixture")
      const base = git("rev-parse", "HEAD")
      writeFileSync(join(root, "second.md"), "two")
      git("add", ".")
      git("commit", "-qm", "second fixture")
      writeFileSync(join(root, "first.md"), "changed")
      writeFileSync(join(root, "third.md"), "untracked")
      expect(readQuickChanges(root, base)).toEqual([
        "first.md",
        "second.md",
        "third.md",
      ])
      expect(() => readQuickChanges(root, "absent-ref")).toThrow(
        "Cannot determine",
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("readiness boundaries", () => {
  test("requires explicit local Android selection and avoids devices in offline mode", () => {
    expect(parseDoctorArgs(["--device", "emulator-5556"]).device).toBe(
      "emulator-5556",
    )
    expect(() => parseDoctorArgs(["--profile", "production"])).toThrow()
    expect(() =>
      parseDoctorArgs(["--offline", "--device", "emulator-5556"]),
    ).toThrow()
    expect(() =>
      parseDoctorArgs(["--services", "https://example.com"]),
    ).toThrow()
  })
  test("missing or production-aliased profiles fail without leaking credentials", () => {
    const root = mkdtempSync(join(tmpdir(), "ewatrade-doctor-"))
    const secret = "postgresql://owner:private@ep-test.neon.tech/app"
    try {
      expect(inspectDoctorConfig(root, "local")[0].status).toBe("fail")
      writeFileSync(join(root, ".env.local"), `EWATRADE_DATABASE_URL=${secret}`)
      writeFileSync(
        join(root, ".env.production"),
        `EWATRADE_DATABASE_URL=${secret}`,
      )
      const checks = inspectDoctorConfig(root, "local")
      expect(checks[0].status).toBe("fail")
      expect(JSON.stringify(checks)).not.toContain("private")
      writeFileSync(
        join(root, ".env.production"),
        "EWATRADE_DATABASE_URL=postgresql://owner:private@ep-production.neon.tech/app",
      )
      mkdirSync(join(root, "node_modules/.bin"), { recursive: true })
      mkdirSync(join(root, "packages/db/generated/prisma"), { recursive: true })
      writeFileSync(join(root, "node_modules/.bin/tsc"), "")
      writeFileSync(join(root, "packages/db/generated/prisma/client.ts"), "")
      expect(
        inspectDoctorConfig(root, "local").every((c) => c.status === "pass"),
      ).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  test("probes fixed local hosts with redirects disabled and bounded requests", async () => {
    const seen: string[] = []
    const request = async (url: string, init?: RequestInit) => {
      const target = String(url)
      seen.push(target)
      expect(init?.redirect).toBe("manual")
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      if (target.includes("capability"))
        return Response.json({
          result: { data: { json: { available: true, environment: "local" } } },
        })
      if (target.endsWith("/health")) return Response.json({ status: "ok" })
      if (target.endsWith("/status"))
        return new Response("packager-status:running")
      return new Response(null, {
        status: 307,
        headers: { location: "/login" },
      })
    }
    const checks = await inspectDoctorServices(
      parseDoctorArgs(["--services", "api,dashboard,mobile", "--require-qa"]),
      { MOBILE_PORT: "3097" },
      request,
    )
    expect(checks.every((c) => c.status === "pass")).toBe(true)
    expect(seen).toContain("http://127.0.0.1:3097/status")
    expect(
      seen.every(
        (url) => url.includes(".localhost") || url.includes("127.0.0.1"),
      ),
    ).toBe(true)
  })
  test("rejects healthy HTTP with stale or production QA capability and never follows hosted login", async () => {
    const options = parseDoctorArgs([
      "--services",
      "api,dashboard",
      "--require-qa",
    ])
    const request = async (url: string) => {
      if (String(url).includes("capability"))
        return Response.json({
          result: {
            data: { json: { available: true, environment: "production" } },
          },
        })
      if (String(url).endsWith("/health"))
        return Response.json({ status: "ok" })
      return new Response(null, {
        status: 302,
        headers: { location: "https://vercel.com/login" },
      })
    }
    const checks = await inspectDoctorServices(options, {}, request)
    expect(
      checks
        .filter((c) => c.status === "fail")
        .map((c) => c.name)
        .sort(),
    ).toEqual(["QA capability", "dashboard"])
  })
  test("service errors remain sanitized and do not imply readiness", async () => {
    const request = async () => {
      throw new Error("private token in transport error")
    }
    const checks = await inspectDoctorServices(
      parseDoctorArgs(["--services", "api"]),
      {},
      request,
    )
    expect(checks.every((c) => c.status === "fail")).toBe(true)
    expect(JSON.stringify(checks)).not.toContain("private token")
  })
  test("disabled QA is explicit and fails when QA access is required", async () => {
    const request = async (url: string) =>
      String(url).includes("capability")
        ? Response.json({
            result: {
              data: { json: { available: false, category: "disabled" } },
            },
          })
        : Response.json({ status: "ok" })
    const optional = await inspectDoctorServices(
      parseDoctorArgs(["--services", "api"]),
      {},
      request,
    )
    expect(optional.find((c) => c.name === "QA capability")?.status).toBe(
      "skip",
    )
    const required = await inspectDoctorServices(
      parseDoctorArgs(["--services", "api", "--require-qa"]),
      {},
      request,
    )
    expect(required.find((c) => c.name === "QA capability")?.status).toBe(
      "fail",
    )
  })
})
