import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  discoverPortlessAliases,
  resolveDevWorkspaces,
} from "../../local-infra-kit/src/dev-workspaces"
import { parseEnvFile } from "../../local-infra-kit/src/env"
import {
  discoverKillPortTargets,
  filteredPortEnvNamesForDevWorkspaces,
} from "../../local-infra-kit/src/kill-ports"
import { commandForProfile, parseArgs } from "./dev"

const root = resolve(import.meta.dir, "..")
const env = parseEnvFile(readFileSync(resolve(root, ".env.example"), "utf8"))

describe("EwaTrade shared dev cleanup", () => {
  test("the requested stack clears API, websites, Metro and email ports", async () => {
    const options = parseArgs([
      "--f",
      "dashboard",
      "marketing",
      "jobs",
      "email",
      "mobile",
      "api",
    ])
    const command = commandForProfile(options.profile, options.filters)
    const args = command.slice(command.indexOf("--") + 1)
    const workspaces = await resolveDevWorkspaces(args, async (lookup) => {
      expect(lookup.slice(0, 5)).toEqual([
        "bunx",
        "turbo",
        "ls",
        "--output",
        "json",
      ])
      expect(lookup.slice(5)).toEqual(args)
      return {
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({
          packages: {
            items: [
              { name: "@ewatrade/api", path: "apps/api" },
              { name: "@ewatrade/dashboard", path: "apps/dashboard" },
              { name: "@ewatrade/marketing", path: "apps/marketing" },
              { name: "@ewatrade/mobile", path: "apps/mobile" },
              { name: "@ewatrade/jobs", path: "packages/jobs" },
              { name: "@ewatrade/email", path: "packages/email" },
            ],
          },
        }),
      }
    })
    const targets = discoverKillPortTargets(
      env,
      filteredPortEnvNamesForDevWorkspaces(args, workspaces),
    )
    expect(targets.map(({ port }) => port)).toEqual([
      3002, 3003, 3092, 3094, 3095, 3096,
    ])
    expect(discoverPortlessAliases(root, workspaces)).toEqual([
      "ewatrade",
      "ewatrade-api",
      "ewatrade-dashboard",
    ])
  })

  test("API-only cleanup leaves other applications and the proxy alone", () => {
    expect(
      discoverKillPortTargets(
        {
          ...env,
          PORTLESS_APP_PORT: "3095",
          PORTLESS_PORT: "443",
          DB_PORT: "5432",
        },
        filteredPortEnvNamesForDevWorkspaces(
          ["--filter", "@ewatrade/api"],
          [{ name: "@ewatrade/api", path: "apps/api" }],
        ),
      ),
    ).toEqual([{ envNames: ["API_PORT"], port: 3095 }])
  })
})
