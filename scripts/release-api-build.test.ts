import { afterEach, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  apiBuildEnvironment,
  apiBuildPreload,
  apiBuildSandboxProfile,
  apiTypeScriptDiagnostics,
  prepareCommittedApiArtifact,
  preparedApiBuildCommand,
  probeApiBuildSandbox,
  resolveApiBuildTools,
  validatePrismaSchemaEngine,
} from "./release-api-build.mjs"

const roots: string[] = []

test("provider preparation accepts the checked bundle and rejects missing or changed bytes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "ewatrade-bundle-check-"))
  roots.push(root)
  mkdirSync(path.join(root, "src"))
  const original = "export default { fetch() {} }\n"
  const command = preparedApiBuildCommand(
    createHash("sha256").update(original).digest("hex"),
  )
  expect(command.length).toBeLessThanOrEqual(256)
  const run = () =>
    spawnSync("/bin/sh", ["-c", command], { cwd: root, stdio: "ignore" }).status
  expect(run()).not.toBe(0)
  writeFileSync(path.join(root, "src/bundle.js"), original)
  expect(run()).toBe(0)
  writeFileSync(path.join(root, "src/bundle.js"), "changed bytes")
  expect(run()).not.toBe(0)
  expect(() => preparedApiBuildCommand("'; invalid shell input")).toThrow(
    "API_BUILD_INVALID_BUNDLE_HASH",
  )
})

test("compiler diagnostics retain known source locations and codes without exposing raw values or outside paths", () => {
  const output = [
    "apps/api/src/index.ts(2,3): error TS2307: Cannot find module 'FAKE_PRIVATE_VALUE'.",
    "/private/build/packages/db/src/client.ts(12,6): error TS7016: FAKE_SECRET_ERROR_VALUE",
    "/Users/example/.env.production(1,1): error TS2322: FAKE_HOST_SECRET_VALUE",
    "error TS2688: FAKE_GLOBAL_SECRET_VALUE",
    "arbitrary stdout FAKE_PROVIDER_TOKEN",
  ].join("\n")
  const diagnostics = apiTypeScriptDiagnostics(output, "/private/build", [
    "apps/api/src/index.ts",
    "packages/db/src/client.ts",
  ])
  expect(diagnostics.errors).toBe(4)
  expect(diagnostics.codes).toEqual(["TS2307", "TS2322", "TS2688", "TS7016"])
  expect(diagnostics.locations).toEqual([
    { path: "apps/api/src/index.ts", code: "TS2307", line: 2, column: 3 },
    { path: "packages/db/src/client.ts", code: "TS7016", line: 12, column: 6 },
  ])
  expect(JSON.stringify(diagnostics)).not.toContain("FAKE_")
  expect(JSON.stringify(diagnostics)).not.toContain("/Users/")
  expect(Object.isFrozen(diagnostics.locations)).toBe(true)
})
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

test("a Bun driver is refused before any Git read, install or provider access", async () => {
  await expect(
    prepareCommittedApiArtifact({
      repository: "/not-a-repository",
      revision: "a".repeat(40),
    }),
  ).rejects.toThrow("API_BUILD_NODE_DRIVER_REQUIRED")
})

function context() {
  const root = realpathSync(
    // Match the production stage parent; the sandbox intentionally grants only
    // these ancestor directory reads to Bun's bundler, not arbitrary TMPDIRs.
    mkdtempSync(path.join("/private/tmp", "ewatrade-api-isolation-test-")),
  )
  roots.push(root)
  const stage = path.join(root, "source")
  const home = path.join(root, "home")
  const temp = path.join(root, "tmp")
  const cache = path.join(root, "cache")
  for (const directory of [stage, home, temp, cache])
    mkdirSync(directory, { mode: 0o700 })
  const configPath = path.join(root, "bunfig.toml")
  writeFileSync(configPath, "env = false\n")
  writeFileSync(path.join(stage, "package.json"), '{"name":"test"}')
  const bunBinary = realpathSync(process.execPath)
  const paths = { stage, home, temp, cache, bunBinary, configPath }
  const preloadPath = path.join(root, "environment-preload.mjs")
  writeFileSync(preloadPath, apiBuildPreload(paths), { mode: 0o400 })
  return {
    ...paths,
    preloadPath,
    sandboxBinary: "/usr/bin/sandbox-exec",
    profile: apiBuildSandboxProfile({ ...paths, preloadPath }),
    environment: apiBuildEnvironment(paths),
  }
}

