// @ts-expect-error Bun test types are not included by the root TypeScript config.
import { describe, expect, test } from "bun:test"
import { assertSupportedDevRuntime, commandForProfile, parseArgs } from "./dev"

describe("dev script profile router", () => {
  test("refuses the receipt-stalling runtime before starting dev services", () => {
    expect(() => assertSupportedDevRuntime("1.3.0")).toThrow("Bun 1.3.9")
    expect(() => assertSupportedDevRuntime("1.3.8")).toThrow("Bun 1.3.9")
    expect(() => assertSupportedDevRuntime("1.3.9")).not.toThrow()
    expect(() => assertSupportedDevRuntime("1.3.10")).not.toThrow()
    expect(() => assertSupportedDevRuntime("1.4.0")).not.toThrow()
  })
  test("defaults to local", () => {
    expect(parseArgs([])).toEqual({ profile: "local" })
    expect(commandForProfile("local")).toEqual([
      "node",
      "./scripts/with-workspace-env.mjs",
      "DEV_PROFILE=local",
      "EWATRADE_ENV_MODE=local",
      "bun",
      "--env-file=/dev/null",
      "../local-infra-kit/bin/dev-run.ts",
      "--profile",
      "ewatrade",
      "--",
    ])
  })

  test("rejects legacy remote flags", () => {
    expect(() => parseArgs(["--remote"])).toThrow("Unknown dev flag")
    expect(() => parseArgs(["--remote-dev"])).toThrow("Unknown dev flag")
  })

  test("supports hosted development", () => {
    expect(parseArgs(["--dev"])).toEqual({ profile: "dev" })
    expect(commandForProfile("dev")).toEqual([
      "node",
      "./scripts/with-workspace-env.mjs",
      "APP_ENV=dev",
      "DEV_PROFILE=dev",
      "EWATRADE_ENV_MODE=dev",
      "bun",
      "--env-file=/dev/null",
      "../local-infra-kit/bin/dev-run.ts",
      "--profile",
      "ewatrade",
      "--",
    ])
  })

  test("supports preview", () => {
    expect(parseArgs(["--preview"])).toEqual({ profile: "preview" })
    expect(commandForProfile("preview")).toEqual([
      "node",
      "./scripts/with-workspace-env.mjs",
      "APP_ENV=preview",
      "DEV_PROFILE=preview",
      "EWATRADE_ENV_MODE=preview",
      "bun",
      "--env-file=/dev/null",
      "../local-infra-kit/bin/dev-run.ts",
      "--profile",
      "ewatrade",
      "--",
    ])
  })

  test("supports prod", () => {
    expect(parseArgs(["--prod"])).toEqual({ profile: "prod" })
    expect(commandForProfile("prod")).toEqual([
      "node",
      "./scripts/with-workspace-env.mjs",
      "APP_ENV=production",
      "REQUIRE_PROD_DATABASE_URL=1",
      "turbo",
      "dev",
      "--parallel",
    ])
  })

  test("rejects conflicting profile flags", () => {
    expect(() => parseArgs(["--local", "--preview"])).toThrow(
      "Conflicting dev flags",
    )
  })

  test("passes arguments after -- to the shared Turbo launcher", () => {
    const options = parseArgs(["--preview", "-f", "api", "--", "--ui=stream"])
    expect(options.passthroughArgs).toEqual(["--ui=stream"])
    expect(
      commandForProfile(
        options.profile,
        options.filters,
        options.passthroughArgs,
      ).slice(-3),
    ).toEqual(["--filter", "@ewatrade/api", "--ui=stream"])
  })

  test("rejects GND-only Redis flags instead of silently ignoring them", () => {
    expect(() => parseArgs(["--redis-local"])).toThrow("does not support Redis")
  })

  test("passes exact monorepo package filters through", () => {
    const options = parseArgs([
      "--filter",
      "@ewatrade/marketing",
      "@ewatrade/dashboard",
      "@ewatrade/jobs",
    ])

    expect(options).toEqual({
      profile: "local",
      filters: {
        targets: [
          "@ewatrade/marketing",
          "@ewatrade/dashboard",
          "@ewatrade/jobs",
        ],
      },
    })
    expect(commandForProfile(options.profile, options.filters)).toEqual([
      "node",
      "./scripts/with-workspace-env.mjs",
      "DEV_PROFILE=local",
      "EWATRADE_ENV_MODE=local",
      "bun",
      "--env-file=/dev/null",
      "../local-infra-kit/bin/dev-run.ts",
      "--profile",
      "ewatrade",
      "--",
      "--filter",
      "@ewatrade/marketing",
      "--filter",
      "@ewatrade/dashboard",
      "--filter",
      "@ewatrade/jobs",
    ])
  })

  test("supports suffix exclusion syntax for monorepo filters", () => {
    const options = parseArgs([
      "--preview",
      "--filter",
      "@ewatrade/api!",
      "@ewatrade/marketing!",
    ])

    expect(options).toEqual({
      profile: "preview",
      filters: {
        targets: ["!@ewatrade/api", "!@ewatrade/marketing"],
      },
    })
    expect(commandForProfile(options.profile, options.filters)).toContain(
      "!@ewatrade/api",
    )
    expect(commandForProfile(options.profile, options.filters)).toContain(
      "!@ewatrade/marketing",
    )
  })

  test("supports bare package-name shorthand for exact workspace packages", () => {
    const options = parseArgs(["--filter", "api", "marketing!", "mobile"])

    expect(options).toEqual({
      profile: "local",
      filters: {
        targets: ["@ewatrade/api", "!@ewatrade/marketing", "@ewatrade/mobile"],
      },
    })
  })

  test("supports filter flag aliases", () => {
    const expectedTargets = ["@ewatrade/api", "!@ewatrade/marketing"]

    for (const filterFlag of ["--filter", "--f", "-f", "-filter"]) {
      expect(parseArgs([filterFlag, "api", "marketing!"])).toEqual({
        profile: "local",
        filters: {
          targets: expectedTargets,
        },
      })
    }

    expect(
      parseArgs(["--filter", "api", "-f", "jobs", "--f", "mobile!"]),
    ).toEqual({
      profile: "local",
      filters: {
        targets: ["@ewatrade/api", "@ewatrade/jobs", "!@ewatrade/mobile"],
      },
    })
  })

  test("includes the API when the actual mobile dev stack omits it", () => {
    const options = parseArgs([
      "--f",
      "dashboard",
      "marketing",
      "jobs",
      "email",
      "mobile",
    ])

    expect(options.filters?.targets).toEqual([
      "@ewatrade/dashboard",
      "@ewatrade/marketing",
      "@ewatrade/jobs",
      "@ewatrade/email",
      "@ewatrade/mobile",
      "@ewatrade/api",
    ])
    expect(
      commandForProfile(options.profile, options.filters).slice(-2),
    ).toEqual(["--filter", "@ewatrade/api"])
  })

  test("does not duplicate an explicitly selected API", () => {
    expect(parseArgs(["-f", "mobile", "api"]).filters?.targets).toEqual([
      "@ewatrade/mobile",
      "@ewatrade/api",
    ])
  })

  test("respects an explicit API exclusion for mobile UI-only work", () => {
    expect(parseArgs(["-f", "mobile", "api!"]).filters?.targets).toEqual([
      "@ewatrade/mobile",
      "!@ewatrade/api",
    ])
    expect(parseArgs(["-f", "mobile!"]).filters?.targets).toEqual([
      "!@ewatrade/mobile",
    ])
  })

  test("passes complex turbo selectors through without package validation", () => {
    expect(
      parseArgs([
        "--filter",
        "@ewatrade/marketing...",
        "...@ewatrade/dashboard",
        "@ewatrade/*",
        "{apps/*}",
        "[main]",
      ]),
    ).toEqual({
      profile: "local",
      filters: {
        targets: [
          "@ewatrade/marketing...",
          "...@ewatrade/dashboard",
          "@ewatrade/*",
          "{apps/*}",
          "[main]",
        ],
      },
    })
  })

  test("lists valid packages when a filter target is missing", () => {
    expect(() =>
      parseArgs(["--filter", "marketing", "@ewatrade/missing"]),
    ).toThrow("Unknown dev filter package: @ewatrade/missing")
  })

  test("rejects unknown flags with profile guidance", () => {
    expect(() => parseArgs(["--staging"])).toThrow(
      "Use --local, --dev, --preview, --prod",
    )
  })
})
