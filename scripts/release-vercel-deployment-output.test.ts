import { afterEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { REQUIRED_PRODUCTION_API_ENV_KEYS } from "./api-deploy-target.mjs"
import {
  EWATRADE_VERCEL_API_TARGET,
  RELEASE_VERCEL_CLI,
  assertOwnedVercelDeployment,
  parseVercelDeploymentOutput,
} from "./release-vercel-deployment-output.mjs"

const identity = {
  id: "dpl_FAKEDeployment123",
  url: "https://ewatrade-fake123-team.vercel.app",
}
const expected = {
  ...identity,
  projectId: "prj_FAKEProject123",
  teamId: "team_FAKETeam123",
  environment: "preview" as const,
}
const now = 1_800_000_000_000
const provider = {
  id: identity.id,
  url: identity.url.slice(8),
  projectId: expected.projectId,
  ownerId: expected.teamId,
  target: null,
  readyState: "READY",
  createdAt: now - 10_000,
  buildingAt: now - 5_000,
  ready: now - 1_000,
}

test("parses only the reviewed CLI's direct or single-wrapper deployment identity", () => {
  expect(RELEASE_VERCEL_CLI).toBe("vercel@54.4.1")
  expect(parseVercelDeploymentOutput(JSON.stringify(identity))).toEqual(
    identity,
  )
  expect(
    parseVercelDeploymentOutput(
      JSON.stringify({
        status: "ok",
        deployment: {
          ...identity,
          inspectorUrl: "https://vercel.com/untrusted",
        },
        next: [{ command: "inspect dpl_NOTTheDeployment" }],
      }),
    ),
  ).toEqual(identity)
  expect(
    parseVercelDeploymentOutput(
      JSON.stringify({ ...identity, url: identity.url.slice(8) }),
    ),
  ).toEqual(identity)
  expect(
    Object.isFrozen(parseVercelDeploymentOutput(JSON.stringify(identity))),
  ).toBe(true)
})

test("refuses recursive, ambiguous, failed and malformed CLI output without disclosing it", () => {
  const outputs = [
    `CLI logs\n${JSON.stringify(identity)}`,
    JSON.stringify(identity) + JSON.stringify(identity),
    "",
    "null",
    "[]",
    JSON.stringify([identity]),
    JSON.stringify({ metadata: identity }),
    JSON.stringify({ deployments: [identity] }),
    JSON.stringify({ id: identity.id, inspectorUrl: identity.url }),
    JSON.stringify({ ...identity, deployment: identity }),
    JSON.stringify({ deployment: [identity] }),
    JSON.stringify({ deployment: { deployment: identity } }),
    JSON.stringify({ deployment: { url: identity.url } }),
    JSON.stringify({ status: "error", deployment: identity }),
    JSON.stringify({ status: "action_required", deployment: identity }),
    JSON.stringify({ ...identity, error: { token: "FAKE_SECRET_DIAGNOSTIC" } }),
    JSON.stringify({
      deployment: { ...identity, error: "FAKE_SECRET_DIAGNOSTIC" },
    }),
    `{"id":"dpl_FIRST","id":"${identity.id}","url":"${identity.url}"}`,
    `{"id":"dpl_FIRST","\\u0069d":"${identity.id}","url":"${identity.url}"}`,
    JSON.stringify({ id: "dpl_bad/path", url: identity.url }),
    JSON.stringify({ id: "notDeployment", url: identity.url }),
    JSON.stringify({ id: `${identity.id}\n`, url: identity.url }),
    JSON.stringify({ id: `dpl_${"a".repeat(129)}`, url: identity.url }),
    " ".repeat(1024 * 1024 + 1),
  ]
  for (const output of outputs) {
    expect(() => parseVercelDeploymentOutput(output)).toThrow(
      /^VERCEL_DEPLOYMENT_/,
    )
  }
  try {
    parseVercelDeploymentOutput(
      JSON.stringify({ error: "FAKE_SECRET_DIAGNOSTIC" }),
    )
  } catch (error) {
    expect(String(error)).not.toContain("FAKE_SECRET_DIAGNOSTIC")
  }
})

test("accepts only exact safe HTTPS or bare Vercel hosts", () => {
  const badUrls = [
    "http://ewatrade-fake.vercel.app",
    "https://user@ewatrade-fake.vercel.app",
    "https://ewatrade-fake.vercel.app:443",
    `${identity.url}/`,
    `${identity.url}/path`,
    `${identity.url}?query=secret`,
    `${identity.url}#fragment`,
    `${identity.url}.`,
    "https://EWATRADE.vercel.app",
    "https://-invalid.vercel.app",
    "https://invalid-.vercel.app",
    "https://bad..vercel.app",
    "https://vercel.app",
    "https://evilvercel.app",
    "https://foo.vercel.app.evil.test",
    "https://foo%2evercel.app",
    "https://foo\\.vercel.app",
    "https://foo\n.vercel.app",
    `https://${"a".repeat(64)}.vercel.app`,
    `${identity.url}\n`,
    ` ${identity.url}`,
  ]
  for (const url of badUrls) {
    expect(() =>
      parseVercelDeploymentOutput(JSON.stringify({ ...identity, url })),
    ).toThrow("VERCEL_DEPLOYMENT_INVALID_URL")
  }
})

test("requires independent exact ownership, environment, Ready state and URL", () => {
  const verified = assertOwnedVercelDeployment(provider, expected, now)
  expect(verified).toEqual({
    ...expected,
    createdAt: provider.createdAt,
    readyAt: provider.ready,
  })
  expect(Object.isFrozen(verified)).toBe(true)
  expect(Object.hasOwn(verified, "sourceVerified")).toBe(false)
  expect(Object.hasOwn(verified, "receipt")).toBe(false)
  const badRecords = [
    null,
    [],
    { deployment: provider },
    { ...provider, id: "dpl_OTHER" },
    { ...provider, projectId: "prj_OTHER" },
    { ...provider, projectId: undefined, project: { id: expected.projectId } },
    { ...provider, ownerId: "team_OTHER" },
    { ...provider, ownerId: undefined, team: { id: expected.teamId } },
    { ...provider, target: "preview" },
    { ...provider, target: "production" },
    { ...provider, target: undefined },
    { ...provider, readyState: "BUILDING" },
    { ...provider, readyState: "ERROR" },
    { ...provider, readyState: undefined, state: "READY" },
    { ...provider, deletedAt: now - 1 },
    { ...provider, url: "other.vercel.app" },
    { ...provider, url: undefined, alias: [identity.url] },
    { ...provider, url: "https://user@same.vercel.app" },
  ]
  for (const raw of badRecords) {
    expect(() => assertOwnedVercelDeployment(raw, expected, now)).toThrow(
      /^VERCEL_DEPLOYMENT_/,
    )
  }
  expect(
    assertOwnedVercelDeployment(
      { ...provider, target: "production" },
      { ...expected, environment: "production" },
      now,
    ).environment,
  ).toBe("production")
  expect(() =>
    assertOwnedVercelDeployment(
      provider,
      { ...expected, environment: "production" },
      now,
    ),
  ).toThrow("VERCEL_DEPLOYMENT_ENVIRONMENT_MISMATCH")
})

test("requires bounded numeric creation, build and ready chronology", () => {
  const invalidTimes = [
    undefined,
    null,
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    now + 1,
    Number.MAX_SAFE_INTEGER,
    String(now),
  ]
  for (const value of invalidTimes) {
    for (const field of ["createdAt", "ready"] as const) {
      expect(() =>
        assertOwnedVercelDeployment(
          { ...provider, [field]: value },
          expected,
          now,
        ),
      ).toThrow("VERCEL_DEPLOYMENT_INVALID_LIFECYCLE")
    }
  }
  for (const update of [
    { ready: provider.createdAt - 1 },
    { buildingAt: provider.createdAt - 1 },
    { buildingAt: provider.ready + 1 },
    { buildingAt: "yesterday" },
  ]) {
    expect(() =>
      assertOwnedVercelDeployment({ ...provider, ...update }, expected, now),
    ).toThrow("VERCEL_DEPLOYMENT_INVALID_LIFECYCLE")
  }
  expect(() =>
    assertOwnedVercelDeployment(
      { ...provider, buildingAt: undefined },
      expected,
      now,
    ),
  ).not.toThrow()
  expect(() => assertOwnedVercelDeployment(provider, expected, 0)).toThrow(
    "VERCEL_DEPLOYMENT_INVALID_LIFECYCLE",
  )
})

describe("deploy wrapper boundary", () => {
  const roots: string[] = []
  const nodeExecutable = (() => {
    const found = Bun.which("node")
    if (!found) throw new Error("Node is required for deploy wrapper tests")
    return found
  })()
  const identity = {
    id: "dpl_FAKEDeployment123",
    url: "https://ewatrade-fake-team.vercel.app",
  }
  const now = Date.now()
  const provider = {
    ...identity,
    url: identity.url.slice(8),
    projectId: EWATRADE_VERCEL_API_TARGET.projectId,
    ownerId: EWATRADE_VERCEL_API_TARGET.teamId,
    target: null,
    readyState: "READY",
    createdAt: now - 10_000,
    buildingAt: now - 5_000,
    ready: now - 1_000,
  }

  afterEach(() => {
    for (const root of roots.splice(0))
      rmSync(root, { recursive: true, force: true })
  })

  function fixture(
    environment: "preview" | "production",
    raw: unknown,
    readFailure = false,
    preparationFailure:
      | "dirty"
      | "build"
      | "changed-head"
      | undefined = undefined,
  ) {
    const root = mkdtempSync(
      path.join(tmpdir(), "ewatrade-vercel-wrapper-test-"),
    )
    roots.push(root)
    for (const directory of [
      "scripts",
      "apps/api/src",
      "apps/api/.vercel",
      "packages",
      "patches",
      "bin",
      "tmp",
    ]) {
      mkdirSync(path.join(root, directory), { recursive: true })
    }
    for (const file of [
      "deploy-api.mjs",
      "deploy-api-preview.mjs",
      "api-deploy-target.mjs",
      "production-api-readiness.mjs",
      "release-vercel-deployment-output.mjs",
      "check-api-preview-readiness.mjs",
      "database-profile.mjs",
      "environment-profile.mjs",
      "release-api-source-stage.mjs",
    ]) {
      copyFileSync(
        new URL(file, import.meta.url),
        path.join(root, "scripts", file),
      )
    }
    for (const file of [
      "package.json",
      "tsconfig.json",
      "apps/api/tsconfig.json",
    ])
      writeFileSync(path.join(root, file), '{"compilerOptions":{}}')
    writeFileSync(path.join(root, "bun.lock"), "FAKE LOCK")
    writeFileSync(path.join(root, "apps/api/src/index.ts"), "export default {}")
    // Provider boundary tests substitute source/build dependencies. The real
    // Git snapshot and OS isolation contracts have separate integration tests.
    const sourceModule = path.join(root, "scripts/release-api-source-stage.mjs")
    writeFileSync(
      sourceModule,
      `${readFileSync(sourceModule, "utf8").replace("export function resolveApiSourceRevision(", "function unusedRealResolver(")}\nlet fixtureResolutions=0;\nexport function resolveApiSourceRevision(){fixtureResolutions++;if(${JSON.stringify(preparationFailure)}==='dirty'||(${JSON.stringify(preparationFailure)}==='changed-head'&&fixtureResolutions>1))throw Error('FAKE_SOURCE_NOT_CLEAN_OR_CURRENT');return '${"a".repeat(40)}'}\n`,
    )
    writeFileSync(
      path.join(root, "scripts/release-api-build.mjs"),
      `import fs from 'node:fs';import path from 'node:path';\nexport async function prepareCommittedApiArtifact({revision}){\nif(${JSON.stringify(preparationFailure)}==='build')throw Error('FAKE_BUILD_REFUSED');\nconst stage=fs.mkdtempSync(path.join(process.env.TMPDIR,'api-test-build-'));\nfs.mkdirSync(path.join(stage,'apps/api/src'),{recursive:true});fs.writeFileSync(path.join(stage,'apps/api/src/bundle.js'),'export default {}');\nreturn {stage,revision,cleanup(){fs.rmSync(stage,{recursive:true,force:true})}}}\n`,
    )
    writeFileSync(
      path.join(root, "apps/api/.vercel/project.json"),
      JSON.stringify({
        projectName: "ewatrade-api",
        projectId: EWATRADE_VERCEL_API_TARGET.projectId,
        orgId: EWATRADE_VERCEL_API_TARGET.teamId,
        projectSettings: { rootDirectory: "FAKE_MUTABLE_ROOT_MUST_NOT_COPY" },
      }),
    )
    writeFileSync(
      path.join(root, ".env.local"),
      "EWATRADE_DATABASE_URL=postgresql://fake:fake@ep-local.us-east-2.aws.neon.tech/neondb\n",
    )
    writeFileSync(
      path.join(root, ".env.production"),
      [
        "EWATRADE_DATABASE_URL=postgresql://fake:fake@ep-production.us-east-2.aws.neon.tech/neondb",
        "BETTER_AUTH_SECRET=FAKE_PRODUCTION_SECRET",
        `VERCEL_API_PROJECT_ID=${EWATRADE_VERCEL_API_TARGET.projectId}`,
        `VERCEL_API_ORG_ID=${EWATRADE_VERCEL_API_TARGET.teamId}`,
        "VERCEL_API_SKIP_TEST=true",
      ].join("\n"),
    )
    writeFileSync(
      path.join(root, ".env.preview"),
      [
        "EWATRADE_DATABASE_URL=postgresql://fake:fake@ep-preview.us-east-2.aws.neon.tech/neondb",
        "APP_ENV=preview",
        "BETTER_AUTH_SECRET=FAKE_PREVIEW_SECRET",
        "BETTER_AUTH_URL=https://preview-api.example.test",
        "ALLOWED_API_ORIGINS=https://preview.example.test",
        "QA_ACCELERATOR_ENABLED=true",
        "QA_TOOLS_ENABLED=true",
        "QA_ACCELERATOR_SECRET=FAKE_PREVIEW_SIGNING_SECRET_32_CHARACTERS",
        "QA_ACCELERATOR_ALLOWED_ORIGINS=https://preview.example.test",
        'EMAIL_QA_DOMAIN_ROUTES={"example.qa.test":"tester@example.com"}',
        ...[
          "ACCOUNT_PRIVACY_REQUESTS_ENABLED",
          "ACCOUNT_PRIVACY_PROCESSING_ENABLED",
          "ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED",
          "ACCOUNT_PRIVACY_CONVERSATION_ACCESS_PROCESSING_ENABLED",
          "ACCOUNT_PRIVACY_CONVERSATION_OUTCOME_PROCESSING_ENABLED",
          "ACCOUNT_PRIVACY_COMPLETION_ENABLED",
          "QA_MESSAGING_TEST_ADAPTER_ENABLED",
          "STORE_BILLING_ENABLED",
          "PLAY_REFUND_REVIEW_INTAKE_ENABLED",
          "PLAY_REFUND_REVIEW_SUBMISSION_ENABLED",
          "PLAY_REFUND_REVIEW_ALERTS_ENABLED",
          "PLAY_REFUND_REVIEW_ACK_ENABLED",
          "PRESCRIPTION_COMMERCE_LAUNCH_APPROVED",
        ].map((key) => `${key}=false`),
      ].join("\n"),
    )
    const inventory = {
      envs: REQUIRED_PRODUCTION_API_ENV_KEYS.map((key: string) => ({
        key,
        target: ["production"],
        type: "sensitive",
      })),
    }
    writeFileSync(
      path.join(root, "responses.json"),
      JSON.stringify({ identity, raw, inventory, readFailure }),
    )
    const stub = `#!${nodeExecutable}
import fs from 'node:fs';
import path from 'node:path';
const root = process.env.FAKE_WRAPPER_ROOT;
const args = process.argv.slice(2);
const name = path.basename(process.argv[1]);
fs.appendFileSync(path.join(root, 'commands.jsonl'), JSON.stringify({name,args}) + '\\n');
const responses = JSON.parse(fs.readFileSync(path.join(root,'responses.json'),'utf8'));
if (name === 'rsync') { fs.cpSync(path.resolve(args.at(-2)), args.at(-1), { recursive:true }); }
else if (name === 'bun') {
  if (args[0] === 'build') fs.writeFileSync(args.find(arg=>arg.startsWith('--outfile=')).slice(10), 'export default {}');
  else if (args[0] !== 'run') process.exit(81);
}
else if (name === 'bunx') {
  if (args[0] !== '${RELEASE_VERCEL_CLI}') process.exit(82);
  const command = args[1];
  if (command === 'pull') { const stage=args[args.indexOf('--cwd')+1]; fs.writeFileSync(path.join(root,'prepared-project.json'),fs.readFileSync(path.join(stage,'.vercel/project.json'))); fs.writeFileSync(path.join(stage,'.env.production'),'FAKE_PULLED_SECRET'); }
  else if (command === 'deploy') console.log(JSON.stringify(responses.identity));
  else if (command === 'api' && args[2].startsWith('/v9/projects/')) console.log(JSON.stringify(responses.inventory));
  else if (command === 'api' && args[2].startsWith('/v13/deployments/')) {
    if (responses.readFailure) { console.error('FAKE_RAW_CREDENTIAL_DIAGNOSTIC'); process.exit(7); }
    console.log(JSON.stringify(responses.raw));
  }
  else if (command === 'inspect') console.log(JSON.stringify({ id:'dpl_DIFFERENT', name:'ewatrade-api', target:'preview', readyState:'READY' }));
  else process.exit(83);
}
else process.exit(84);
`
    for (const name of ["bun", "bunx", "rsync"]) {
      const command = path.join(root, "bin", name)
      writeFileSync(command, stub)
      chmodSync(command, 0o755)
    }
    const script =
      environment === "production" ? "deploy-api.mjs" : "deploy-api-preview.mjs"
    const stdoutPath = path.join(root, "stdout.txt")
    const stderrPath = path.join(root, "stderr.txt")
    writeFileSync(stdoutPath, "")
    writeFileSync(stderrPath, "")
    // Capture console calls in files: Bun's local spawnSync loses parent-facing
    // output on this host. Provider subprocess output still uses the real pipes.
    const entry = path.join(root, "entry.mjs")
    writeFileSync(
      entry,
      `import fs from 'node:fs';
console.log = (...args) => fs.appendFileSync(${JSON.stringify(stdoutPath)}, args.join(' ')+'\\n');
console.error = (...args) => fs.appendFileSync(${JSON.stringify(stderrPath)}, args.join(' ')+'\\n');
try { await import('./scripts/${script}'); }
catch (error) { console.error(error.message); process.exitCode = 1; }
`,
    )
    const spawned = spawnSync(nodeExecutable, [entry], {
      cwd: root,
      encoding: "utf8",
      env: {
        PATH: path.join(root, "bin"),
        TMPDIR: path.join(root, "tmp"),
        FAKE_WRAPPER_ROOT: root,
      },
    })
    const result = {
      status: spawned.status,
      stdout: readFileSync(stdoutPath, "utf8"),
      stderr: readFileSync(stderrPath, "utf8"),
    }
    const commands: Array<{ name: string; args: string[] }> = existsSync(
      path.join(root, "commands.jsonl"),
    )
      ? readFileSync(path.join(root, "commands.jsonl"), "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : []
    return { result, commands, root }
  }

  test("Production succeeds only after exact independent owned Ready readback, even with probes skipped", () => {
    const { result, commands, root } = fixture("production", {
      ...provider,
      target: "production",
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(`Deployment ID: ${identity.id}`)
    expect(result.stdout).toContain("Done.")
    expect(
      JSON.parse(
        readFileSync(path.join(root, "prepared-project.json"), "utf8"),
      ),
    ).toEqual({
      orgId: EWATRADE_VERCEL_API_TARGET.teamId,
      projectId: EWATRADE_VERCEL_API_TARGET.projectId,
      projectName: "ewatrade-api",
    })
    const read = commands.find((command) =>
      command.args[2]?.startsWith("/v13/deployments/"),
    )
    expect(read?.args).toEqual([
      RELEASE_VERCEL_CLI,
      "api",
      `/v13/deployments/${identity.id}?teamId=${EWATRADE_VERCEL_API_TARGET.teamId}`,
      "--method",
      "GET",
      "--raw",
    ])
    expect(readdirSync(path.join(root, "tmp"))).toEqual([])
  }, 20_000)

  test("both wrappers refuse mismatched ownership or environment before smoke/alias and clean pulled files", () => {
    for (const environment of ["production", "preview"] as const) {
      for (const raw of [
        {
          ...provider,
          target: environment === "production" ? "production" : null,
          ownerId: "team_OTHER",
        },
        {
          ...provider,
          target: environment === "production" ? null : "production",
        },
        {
          ...provider,
          target: environment === "production" ? "production" : null,
          id: "dpl_DIFFERENT",
        },
      ]) {
        const { result, commands, root } = fixture(environment, raw)
        expect(result.status).not.toBe(0)
        expect(result.stdout).not.toContain("Done.")
        expect(result.stdout).not.toContain("passed protected smoke")
        expect(
          commands.some((command) =>
            ["inspect", "curl", "alias"].includes(command.args[1] ?? ""),
          ),
        ).toBe(false)
        expect(commands.some((command) => command.args[1] === "deploy")).toBe(
          true,
        )
        expect(
          commands.some((command) =>
            command.args[2]?.startsWith("/v13/deployments/"),
          ),
        ).toBe(true)
        expect(readdirSync(path.join(root, "tmp"))).toEqual([])
      }
    }
  }, 20_000)

  test("Preview refuses a different inspected ID before protected smoke and alias movement", () => {
    const { result, commands, root } = fixture("preview", provider)
    expect(result.status).not.toBe(0)
    expect(commands.some((command) => command.args[1] === "inspect")).toBe(true)
    expect(
      commands.some((command) =>
        ["curl", "alias"].includes(command.args[1] ?? ""),
      ),
    ).toBe(false)
    expect(readdirSync(path.join(root, "tmp"))).toEqual([])
  })

  test("failed provider reads expose no captured diagnostics and remove staging in both wrappers", () => {
    for (const environment of ["production", "preview"] as const) {
      const { result, root } = fixture(environment, provider, true)
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).not.toContain(
        "FAKE_RAW_CREDENTIAL_DIAGNOSTIC",
      )
      expect(readdirSync(path.join(root, "tmp"))).toEqual([])
    }
  })

  test("dirty source, failed preparation and changed HEAD prevent every upload and clean staging", () => {
    for (const environment of ["production", "preview"] as const) {
      for (const failure of ["dirty", "build", "changed-head"] as const) {
        const { result, commands, root } = fixture(
          environment,
          provider,
          false,
          failure,
        )
        expect(result.status).not.toBe(0)
        expect(
          commands.some((command) =>
            ["pull", "deploy", "alias", "curl"].includes(command.args[1] ?? ""),
          ),
        ).toBe(false)
        expect(readdirSync(path.join(root, "tmp"))).toEqual([])
      }
    }
  }, 20_000)
})
