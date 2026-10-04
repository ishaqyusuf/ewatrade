import { afterEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EWATRADE_TRIGGER_TARGETS } from "./release-trigger-target.mjs"
import {
  selectedTriggerDeployEnvironment,
  syncedTriggerJobEnvironment,
  triggerDeployCommand,
  triggerProjectForConfigEnv,
} from "./trigger-deploy-profile.mjs"

const preview = {
  APP_ENV: "preview",
  DEV_PROFILE: "preview",
  EWATRADE_ENV_MODE: "preview",
  DATABASE_PROFILE_VERIFIED: "1",
  EWATRADE_DATABASE_URL: "postgresql://fixture@ep-preview.neon.tech/neondb",
  TRIGGER_PROJECT_ID: EWATRADE_TRIGGER_TARGETS.preview.projectRef,
  TRIGGER_SECRET_KEY: "tr_prod_sk_FAKE_NOT_A_REAL_KEY_PREVIEW_FIXTURE",
  TRIGGER_PROFILE: "fixture-owner",
}
const production = {
  ...preview,
  APP_ENV: "production",
  DEV_PROFILE: "production",
  EWATRADE_ENV_MODE: "prod",
  EWATRADE_DATABASE_URL: "postgresql://fixture@ep-production.neon.tech/neondb",
  TRIGGER_PROJECT_ID: EWATRADE_TRIGGER_TARGETS.production.projectRef,
  TRIGGER_SECRET_KEY: "tr_prod_sk_FAKE_NOT_A_REAL_KEY_PRODUCTION_FIXTURE",
}

