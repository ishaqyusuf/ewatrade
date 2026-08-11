import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")

function scripts(path: string): Record<string, string> {
  return (
    (
      JSON.parse(readFileSync(resolve(root, path), "utf8")) as {
        scripts?: Record<string, string>
      }
    ).scripts ?? {}
  )
}

describe("shared database command contract", () => {
  test("exposes one mode-aware root command per database action", () => {
    const rootScripts = scripts("package.json")
    const prefix = "bun --env-file=/dev/null ../local-infra-kit/bin/db.ts"

    for (const action of ["generate", "migrate", "pull", "push", "studio"]) {
      expect(rootScripts[`db:${action}`]).toBe(
        `${prefix} ${action} --profile ewatrade`,
      )
    }
    expect(rootScripts["db:sync"]).toBe(
      "bun --env-file=/dev/null ../local-infra-kit/bin/db-sync.ts --profile ewatrade",
    )
    expect(
      Object.keys(rootScripts).filter((name) =>
        /^db:(generate|migrate|pull|push|studio):/.test(name),
      ),
    ).toEqual([])
  })

  test("keeps only raw package commands", () => {
    const packageScripts = scripts("packages/db/package.json")

    expect(packageScripts["db:generate"]).toBe("prisma generate")
    expect(packageScripts["db:migrate"]).toBe("prisma migrate dev")
    expect(packageScripts["db:migrate:deploy"]).toBe("prisma migrate deploy")
    expect(packageScripts["db:pull"]).toBe("prisma db pull")
    expect(packageScripts["db:push"]).toBe("prisma db push")
    expect(packageScripts["db:studio"]).toBe("prisma studio")
  })

  test("has no repository-local database profile router", () => {
    expect(existsSync(resolve(root, "scripts/db-command.ts"))).toBe(false)
    expect(existsSync(resolve(root, "scripts/db-push.ts"))).toBe(false)
  })

  test("routes API deployment migrations through the guarded production command", () => {
    const deploySource = readFileSync(
      resolve(root, "scripts/deploy-api.mjs"),
      "utf8",
    )

    expect(deploySource).toContain(
      'run("bun", ["run", "db:migrate", "--prod"], { env })',
    )
    expect(deploySource).not.toContain("db:migrate:deploy")
  })
})