test("candidate environment cannot inherit provider, DB, runtime preload or package-manager credentials", () => {
  const paths = {
    home: "/owned/home",
    temp: "/owned/tmp",
    cache: "/owned/cache",
    bunBinary: "/runtime/bun",
  }
  const previous = process.env.API_BUILD_FAKE_SECRET
  process.env.API_BUILD_FAKE_SECRET = "FAKE_MUST_NOT_REACH_CANDIDATE"
  try {
    const env = apiBuildEnvironment(paths)
    expect(env.HOME).toBe(paths.home)
    expect(env.TMPDIR).toBe(paths.temp)
    expect(env.PATH).toBe("/runtime:/usr/bin:/bin")
    expect(env.BUN_INSTALL_CACHE_DIR).toBe(paths.cache)
    expect(env.API_BUILD_FAKE_SECRET).toBeUndefined()
    for (const name of [
      "NODE_OPTIONS",
      "BUN_OPTIONS",
      "NPM_CONFIG_USERCONFIG",
      "NPM_TOKEN",
      "VERCEL_TOKEN",
      "TRIGGER_SECRET_KEY",
      "EWATRADE_TRIGGER_SECRET_KEY",
      "EWATRADE_DATABASE_URL",
      "DATABASE_URL",
      "EXPO_TOKEN",
    ])
      expect(env[name]).toBeUndefined()
    expect(Object.values(env)).not.toContain("FAKE_MUST_NOT_REACH_CANDIDATE")
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, "API_BUILD_FAKE_SECRET")
    else process.env.API_BUILD_FAKE_SECRET = previous
  }
})

test("the fixed preload contains only private public inputs and the engine refuses unpinned bytes", () => {
  const preload = apiBuildPreload({
    home: "/own/home",
    temp: "/own/tmp",
    cache: "/own/cache",
    bunBinary: "/runtime/bun",
    schemaEngine: "/own/engine",
  })
  expect(preload).toContain('"PRISMA_SCHEMA_ENGINE_BINARY":"/own/engine"')
  expect(preload).toContain('"TMPDIR":"/own/tmp"')
  for (const name of [
    "VERCEL_TOKEN",
    "DATABASE_URL",
    "TRIGGER_SECRET_KEY",
    "process.env.HOME",
    "import",
    "require(",
  ])
    expect(preload).not.toContain(name)
  for (const bytes of [
    Buffer.alloc(0),
    Buffer.from("FAKE_ENGINE"),
    Buffer.alloc(10_678_768),
  ])
    expect(() => validatePrismaSchemaEngine(bytes)).toThrow(
      "API_BUILD_ENGINE_INTEGRITY_MISMATCH",
    )
})

test("sandbox path serialization refuses control characters and quotes literals safely", () => {
  const base = {
    stage: "/source",
    home: "/home",
    temp: "/tmp",
    cache: "/cache",
    bunBinary: '/runtime/with"quote\\bun',
  }
  const profile = apiBuildSandboxProfile(base)
  expect(profile).toContain('(literal "/runtime/with\\"quote\\\\bun")')
  for (const bad of ["/bad\npath", "/bad\u0000path", "/bad\u007fpath"])
    expect(() => apiBuildSandboxProfile({ ...base, stage: bad })).toThrow(
      "API_BUILD_UNSAFE_PATH",
    )
})

test("probe refuses guessed markers, closes its listener after failure and preserves typed context", async () => {
  const ctx = context()
  for (const marker of [
    "",
    "API_BUILD_ISOLATION_OK\nEXTRA",
    "FAKE_RAW_SECRET_DIAGNOSTIC",
  ]) {
    let calls = 0
    await expect(
      probeApiBuildSandbox(ctx, (label, binary, args, options) => {
        calls++
        expect(binary).toBe(
          label === "network-control" ? ctx.bunBinary : ctx.sandboxBinary,
        )
        expect(args).toContain("--no-env-file")
        expect(args).toContain("--no-install")
        expect(options.env).toBe(ctx.environment)
        return label === "network-control"
          ? "API_BUILD_NETWORK_CONTROL_OK"
          : marker
      }),
    ).rejects.toThrow("API_BUILD_ISOLATION_UNAVAILABLE")
    expect(calls).toBe(2)
  }
})

test.skipIf(process.platform !== "darwin")(
  "real Bun sandbox denies host reads, committed-source writes, shell execution and localhost connections",
  async () => {
    const ctx = context()
    const entry = path.join(ctx.home, "real-probe.mjs")
    const resultPath = path.join(ctx.home, "verified.txt")
    writeFileSync(
      entry,
      `import { writeFileSync } from 'node:fs';\nimport { probeApiBuildSandbox } from ${JSON.stringify(new URL("./release-api-build.mjs", import.meta.url).pathname)};\nconst context=${JSON.stringify(ctx)};\nawait probeApiBuildSandbox(context);\ntry { await probeApiBuildSandbox({...context,profile:context.profile.replace('(deny network-outbound)','(allow network-outbound)')});process.exit(10) }catch(error){if(!String(error).includes('API_BUILD_STAGE_FAILED:isolation-probe:61'))throw error}\nwriteFileSync(${JSON.stringify(resultPath)},'REAL_API_ISOLATION_VERIFIED');\n`,
    )
    const node = Bun.which("node")
    if (!node) throw new Error("Node fixture runtime missing")
    const result = spawnSync(node, [entry], {
      cwd: ctx.stage,
      env: ctx.environment,
      encoding: "utf8",
    })
    expect(result.status).toBe(0)
    expect(readFileSync(resultPath, "utf8")).toBe("REAL_API_ISOLATION_VERIFIED")
    expect(readFileSync(path.join(ctx.stage, "package.json"), "utf8")).toBe(
      '{"name":"test"}',
    )
  },
)