describe("Trigger jobs selected deployment profile", () => {
  test("binds Preview to its distinct project's prod worker and Production to original", () => {
    for (const env of [preview, production]) {
      const command = triggerDeployCommand(
        ["trigger", "deploy", "--dry-run"],
        env,
      )
      expect(command).toContain("--dry-run")
      expect(
        command.slice(command.indexOf("--env"), command.indexOf("--env") + 2),
      ).toEqual(["--env", "prod"])
      expect(
        command.slice(
          command.indexOf("--project-ref"),
          command.indexOf("--project-ref") + 2,
        ),
      ).toEqual(["--project-ref", env.TRIGGER_PROJECT_ID])
      expect(command).toContain("/dev/null")
      expect(command.slice(-2)).toEqual(["--profile", "fixture-owner"])
      expect(syncedTriggerJobEnvironment(env).APP_ENV).toBe(env.APP_ENV)
      expect(triggerProjectForConfigEnv(syncedTriggerJobEnvironment(env))).toBe(
        env.TRIGGER_PROJECT_ID,
      )
    }
  })

  test("refuses missing/mismatched profile, database verification and project", () => {
    for (const change of [
      { APP_ENV: "local" },
      { DEV_PROFILE: "production" },
      { EWATRADE_ENV_MODE: "prod" },
      { DATABASE_PROFILE_VERIFIED: "0" },
      { EWATRADE_DATABASE_URL: "" },
      { TRIGGER_PROJECT_ID: "" },
      { TRIGGER_PROJECT_ID: production.TRIGGER_PROJECT_ID },
      { TRIGGER_SECRET_KEY: "" },
      { TRIGGER_API_URL: "https://untrusted.example" },
      { TRIGGER_PROJECT_REF: production.TRIGGER_PROJECT_ID },
      { TRIGGER_PREVIEW_BRANCH: "any" },
      { TRIGGER_EXISTING_DEPLOYMENT_ID: "any" },
    ]) {
      expect(() =>
        triggerDeployCommand(["trigger", "deploy"], { ...preview, ...change }),
      ).toThrow()
    }
    expect(() =>
      triggerDeployCommand(["trigger", "deploy"], {
        ...production,
        TRIGGER_PROJECT_ID: preview.TRIGGER_PROJECT_ID,
      }),
    ).toThrow()
  })
  test("refuses dev, preview-branch and malformed keys before command construction or sync", () => {
    for (const key of [
      "tr_dev_sk_FAKE_NOT_A_REAL_KEY",
      "tr_preview_sk_FAKE_NOT_A_REAL_KEY",
      "tr_prod_pk_FAKE_NOT_A_REAL_KEY",
      "tr_prod_sk_",
      "unprefixed-fixture",
      "tr_prod_sk_FAKE value",
      "tr_prod_sk_FAKE/invalid",
      `tr_prod_sk_${"x".repeat(513)}`,
    ]) {
      const env = { ...preview, TRIGGER_SECRET_KEY: key }
      expect(() => triggerDeployCommand(["trigger", "deploy"], env)).toThrow(
        "hosted prod",
      )
      expect(() => syncedTriggerJobEnvironment(env)).toThrow("hosted prod")
    }
  })

  test("refuses aliases, equals forms, positional projects and profile/config/payload overrides", () => {
    for (const option of [
      "--project",
      "--project-ref",
      "--project-ref=any",
      "-pany",
      "-p",
      "--env",
      "--env=preview",
      "-eprod",
      "-e",
      "--profile",
      "--profile=any",
      "--config",
      "-cany",
      "--env-file=any",
      "--api-url=any",
      "-aany",
      "--branch",
      "-bany",
      "--from-bundle",
      "--skip-sync-env-vars",
      "other-project",
      "--",
      "--log-level=debug",
    ])
      expect(() =>
        triggerDeployCommand(["trigger", "deploy", option], preview),
      ).toThrow()
    expect(() =>
      triggerDeployCommand(["trigger", "--profile=any", "deploy"], preview),
    ).toThrow()
  })

  test("strips unsourced base/parent credentials instead of syncing them", () => {
    const result = selectedTriggerDeployEnvironment(
      {
        ...preview,
        OPENAI_API_KEY: "parent-secret",
        RESEND_API_KEY: "base-secret",
        TRIGGER_ACCESS_TOKEN: "parent-access",
      },
      preview,
      production,
    )
    expect(result.OPENAI_API_KEY).toBeUndefined()
    expect(result.RESEND_API_KEY).toBeUndefined()
    expect(result.TRIGGER_ACCESS_TOKEN).toBeUndefined()
    expect(syncedTriggerJobEnvironment(result).TRIGGER_SECRET_KEY).toBe(
      preview.TRIGGER_SECRET_KEY,
    )
    expect(() =>
      selectedTriggerDeployEnvironment(
        preview,
        { ...preview, TRIGGER_SECRET_KEY: "" },
        production,
      ),
    ).toThrow()
    expect(() =>
      selectedTriggerDeployEnvironment(
        preview,
        { ...preview, TRIGGER_PROJECT_ID: "" },
        production,
      ),
    ).toThrow()
  })

  test("refuses copied Production runtime credentials and endpoints without disclosing values", () => {
    for (const key of [
      "TRIGGER_SECRET_KEY",
      "RESEND_API_KEY",
      "BLOB_STORE_ID",
      "REDIS_URL",
      "SERVICE_WHATSAPP_WEBHOOK_URL",
      "COMMUNICATIONS_CREDENTIAL_ENCRYPTION_KEY",
    ]) {
      const secret = "fixture-private-value"
      let failure = ""
      try {
        selectedTriggerDeployEnvironment(
          preview,
          { ...preview, [key]: secret },
          { ...production, [key]: secret },
        )
      } catch (error) {
        failure = String(error)
      }
      expect(failure).toContain(key)
      expect(failure).not.toContain(secret)
    }
    expect(() =>
      selectedTriggerDeployEnvironment(
        preview,
        { ...preview, EWATRADE_DATABASE_URL: production.EWATRADE_DATABASE_URL },
        production,
      ),
    ).toThrow()
    expect(() =>
      selectedTriggerDeployEnvironment(
        { ...preview, EWATRADE_DATABASE_URL: production.EWATRADE_DATABASE_URL },
        { ...preview, EWATRADE_DATABASE_URL: production.EWATRADE_DATABASE_URL },
        production,
      ),
    ).toThrow()
  })
})

const fixtures: string[] = []
afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true })
})

