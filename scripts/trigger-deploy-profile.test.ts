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
  test("schedule mode is selected-file owned, synchronized explicitly and reset to standard when omitted", () => {
    const selected = { ...production, JOB_SCHEDULE_MODE: "prelaunch" }
    const result = selectedTriggerDeployEnvironment(
      production,
      selected,
      production,
    )
    expect(syncedTriggerJobEnvironment(result).JOB_SCHEDULE_MODE).toBe(
      "prelaunch",
    )
    const reset = selectedTriggerDeployEnvironment(
      { ...production, JOB_SCHEDULE_MODE: "prelaunch" },
      production,
      production,
    )
    expect(syncedTriggerJobEnvironment(reset).JOB_SCHEDULE_MODE).toBe(
      "standard",
    )
    expect(() =>
      syncedTriggerJobEnvironment({
        ...production,
        JOB_SCHEDULE_MODE: "pre-launch",
      }),
    ).toThrow("JOB_SCHEDULE_MODE")
    const previewResult = selectedTriggerDeployEnvironment(
      { ...preview, JOB_SCHEDULE_MODE: "prelaunch" },
      preview,
      production,
    )
    expect(syncedTriggerJobEnvironment(previewResult).JOB_SCHEDULE_MODE).toBe(
      "standard",
    )
  })
  test("pins migrated Preview ownership and refuses retired or Production project refs", () => {
    expect(EWATRADE_TRIGGER_TARGETS.organizationId).toBe(
      "cmv56r6n3001vmw0i4y43rqtv",
    )
    expect(EWATRADE_TRIGGER_TARGETS.organizationSlug).toBe("zeroes-one-9521")
    expect(EWATRADE_TRIGGER_TARGETS.production).toEqual({
      projectRef: "proj_ahtovhgtjjkctpakuwjz",
      projectSlug: "ewatrade-kERp",
      providerEnvironment: "prod",
    })
    expect(EWATRADE_TRIGGER_TARGETS.preview).toEqual({
      projectRef: "proj_qxavabbrflnewutcortw",
      projectSlug: "ewatrade-preview-fXYm",
      providerEnvironment: "prod",
    })
    expect(triggerProjectForConfigEnv({ APP_ENV: "preview" })).toBe(
      preview.TRIGGER_PROJECT_ID,
    )
    for (const project of [
      "proj_hymzhteicvpixaksoyqk",
      production.TRIGGER_PROJECT_ID,
    ]) {
      expect(() =>
        triggerDeployCommand(["trigger", "deploy"], {
          ...preview,
          TRIGGER_PROJECT_ID: project,
        }),
      ).toThrow("does not match the selected application environment")
    }
  })

  describe("assistant machine environment isolation", () => {
    const previewMachine = {
      API_URL: "https://fixture-preview-api.example",
      INTERNAL_API_KEY: "fixture-preview-machine-key",
      ASSISTANT_WHATSAPP_ENABLED: "false",
    }
    const productionMachine = {
      API_URL: "https://fixture-production-api.example",
      INTERNAL_API_KEY: "fixture-production-machine-key",
      ASSISTANT_WHATSAPP_ENABLED: "false",
    }

    test("syncs only the explicitly selected Preview endpoint, machine key and disabled gate", () => {
      const result = selectedTriggerDeployEnvironment(
        { ...preview, ...productionMachine },
        { ...preview, ...previewMachine },
        { ...production, ...productionMachine },
      )
      const synced = syncedTriggerJobEnvironment(result)
      expect(synced.API_URL).toBe(previewMachine.API_URL)
      expect(synced.INTERNAL_API_KEY).toBe(previewMachine.INTERNAL_API_KEY)
      expect(synced.ASSISTANT_WHATSAPP_ENABLED).toBe("false")
      expect(Object.values(synced)).not.toContain(
        productionMachine.INTERNAL_API_KEY,
      )
    })

    test("syncs all seven disabled gates and only the selected protected Preview credentials", () => {
      const host = "ewatrade-api-fixture123-ishaqyusufs-projects.vercel.app"
      const selected = {
        ...preview,
        ...previewMachine,
        API_URL: `https://${host}`,
        ASSISTANT_API_PROTECTION_BYPASS_HOST: host,
        ASSISTANT_API_PROTECTION_BYPASS_SECRET: "fixture-preview-bypass",
      }
      const synced = syncedTriggerJobEnvironment(
        selectedTriggerDeployEnvironment(preview, selected, production),
      )
      expect(synced.ASSISTANT_API_PROTECTION_BYPASS_HOST).toBe(host)
      expect(synced.ASSISTANT_API_PROTECTION_BYPASS_SECRET).toBe(
        "fixture-preview-bypass",
      )
      const gates = Object.entries(synced).filter(
        ([key]) =>
          key.startsWith("ASSISTANT_WHATSAPP_") && key.endsWith("ENABLED"),
      )
      expect(gates).toHaveLength(7)
      expect(gates.every(([, value]) => value === "false")).toBe(true)
      for (const change of [
        { ASSISTANT_WHATSAPP_MEDIA_ENABLED: "true" },
        { ASSISTANT_API_PROTECTION_BYPASS_HOST: "foreign.vercel.app" },
        { API_URL: `https://${host}/foreign` },
        { API_URL: `https://${host}:8443` },
        { ASSISTANT_API_PROTECTION_BYPASS_SECRET: "" },
      ]) {
        expect(() =>
          syncedTriggerJobEnvironment({ ...selected, ...change }),
        ).toThrow()
      }
      expect(() =>
        syncedTriggerJobEnvironment({
          ...production,
          API_URL: selected.API_URL,
          ASSISTANT_API_PROTECTION_BYPASS_HOST: host,
          ASSISTANT_API_PROTECTION_BYPASS_SECRET: "fixture-preview-bypass",
        }),
      ).toThrow("Assistant worker protection configuration invalid.")
      expect(() =>
        selectedTriggerDeployEnvironment(preview, selected, {
          ...production,
          ASSISTANT_API_PROTECTION_BYPASS_SECRET: "fixture-preview-bypass",
        }),
      ).toThrow("Production value for ASSISTANT_API_PROTECTION_BYPASS_SECRET")
    })

    test("rejects a copied Production machine key before sync without revealing its value", () => {
      let failure = ""
      try {
        selectedTriggerDeployEnvironment(
          preview,
          {
            ...preview,
            ...previewMachine,
            INTERNAL_API_KEY: productionMachine.INTERNAL_API_KEY,
          },
          { ...production, ...productionMachine },
        )
      } catch (error) {
        failure = String(error)
      }
      expect(failure).toContain("Production value for INTERNAL_API_KEY")
      expect(failure).not.toContain(productionMachine.INTERNAL_API_KEY)
    })

    test("removes unsourced parent machine credentials and endpoint instead of inheriting them", () => {
      const result = selectedTriggerDeployEnvironment(
        {
          ...preview,
          ...productionMachine,
          ASSISTANT_API_PROTECTION_BYPASS_SECRET: "fixture-inherited-bypass",
          ASSISTANT_API_PROTECTION_BYPASS_HOST: "fixture-inherited-host",
        },
        preview,
        { ...production, ...productionMachine },
      )
      const synced = syncedTriggerJobEnvironment(result)
      expect(synced.ASSISTANT_API_PROTECTION_BYPASS_SECRET).toBeUndefined()
      expect(synced.ASSISTANT_API_PROTECTION_BYPASS_HOST).toBeUndefined()
      expect(result.INTERNAL_API_KEY).toBeUndefined()
      expect(synced.INTERNAL_API_KEY).toBeUndefined()
      expect(synced.API_URL).toBeUndefined()
      expect(synced.ASSISTANT_WHATSAPP_ENABLED).toBe("false")
    })
  })

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
      `tr_prod_${"x".repeat(513)}`,
    ]) {
      for (const name of [
        "TRIGGER_SECRET_KEY",
        "EWATRADE_TRIGGER_SECRET_KEY",
      ]) {
        const env = { ...preview, TRIGGER_SECRET_KEY: "", [name]: key }
        expect(() => triggerDeployCommand(["trigger", "deploy"], env)).toThrow(
          "hosted prod",
        )
        expect(() => syncedTriggerJobEnvironment(env)).toThrow("hosted prod")
      }
    }
  })

  test("accepts current and older hosted prod secret keys under either name", () => {
    for (const key of [
      "tr_prod_sk_FAKE_NOT_A_REAL_KEY",
      "tr_prod_FAKENOTAREALKEY1234",
    ])
      for (const name of [
        "TRIGGER_SECRET_KEY",
        "EWATRADE_TRIGGER_SECRET_KEY",
      ]) {
        const env = { ...preview, TRIGGER_SECRET_KEY: "", [name]: key }
        expect(() =>
          triggerDeployCommand(["trigger", "deploy"], env),
        ).not.toThrow()
      }
    // The prefixed name wins when both are present.
    const result = selectedTriggerDeployEnvironment(
      preview,
      { ...preview, EWATRADE_TRIGGER_SECRET_KEY: "tr_prod_sk_FAKE_PREFIXED" },
      production,
    )
    expect(
      syncedTriggerJobEnvironment(result).EWATRADE_TRIGGER_SECRET_KEY,
    ).toBe("tr_prod_sk_FAKE_PREFIXED")
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
    expect(
      syncedTriggerJobEnvironment(result).EWATRADE_TRIGGER_SECRET_KEY,
    ).toBe(preview.TRIGGER_SECRET_KEY)
    // A base-file key under the new name never fills a missing selected key.
    expect(() =>
      selectedTriggerDeployEnvironment(
        { ...preview, EWATRADE_TRIGGER_SECRET_KEY: "tr_prod_sk_FAKE_BASE" },
        { ...preview, TRIGGER_SECRET_KEY: "" },
        production,
      ),
    ).toThrow()
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