test.skipIf(process.platform !== "darwin")(
  "real bundle compiles without executing source or loading dotenv and denies outside imports",
  () => {
    const ctx = context()
    const source = path.join(ctx.stage, "apps/api/src")
    mkdirSync(source, { recursive: true })
    const outputPath = path.join(source, "bundle.js")
    ctx.profile = apiBuildSandboxProfile({
      ...ctx,
      writableFiles: [outputPath],
    })
    const entryPath = path.join(source, "index.ts")
    const outside = path.join(path.dirname(ctx.stage), "outside.js")
    const executed = path.join(ctx.home, "must-not-execute.txt")
    const receipts = path.join(
      ctx.stage,
      "node_modules/@ewatrade/order-receipts",
    )
    mkdirSync(receipts, { recursive: true })
    writeFileSync(
      path.join(receipts, "package.json"),
      JSON.stringify({
        name: "@ewatrade/order-receipts",
        type: "module",
        exports: { ".": "./index.js", "./images": "./images.js" },
      }),
    )
    writeFileSync(
      path.join(receipts, "index.js"),
      "export class ReceiptRenderError extends Error {}",
    )
    writeFileSync(
      path.join(receipts, "images.js"),
      "import addon from './host.node'; export const native = addon;",
    )
    writeFileSync(path.join(receipts, "host.node"), "FAKE_HOST_ONLY_ADDON")
    const entrySource = `import {ReceiptRenderError} from '@ewatrade/order-receipts';import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(executed)},'FAKE_EXECUTED');export const value=process.env.API_BUILD_FAKE_SECRET;export {ReceiptRenderError};export const images=()=>import('@ewatrade/order-receipts/images');`
    writeFileSync(entryPath, entrySource)
    writeFileSync(outside, 'export default "FAKE_HOST_CONTENT";')
    writeFileSync(
      path.join(ctx.stage, ".env"),
      "API_BUILD_FAKE_SECRET=FAKE_DOTENV_MUST_NOT_INLINE\n",
    )
    const resultPath = path.join(ctx.home, "bundle-check.json")
    const entry = path.join(ctx.home, "bundle-check.mjs")
    writeFileSync(
      entry,
      `import {writeFileSync,readFileSync,existsSync} from 'node:fs';import {bundleCommittedApiEntry} from ${JSON.stringify(new URL("./release-api-build.mjs", import.meta.url).pathname)};const context=${JSON.stringify(ctx)};bundleCommittedApiEntry(context);const bundle=readFileSync(${JSON.stringify(outputPath)},'utf8');if(existsSync(${JSON.stringify(executed)})||bundle.includes('FAKE_DOTENV_MUST_NOT_INLINE')||readFileSync(${JSON.stringify(entryPath)},'utf8')!==${JSON.stringify(entrySource)})process.exit(10);writeFileSync(${JSON.stringify(entryPath)},${JSON.stringify(`import value from ${JSON.stringify(outside)};console.log(value);`)});try{bundleCommittedApiEntry(context);process.exit(11)}catch(error){if(!String(error).includes('API_BUILD_STAGE_FAILED:bundle'))throw error}writeFileSync(${JSON.stringify(resultPath)},JSON.stringify({compiled:bundle.includes('API_BUILD_FAKE_SECRET'),outsideDenied:true}));`,
    )
    const node = Bun.which("node")
    if (!node) throw new Error("Node fixture runtime missing")
    const result = spawnSync(node, [entry], {
      cwd: ctx.stage,
      env: ctx.environment,
      encoding: "utf8",
    })
    const safeFailure = result.stderr?.match(
      /API_BUILD_STAGE_FAILED:[a-z0-9:,_-]+/i,
    )?.[0]
    expect(
      result.status,
      safeFailure ?? `bundle fixture exit ${result.status}`,
    ).toBe(0)
    expect(JSON.parse(readFileSync(resultPath, "utf8"))).toEqual({
      compiled: true,
      outsideDenied: true,
    })
    const bundle = readFileSync(outputPath, "utf8")
    expect(bundle).toContain('from "@ewatrade/order-receipts"')
    expect(bundle).toContain('import("@ewatrade/order-receipts/images")')
    expect(bundle).not.toContain("FAKE_HOST_ONLY_ADDON")
  },
)