function launchFixture(
  overrides: Record<string, string> = {},
  args = ["trigger", "deploy"],
  includePreviewKey = true,
  launcher: {
    wrongWorkspace?: boolean
    missingCli?: boolean
    runtimeKey?: string
  } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "ewatrade-trigger-profile-"))
  fixtures.push(root)
  const scripts = join(root, "scripts")
  const jobs = join(root, "packages/jobs")
  mkdirSync(scripts)
  mkdirSync(join(jobs, "node_modules/.bin"), { recursive: true })
  for (const file of [
    "with-trigger-profile.mjs",
    "environment-profile.mjs",
    "database-profile.mjs",
    "trigger-deploy-profile.mjs",
    "release-trigger-target.mjs",
  ]) {
    copyFileSync(join(import.meta.dir, file), join(scripts, file))
  }
  const envFile = (env: Record<string, string>) =>
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")
  writeFileSync(join(root, ".env.production"), envFile(production))
  writeFileSync(
    join(root, ".env.preview"),
    envFile({
      ...preview,
      TRIGGER_SECRET_KEY: includePreviewKey
        ? (launcher.runtimeKey ?? preview.TRIGGER_SECRET_KEY)
        : "",
    }),
  )
  const result = join(root, "child.json")
  const bin = join(jobs, "node_modules/.bin/trigger")
  writeFileSync(
    bin,
    `#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.FIXTURE_RESULT, JSON.stringify({ args: process.argv.slice(2), app: process.env.APP_ENV, project: process.env.TRIGGER_PROJECT_ID, inherited: process.env.OPENAI_API_KEY ?? null }));\n`,
  )
  chmodSync(bin, 0o755)
  if (launcher.missingCli) rmSync(bin)
  const child = spawnSync(
    "node",
    [join(scripts, "with-trigger-profile.mjs"), "--", ...args],
    {
      cwd: launcher.wrongWorkspace ? root : jobs,
      env: {
        PATH: process.env.PATH,
        ...preview,
        OPENAI_API_KEY: "unsourced-parent",
        FIXTURE_RESULT: result,
        ...overrides,
      },
      timeout: 5000,
      stdio: "pipe",
    },
  )
  return {
    code: child.status,
    output: child.stderr.toString(),
    invocation: existsSync(result)
      ? JSON.parse(readFileSync(result, "utf8"))
      : null,
  }
}

describe("actual Trigger wrapper child boundary", () => {
  test("spawns only fixed Preview target with inherited runtime secret removed", () => {
    const result = launchFixture()
    expect(result.code).toBe(0)
    expect(result.invocation.app).toBe("preview")
    expect(result.invocation.project).toBe(preview.TRIGGER_PROJECT_ID)
    expect(result.invocation.inherited).toBeNull()
    expect(result.invocation.args).toContain("prod")
    expect(result.invocation.args).toContain("/dev/null")
  })
  test("refuses absent selected credentials, bad profiles and override tricks before spawn", () => {
    const results = [
      launchFixture({}, undefined, false),
      launchFixture({ DEV_PROFILE: "production" }),
      launchFixture({}, [
        "trigger",
        "deploy",
        "--project-ref",
        production.TRIGGER_PROJECT_ID,
      ]),
      launchFixture({}, ["trigger", "--profile=other", "deploy"]),
    ]
    for (const result of results) {
      expect(result.code).not.toBe(0)
      expect(result.invocation).toBeNull()
      expect(result.output).not.toContain(preview.TRIGGER_SECRET_KEY)
    }
  })
  test("refuses another working directory and an absent workspace CLI", () => {
    for (const launcher of [{ wrongWorkspace: true }, { missingCli: true }]) {
      const result = launchFixture({}, undefined, true, launcher)
      expect(result.code).not.toBe(0)
      expect(result.invocation).toBeNull()
    }
  })
  test("refuses a wrong environment runtime key from the selected file before spawn", () => {
    for (const runtimeKey of [
      "tr_dev_sk_FAKE_NOT_A_REAL_KEY",
      "tr_preview_sk_FAKE_NOT_A_REAL_KEY",
      "tr_prod_sk_",
    ]) {
      const result = launchFixture({}, undefined, true, { runtimeKey })
      expect(result.code).toBe(1)
      expect(result.invocation).toBeNull()
    }
  })
})
