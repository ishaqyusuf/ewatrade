// @ts-expect-error Bun test types are not included by the root TypeScript config.
import { describe, expect, test } from "bun:test"
import { commandForProfile, parseArgs } from "./dev"

describe("dev script profile router", () => {
  test("defaults to local", () => {
    expect(parseArgs([])).toEqual({ profile: "local" })
    expect(commandForProfile("local")).toEqual([
      "node",
      "./scripts/with-workspace-env.mjs",
      "DEV_PROFILE=local",
      "bun",
      "scripts/dev-run.ts",
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
      "bun",
      "scripts/dev-run.ts",
    ])
  })

  test("supports preview", () => {
    expect(parseArgs(["--preview"])).toEqual({ profile: "preview" })
    expect(commandForProfile("preview")).toEqual([
      "node",
      "./scripts/with-workspace-env.mjs",
      "APP_ENV=preview",
      "DEV_PROFILE=preview",
      "bun",
      "scripts/dev-run.ts",
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
      "bun",
      "scripts/dev-run.ts",
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