test.skipIf(process.platform !== "darwin")(
  "generated exports are regular bounded bytes; output symlinks are rejected before host reads",
  () => {
    const ctx = context()
    const source = path.join(ctx.stage, "apps/api/src")
    const generated = path.join(ctx.stage, "packages/db/generated/prisma")
    mkdirSync(source, { recursive: true })
    mkdirSync(generated, { recursive: true })
    writeFileSync(path.join(source, "bundle.js"), "FAKE_PUBLIC_BUNDLE")
    writeFileSync(path.join(generated, "client.ts"), "FAKE_PUBLIC_CLIENT")
    const host = path.join(ctx.home, "outside.txt")
    writeFileSync(host, "FAKE_HOST_VALUE_MUST_NEVER_EXPORT")
    const resultPath = path.join(ctx.home, "output-check.json")
    const entry = path.join(ctx.home, "export.mjs")
    writeFileSync(
      entry,
      `import { writeFileSync, symlinkSync } from 'node:fs';\nimport { exportApiBuildOutputs } from ${JSON.stringify(new URL("./release-api-build.mjs", import.meta.url).pathname)};\nconst context=${JSON.stringify(ctx)};\nconst outputs=exportApiBuildOutputs(context);\nif(outputs.length!==2||outputs.some(item=>item.bytes.toString().includes('FAKE_HOST_VALUE')))process.exit(10);\nwriteFileSync(${JSON.stringify(path.join(generated, "large-public-output.ts"))},Buffer.alloc(26*1024*1024,65));const large=exportApiBuildOutputs(context).find(item=>item.path.endsWith('/large-public-output.ts'));if(large?.bytes.length!==26*1024*1024)process.exit(12);\nsymlinkSync(${JSON.stringify(host)},${JSON.stringify(path.join(generated, "host.txt"))});\ntry{exportApiBuildOutputs(context);process.exit(11)}catch(error){if(!String(error).includes('API_BUILD_STAGE_FAILED:export:65'))throw error}\nwriteFileSync(${JSON.stringify(resultPath)},JSON.stringify(outputs.map(item=>({path:item.path,bytes:item.bytes.length}))));\n`,
    )
    const node = Bun.which("node")
    if (!node) throw new Error("Node fixture runtime missing")
    const result = spawnSync(node, [entry], {
      cwd: ctx.stage,
      env: ctx.environment,
      encoding: "utf8",
    })
    expect(result.status).toBe(0)
    expect(JSON.parse(readFileSync(resultPath, "utf8"))).toEqual([
      { path: "apps/api/src/bundle.js", bytes: 18 },
      { path: "packages/db/generated/prisma/client.ts", bytes: 18 },
    ])
  },
)

test.skipIf(process.platform !== "darwin")(
  "workspace build tools may be hoisted but must stay inside the private stage",
  () => {
    const ctx = context()
    for (const [relative, version] of [
      ["prisma/build/index.js", "7.6.0"],
      ["typescript/bin/tsc", "5.9.3"],
    ]) {
      const file = path.join(ctx.stage, "node_modules", relative)
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, "FAKE_TOOL_MUST_NOT_EXECUTE")
      writeFileSync(
        path.resolve(file, "../../package.json"),
        JSON.stringify({ version }),
      )
    }
    const resultPath = path.join(ctx.home, "tools.json")
    const entry = path.join(ctx.home, "tools-check.mjs")
    writeFileSync(
      entry,
      `import {writeFileSync} from 'node:fs';import {resolveApiBuildTools} from ${JSON.stringify(new URL("./release-api-build.mjs", import.meta.url).pathname)};const context=${JSON.stringify(ctx)};const tools=resolveApiBuildTools(context);writeFileSync(${JSON.stringify(path.join(ctx.stage, "node_modules/prisma/package.json"))},'{"version":"7.6.1"}');try{resolveApiBuildTools(context);process.exit(12)}catch(error){if(!String(error).includes('API_BUILD_STAGE_FAILED:resolve-tools:66'))throw error}writeFileSync(${JSON.stringify(resultPath)},JSON.stringify(tools));`,
    )
    const node = Bun.which("node")
    if (!node) throw new Error("Node fixture runtime missing")
    const result = spawnSync(node, [entry], {
      cwd: ctx.stage,
      env: ctx.environment,
      encoding: "utf8",
    })
    expect(result.status).toBe(0)
    expect(JSON.parse(readFileSync(resultPath, "utf8"))).toEqual({
      prisma: path.join(ctx.stage, "node_modules/prisma/build/index.js"),
      tsc: path.join(ctx.stage, "node_modules/typescript/bin/tsc"),
    })
  },
)
