import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  constants,
  accessSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { get as httpsGet } from "node:https"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { gunzipSync } from "node:zlib"
import { apiBundleExternalArgs } from "./api-bundle-externals.mjs"
import { materializeCommittedApiStage } from "./release-api-source-stage.mjs"
import { apiBuildWorkspaceFilters } from "./release-api-workspaces.mjs"

const MAX_OUTPUT = 32 * 1024 * 1024
const MAX_EXPORT_BYTES = 128 * 1024 * 1024
const MAX_EXPORT_FILES = 10_000
const MAX_EXPORT_PATH = 512
const MAX_EXPORT_OUTPUT =
  Math.ceil(MAX_EXPORT_BYTES / 3) * 4 +
  MAX_EXPORT_FILES * (MAX_EXPORT_PATH + 100)
const PIN = "bun@1.3.9"
export const PRISMA_SCHEMA_ENGINE = Object.freeze({
  version: "75cbdc1eb7150937890ad5465d861175c6624711",
  url: "https://binaries.prisma.sh/all_commits/75cbdc1eb7150937890ad5465d861175c6624711/darwin-arm64/schema-engine.gz",
  compressedBytes: 10_678_768,
  compressedSha256:
    "9ffdde547b2f63696085647773a5f3be36fff7970439c7c3a1591f0cc4ca9219",
  bytes: 24_153_712,
  sha256: "c24765c3d6edc8715cee7ca773565100859ba70b0fa2fb8931513dd810060ac3",
})
export const API_BUILD_RECIPE = Object.freeze({
  version: 1,
  runtime: PIN,
  install: [
    "--frozen-lockfile",
    "--ignore-scripts",
    "--no-save",
    "--registry=https://registry.npmjs.org",
    "--backend=copyfile",
  ],
  generation: "packages/db/prisma.generate.config.ts",
  workspaceSelection: "api-db-dependency-and-dev-dependency-closure",
  typecheck: [
    "--noEmit",
    "--incremental",
    "false",
    "--strict",
    "--noCheck",
    "false",
    "--project",
    "apps/api/tsconfig.json",
  ],
  bundle: [
    "--target=bun",
    "--packages=bundle",
    "--env=disable",
    ...apiBundleExternalArgs(),
    "--outfile=apps/api/src/bundle.js",
    "apps/api/src/index.ts",
  ],
  upload: "fresh-commit-snapshot-with-regular-generated-files",
  providerBuildCommand: "absent",
  schemaEngine: PRISMA_SCHEMA_ENGINE,
})
const FORWARDER =
  'import { Hono } from "hono"\nimport bundledApp from "./bundle.js"\nconst app = new Hono()\napp.all("*", (context) => bundledApp.fetch(context.req.raw))\nexport default app\n'

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

export function apiBuildEnvironment({ home, temp, cache, bunBinary }) {
  return {
    PATH: `${path.dirname(bunBinary)}:/usr/bin:/bin`,
    HOME: home,
    TMPDIR: temp,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    BUN_INSTALL_CACHE_DIR: cache,
    BUN_CONFIG_NO_CLEAR_TERMINAL: "1",
    DO_NOT_TRACK: "1",
    PRISMA_HIDE_UPDATE_MESSAGE: "1",
    TZ: "UTC",
    LANG: "en_US.UTF-8",
  }
}

// Bun 1.3.9 loses its supplied environment under Seatbelt. This fixed preload
// restores only the builder's private public paths, never the host environment.
export function apiBuildPreload(paths) {
  const environment = apiBuildEnvironment(paths)
  if (paths.schemaEngine)
    environment.PRISMA_SCHEMA_ENGINE_BINARY = paths.schemaEngine
  return `Object.assign(process.env, ${JSON.stringify(environment)});\n`
}

export function validatePrismaSchemaEngine(compressed) {
  const pin = PRISMA_SCHEMA_ENGINE
  if (
    compressed.length !== pin.compressedBytes ||
    digest(compressed) !== pin.compressedSha256
  )
    throw new Error("API_BUILD_ENGINE_INTEGRITY_MISMATCH")
  let bytes
  try {
    bytes = gunzipSync(compressed, { maxOutputLength: pin.bytes })
  } catch {
    throw new Error("API_BUILD_ENGINE_INTEGRITY_MISMATCH")
  }
  if (bytes.length !== pin.bytes || digest(bytes) !== pin.sha256)
    throw new Error("API_BUILD_ENGINE_INTEGRITY_MISMATCH")
  return bytes
}

async function acquirePrismaSchemaEngine(destination) {
  const compressed = await new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    const request = httpsGet(PRISMA_SCHEMA_ENGINE.url, (response) => {
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error("API_BUILD_ENGINE_DOWNLOAD_UNAVAILABLE"))
        return
      }
      response.on("data", (chunk) => {
        size += chunk.length
        if (size > PRISMA_SCHEMA_ENGINE.compressedBytes) {
          response.destroy()
          reject(new Error("API_BUILD_ENGINE_INTEGRITY_MISMATCH"))
        } else chunks.push(chunk)
      })
      response.on("end", () => resolve(Buffer.concat(chunks)))
      response.on("error", () =>
        reject(new Error("API_BUILD_ENGINE_DOWNLOAD_UNAVAILABLE")),
      )
    })
    request.setTimeout(60_000, () => request.destroy())
    request.on("error", () =>
      reject(new Error("API_BUILD_ENGINE_DOWNLOAD_UNAVAILABLE")),
    )
  })
  writeFileSync(destination, validatePrismaSchemaEngine(compressed), {
    flag: "wx",
    mode: 0o500,
  })
}

function sbplString(value) {
  for (const character of value) {
    const code = character.codePointAt(0)
    if (code <= 0x1f || code === 0x7f) throw new Error("API_BUILD_UNSAFE_PATH")
  }
  return JSON.stringify(value)
}

/** Candidate code may read/write only its disposable build and cannot connect. */
export function apiBuildSandboxProfile({
  stage,
  home,
  temp,
  cache,
  bunBinary,
  configPath,
  preloadPath,
  schemaEngine,
  writableDirectories = [],
  writableFiles = [],
  install = false,
}) {
  const reads = [stage, home, temp, cache, "/System", "/usr/lib", "/usr/share"]
  const rules = [
    "(version 1)",
    "(deny default)",
    "(allow process-fork)",
    `(allow process-exec (literal ${sbplString(bunBinary)}) ${schemaEngine ? `(literal ${sbplString(schemaEngine)})` : ""})`,
    // Bun opens the filesystem root directory during startup. This literal
    // grants directory access only, never reads of its descendants.
    `(allow file-read* (literal "/") ${reads.map((item) => `(subpath ${sbplString(item)})`).join(" ")} (literal ${sbplString(bunBinary)}) ${[
      configPath,
      preloadPath,
      schemaEngine,
      configPath && path.dirname(configPath),
    ]
      .filter(Boolean)
      .map((item) => `(literal ${sbplString(item)})`)
      .join(" ")} (literal "/dev/null") (literal "/dev/urandom"))`,
    `(allow file-write* ${[home, temp, cache, ...writableDirectories].map((item) => `(subpath ${sbplString(item)})`).join(" ")} ${writableFiles.map((item) => `(literal ${sbplString(item)})`).join(" ")})`,
    "(allow sysctl-read)",
    // Bun's bundler opens each ancestor directory when loading cwd. Literal
    // directory reads grant no access to files elsewhere beneath /private/tmp.
    '(allow file-read* (literal "/private") (literal "/private/tmp"))',
    ...(install
      ? [
          '(allow mach-lookup (global-name "com.apple.mDNSResponder"))',
          '(allow file-read* (literal "/etc/resolv.conf") (literal "/var/run/resolv.conf") (literal "/etc/hosts") (literal "/private/etc/resolv.conf") (literal "/private/var/run/resolv.conf") (literal "/private/etc/hosts"))',
          '(allow file-read-metadata (literal "/var"))',
        ]
      : []),
    "(deny network-inbound)",
    install ? "(allow network-outbound)" : "(deny network-outbound)",
  ]
  return `${rules.join("\n")}\n`
}

function executable(name) {
  for (const directory of (process.env.PATH ?? "/usr/bin:/bin").split(
    path.delimiter,
  )) {
    if (!path.isAbsolute(directory)) continue
    try {
      const candidate = realpathSync(path.join(directory, name))
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {}
  }
  throw new Error(`API_BUILD_EXECUTABLE_UNAVAILABLE:${name}`)
}

/** Compiler diagnostics expose codes and known source locations, never values. */
export function apiTypeScriptDiagnostics(output, stage, sourcePaths) {
  const known = new Set(sourcePaths)
  const codes = new Set()
  const locations = []
  let errors = 0
  for (const line of output.split("\n")) {
    const code = /(?:^|: )error (TS[0-9]{4,6}):/.exec(line)?.[1]
    if (!code) continue
    errors++
    if (codes.size < 100) codes.add(code)
    const located =
      /^(.{1,1024})\(([0-9]{1,7}),([0-9]{1,7})\): error (TS[0-9]{4,6}):/.exec(
        line,
      )
    if (!located || locations.length >= 100) continue
    const relative = path.relative(stage, path.resolve(stage, located[1]))
    if (!known.has(relative)) continue
    locations.push(
      Object.freeze({
        path: relative,
        code,
        line: Number(located[2]),
        column: Number(located[3]),
      }),
    )
  }
  return Object.freeze({
    errors,
    codes: Object.freeze([...codes].sort()),
    locations: Object.freeze(locations),
  })
}

function run(label, binary, args, options) {
  const { diagnosticPaths = [], ...spawnOptions } = options
  const result = spawnSync(binary, args, {
    ...spawnOptions,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout:
      label === "install"
        ? 1_200_000
        : label === "typecheck"
          ? 600_000
          : 180_000,
    maxBuffer: label === "export" ? MAX_EXPORT_OUTPUT : MAX_OUTPUT,
  })
  if (result.error || result.status !== 0) {
    const diagnostics = [
      [
        "permission-denied",
        /EPERM|EACCES|permission denied|operation not permitted/i,
      ],
      [
        "lock-mismatch",
        /lockfile had changes|frozen.*lockfile|lockfile.*frozen/i,
      ],
      ["missing-file", /ENOENT|no such file|cannot find module/i],
      [
        "network-unavailable",
        /failed to resolve|failed to download|connection refused|could not resolve|SSL|TLS/i,
      ],
      [
        "invalid-option",
        /unknown option|unrecognized.*option|invalid.*argument/i,
      ],
    ]
      .filter(([, pattern]) =>
        pattern.test(`${result.stderr ?? ""}\n${result.stdout ?? ""}`),
      )
      .map(([name]) => name)
    const error = new Error(
      `API_BUILD_STAGE_FAILED:${label}:${result.status ?? result.signal ?? "unknown"}${result.error ? `:${/^[A-Z0-9_]{1,32}$/.test(result.error.code ?? "") ? result.error.code : "SPAWN_ERROR"}` : ""}${diagnostics.length ? `:${diagnostics.join(",")}` : ""}`,
    )
    if (label === "typecheck")
      error.compilerDiagnostics = apiTypeScriptDiagnostics(
        `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
        options.cwd,
        diagnosticPaths,
      )
    throw error
  }
  return result.stdout
}

/** Build is a CLI subcommand, so runtime preload flags must not precede it. */
export function bundleCommittedApiEntry(context) {
  return run(
    "bundle",
    context.sandboxBinary,
    [
      "-p",
      context.profile,
      context.bunBinary,
      "build",
      "--no-env-file",
      `--config=${context.configPath}`,
      "--no-install",
      "--target=bun",
      "--packages=bundle",
      "--env=disable",
      ...apiBundleExternalArgs(),
      `--outfile=${path.join(context.stage, "apps/api/src/bundle.js")}`,
      "apps/api/src/index.ts",
    ],
    { cwd: context.stage, env: context.environment },
  )
}

export async function probeApiBuildSandbox(context, execute = run) {
  const server = createServer((socket) => socket.destroy())
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  try {
    const address = server.address()
    if (!address || typeof address === "string")
      throw new Error("API_BUILD_ISOLATION_UNAVAILABLE")
    const control = `const net=require('node:net');const socket=net.createConnection(${address.port},'127.0.0.1');socket.once('connect',()=>{process.stdout.write('API_BUILD_NETWORK_CONTROL_OK');socket.destroy()});socket.once('error',()=>process.exit(63));setTimeout(()=>{socket.destroy();process.exit(64)},1500).unref();`
    if (
      execute(
        "network-control",
        context.bunBinary,
        [
          "--no-env-file",
          `--config=${context.configPath}`,
          "--no-install",
          "--eval",
          control,
        ],
        { cwd: context.stage, env: context.environment },
      ).trim() !== "API_BUILD_NETWORK_CONTROL_OK"
    )
      throw new Error("API_BUILD_NETWORK_CONTROL_UNAVAILABLE")
    const program = `(async()=>{
const fs=require('node:fs');
let outsideDenied=false;try{fs.readFileSync('/etc/passwd')}catch(e){outsideDenied=['EPERM','EACCES'].includes(e.code)}
let sourceWriteDenied=false;try{fs.writeFileSync(${JSON.stringify(path.join(context.stage, "package.json"))},'CORRUPTED')}catch(e){sourceWriteDenied=['EPERM','EACCES'].includes(e.code)}
const {spawnSync}=require('node:child_process');const child=spawnSync('/bin/sh',['-c','exit 0']);
const processDenied=Boolean(child.error)&&['EPERM','EACCES'].includes(child.error.code);
const net=require('node:net');
const networkDenied=await new Promise(resolve=>{const socket=net.createConnection(${address.port},'127.0.0.1');let done=false;const finish=value=>{if(done)return;done=true;socket.destroy();resolve(value)};socket.once('connect',()=>finish(false));socket.once('error',error=>finish(['EPERM','EACCES','ECONNREFUSED'].includes(error.code)));setTimeout(()=>finish(false),1500).unref()});
const expected=${JSON.stringify(context.environment)};
const environmentMatches=!${Boolean(context.preloadPath)}||(Object.entries(expected).every(([key,value])=>process.env[key]===value)&&Object.keys(process.env).every(key=>Object.hasOwn(expected,key)));
if(!outsideDenied||!sourceWriteDenied||!processDenied||!networkDenied||!environmentMatches||Object.keys(process.env).some(key=>/(SECRET|TOKEN|DATABASE_URL|PRIVATE_KEY)/.test(key)))process.exit(61);
process.stdout.write('API_BUILD_ISOLATION_OK');
})().catch(()=>process.exit(62));`
    const output = execute(
      "isolation-probe",
      context.sandboxBinary,
      [
        "-p",
        context.profile,
        context.bunBinary,
        "--no-env-file",
        `--config=${context.configPath}`,
        "--no-install",
        ...(context.preloadPath ? ["--preload", context.preloadPath] : []),
        "--eval",
        program,
      ],
      { cwd: context.stage, env: context.environment },
    )
    if (output.trim() !== "API_BUILD_ISOLATION_OK")
      throw new Error("API_BUILD_ISOLATION_UNAVAILABLE")
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

/** Read untrusted generated bytes inside isolation, never through host symlinks. */
export function exportApiBuildOutputs(context) {
  const program = `const fs=require('node:fs');const path=require('node:path');
const stage=${JSON.stringify(context.stage)};const records=[];let total=0;
function collect(file){const stat=fs.lstatSync(file);if(stat.isSymbolicLink())throw Error('UNSAFE_OUTPUT');
if(stat.isDirectory()){for(const name of fs.readdirSync(file))collect(path.join(file,name));return}
if(!stat.isFile())throw Error('UNSAFE_OUTPUT');const relative=path.relative(stage,file);
if(relative.includes('\\\\')||relative.split('/').some(part=>!part||part==='.'||part==='..'||!/^[-_A-Za-z0-9][._A-Za-z0-9-]*$/.test(part)))throw Error('UNSAFE_OUTPUT');
if(relative.length>${MAX_EXPORT_PATH}||stat.size>${MAX_EXPORT_BYTES}-total||records.length>=${MAX_EXPORT_FILES})throw Error('OUTPUT_TOO_LARGE');
const bytes=fs.readFileSync(file);if(bytes.length!==stat.size)throw Error('OUTPUT_CHANGED');total+=bytes.length;
records.push({path:relative,data:bytes.toString('base64')})}
try{collect(path.join(stage,'apps/api/src/bundle.js'));collect(path.join(stage,'packages/db/generated/prisma'));
process.stdout.write(JSON.stringify(records));}catch{process.exit(65)}`
  const raw = run(
    "export",
    context.sandboxBinary,
    [
      "-p",
      context.profile,
      context.bunBinary,
      "--no-env-file",
      `--config=${context.configPath}`,
      "--no-install",
      ...(context.preloadPath ? ["--preload", context.preloadPath] : []),
      "--eval",
      program,
    ],
    { cwd: context.stage, env: context.environment },
  )
  let records
  try {
    records = JSON.parse(raw)
  } catch {
    throw new Error("API_BUILD_INVALID_OUTPUT_EXPORT")
  }
  if (
    !Array.isArray(records) ||
    records.length === 0 ||
    records.length > MAX_EXPORT_FILES
  )
    throw new Error("API_BUILD_INVALID_OUTPUT_EXPORT")
  const seen = new Set()
  let total = 0
  return records.map((item) => {
    if (
      !item ||
      typeof item.path !== "string" ||
      item.path.length > MAX_EXPORT_PATH ||
      typeof item.data !== "string" ||
      item.data.length > Math.ceil(MAX_EXPORT_BYTES / 3) * 4 ||
      !(
        item.path === "apps/api/src/bundle.js" ||
        item.path.startsWith("packages/db/generated/prisma/")
      ) ||
      item.path
        .split("/")
        .some((part) => !/^[-_A-Za-z0-9][._A-Za-z0-9-]*$/.test(part)) ||
      seen.has(item.path)
    )
      throw new Error("API_BUILD_INVALID_OUTPUT_EXPORT")
    seen.add(item.path)
    const bytes = Buffer.from(item.data, "base64")
    total += bytes.length
    if (bytes.toString("base64") !== item.data || total > MAX_EXPORT_BYTES)
      throw new Error("API_BUILD_INVALID_OUTPUT_EXPORT")
    return { path: item.path, bytes }
  })
}

// Bun may hoist workspace tooling to root node_modules. Resolve only inside the
// fresh stage, with bounded metadata and no execution of dependency code.
export function resolveApiBuildTools(context) {
  const program = `const fs=require('node:fs');const path=require('node:path');const stage=${JSON.stringify(context.stage)};
function find(candidates,version){for(const relative of candidates){const file=path.join(stage,relative);if(!fs.existsSync(file))continue;const real=fs.realpathSync(file);if(!real.startsWith(stage+'/')||!real.includes('/node_modules/'))throw Error('UNSAFE_TOOL');const manifest=JSON.parse(fs.readFileSync(path.resolve(real,'../../package.json'),'utf8'));if(version&&manifest.version!==version)throw Error('WRONG_VERSION');return real}throw Error('MISSING_TOOL')}
try{process.stdout.write(JSON.stringify({prisma:find(['packages/db/node_modules/prisma/build/index.js','node_modules/prisma/build/index.js'],'7.6.0'),tsc:find(['apps/api/node_modules/typescript/bin/tsc','node_modules/typescript/bin/tsc'])}))}catch{process.exit(66)}`
  const raw = run(
    "resolve-tools",
    context.sandboxBinary,
    [
      "-p",
      context.profile,
      context.bunBinary,
      "--no-env-file",
      `--config=${context.configPath}`,
      "--no-install",
      ...(context.preloadPath ? ["--preload", context.preloadPath] : []),
      "--eval",
      program,
    ],
    { cwd: context.stage, env: context.environment },
  )
  let tools
  try {
    tools = JSON.parse(raw)
  } catch {
    throw new Error("API_BUILD_TOOLS_UNAVAILABLE")
  }
  for (const [name, suffix] of [
    ["prisma", "/prisma/build/index.js"],
    ["tsc", "/typescript/bin/tsc"],
  ]) {
    if (
      typeof tools?.[name] !== "string" ||
      !tools[name].startsWith(`${context.stage}/`) ||
      !tools[name].includes("/node_modules/") ||
      !tools[name].endsWith(suffix) ||
      path.normalize(tools[name]) !== tools[name]
    )
      throw new Error("API_BUILD_TOOLS_UNAVAILABLE")
  }
  return tools
}

function cleanupApiBuild(snapshot, scratch, uploadSnapshot) {
  try {
    snapshot.cleanup()
  } catch (error) {
    uploadSnapshot?.cleanup()
    throw error
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true })
  }
}

/** This is preparation only. No provider credentials, uploads or source proof. */
export async function prepareCommittedApiArtifact({ repository, revision }) {
  if (process.versions.bun)
    throw new Error("API_BUILD_NODE_DRIVER_REQUIRED:use-root-api-command")
  if (process.platform !== "darwin" || process.arch !== "arm64")
    throw new Error("API_BUILD_ISOLATION_UNAVAILABLE:macOS-arm64-required")
  const snapshot = materializeCommittedApiStage({ repository, revision })
  let scratch
  let uploadSnapshot
  try {
    const { stage } = snapshot
    const workspaceFilters = apiBuildWorkspaceFilters(snapshot)
    scratch = realpathSync(
      mkdtempSync(path.join(tmpdir(), "ewatrade-api-build-")),
    )
    const configPath = path.join(scratch, "bunfig.toml")
    writeFileSync(configPath, "env = false\n", { mode: 0o600 })
    const home = path.join(scratch, "home")
    const temp = path.join(scratch, "tmp")
    const cache = path.join(scratch, "cache")
    for (const directory of [home, temp, cache])
      mkdirSync(directory, { recursive: true, mode: 0o700 })
    const bunBinary = executable("bun")
    const environment = apiBuildEnvironment({ home, temp, cache, bunBinary })
    const schemaEngine = path.join(scratch, "schema-engine")
    const preloadPath = path.join(scratch, "environment-preload.mjs")
    environment.PRISMA_SCHEMA_ENGINE_BINARY = schemaEngine
    writeFileSync(
      preloadPath,
      apiBuildPreload({ home, temp, cache, bunBinary, schemaEngine }),
      { mode: 0o400 },
    )
    const runtime = run(
      "runtime",
      bunBinary,
      ["--no-env-file", `--config=${configPath}`, "--version"],
      { cwd: stage, env: environment },
    ).trim()
    const manifest = JSON.parse(
      readFileSync(path.join(stage, "package.json"), "utf8"),
    )
    if (manifest.packageManager !== PIN || `bun@${runtime}` !== PIN)
      throw new Error("API_BUILD_BUN_VERSION_MISMATCH:requires-bun-1.3.9")
    const databasePackage = JSON.parse(
      readFileSync(path.join(stage, "packages/db/package.json"), "utf8"),
    )
    if (
      databasePackage.devDependencies?.prisma !== "7.6.0" ||
      databasePackage.dependencies?.["@prisma/client"] !== "7.6.0"
    )
      throw new Error("API_BUILD_PRISMA_RECIPE_UNSUPPORTED")
    const sourceConfig = JSON.parse(
      readFileSync(path.join(stage, "apps/api/tsconfig.json"), "utf8"),
    )
    if (
      sourceConfig.compilerOptions?.strict !== true ||
      sourceConfig.compilerOptions?.noCheck === true ||
      JSON.stringify(sourceConfig.include) !== '["src/**/*.ts"]' ||
      sourceConfig.files !== undefined ||
      JSON.stringify(sourceConfig.exclude) !== '["node_modules"]'
    )
      throw new Error("API_BUILD_COMPILER_CONTRACT_UNSUPPORTED")
    const providerConfig = JSON.parse(
      readFileSync(path.join(stage, "apps/api/vercel.json"), "utf8"),
    )
    if (
      providerConfig.framework !== "hono" ||
      providerConfig.buildCommand !== undefined
    )
      throw new Error("API_BUILD_PROVIDER_REBUILD_UNSUPPORTED")
    const sandboxBinary = "/usr/bin/sandbox-exec"
    accessSync(sandboxBinary, constants.X_OK)
    const outputPath = path.join(stage, "apps/api/src/bundle.js")
    const generated = path.join(stage, "packages/db/generated")
    const writableDirectories = snapshot.inventory
      .filter((item) => path.basename(item.path) === "package.json")
      .map((item) => path.join(stage, path.dirname(item.path), "node_modules"))
    for (const directory of [...writableDirectories, generated])
      mkdirSync(directory, { recursive: true, mode: 0o700 })
    if (
      snapshot.inventory.some(
        (item) =>
          item.path === "apps/api/src/bundle.js" ||
          item.path.startsWith("packages/db/generated/"),
      )
    )
      throw new Error("API_BUILD_GENERATED_INPUT_CONFLICT")
    const profileOptions = {
      stage,
      home,
      temp,
      cache,
      bunBinary,
      configPath,
      preloadPath,
      schemaEngine,
      writableDirectories: [...writableDirectories, generated],
      writableFiles: [outputPath],
    }
    const profile = apiBuildSandboxProfile(profileOptions)
    const context = {
      stage,
      bunBinary,
      sandboxBinary,
      profile,
      environment,
      configPath,
      preloadPath,
    }
    await probeApiBuildSandbox(context)
    const lockPath = path.join(stage, "bun.lock")
    const lockHash = digest(readFileSync(lockPath))
    // Lifecycle scripts are disabled even for trustedDependencies. Installation
    // uses fresh per-run HOME/cache and never the checkout's node_modules.
    run(
      "install",
      sandboxBinary,
      [
        "-p",
        apiBuildSandboxProfile({ ...profileOptions, install: true }),
        bunBinary,
        "--no-env-file",
        `--config=${configPath}`,
        "install",
        "--frozen-lockfile",
        "--ignore-scripts",
        "--no-save",
        ...workspaceFilters,
        "--registry=https://registry.npmjs.org",
        `--cache-dir=${cache}`,
        "--backend=copyfile",
        "--no-progress",
      ],
      { cwd: stage, env: environment },
    )
    if (digest(readFileSync(lockPath)) !== lockHash)
      throw new Error("API_BUILD_LOCK_CHANGED")
    // Only the trusted Node driver acquires this reviewed public asset. No
    // candidate scripts execute during download, and its bytes are pinned.
    await acquirePrismaSchemaEngine(schemaEngine)
    const tools = resolveApiBuildTools(context)
    const isolated = (label, args, cwd = stage) =>
      run(
        label,
        sandboxBinary,
        [
          "-p",
          profile,
          bunBinary,
          "--no-env-file",
          `--config=${configPath}`,
          "--no-install",
          "--preload",
          preloadPath,
          ...args,
        ],
        {
          cwd,
          env: environment,
          diagnosticPaths: snapshot.inventory.map((item) => item.path),
        },
      )
    isolated(
      "prisma-generate",
      [tools.prisma, "generate", "--config", "prisma.generate.config.ts"],
      path.join(stage, "packages/db"),
    )
    isolated("typecheck", [
      tools.tsc,
      "--noEmit",
      "--incremental",
      "false",
      "--strict",
      "--noCheck",
      "false",
      "--project",
      "apps/api/tsconfig.json",
    ])
    bundleCommittedApiEntry(context)
    for (const item of snapshot.inventory) {
      if (digest(readFileSync(path.join(stage, item.path))) !== item.sha256)
        throw new Error("API_BUILD_COMMITTED_INPUT_CHANGED")
    }
    const outputs = exportApiBuildOutputs(context)
    const bundle = outputs.find(
      (item) => item.path === "apps/api/src/bundle.js",
    )?.bytes
    if (!bundle) throw new Error("API_BUILD_INVALID_OUTPUT_EXPORT")
    uploadSnapshot = materializeCommittedApiStage({ repository, revision })
    if (uploadSnapshot.sourceFingerprint !== snapshot.sourceFingerprint)
      throw new Error("API_BUILD_COMMITTED_INPUT_CHANGED")
    for (const item of outputs) {
      const destination = path.join(uploadSnapshot.stage, item.path)
      mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 })
      writeFileSync(destination, item.bytes, { flag: "wx", mode: 0o644 })
    }
    const apiConfigPath = path.join(
      uploadSnapshot.stage,
      "apps/api/tsconfig.json",
    )
    const config = JSON.parse(readFileSync(apiConfigPath, "utf8"))
    config.compilerOptions = { ...config.compilerOptions, noCheck: true }
    config.include = ["src/index.ts"]
    writeFileSync(apiConfigPath, `${JSON.stringify(config, null, 2)}\n`)
    writeFileSync(
      path.join(uploadSnapshot.stage, "apps/api/src/index.ts"),
      FORWARDER,
    )
    return {
      ...uploadSnapshot,
      bundleSha256: digest(bundle),
      generatedOutputs: Object.freeze(
        outputs.map((item) =>
          Object.freeze({
            path: item.path,
            bytes: item.bytes.length,
            sha256: digest(item.bytes),
            mode: "100644",
          }),
        ),
      ),
      recipe: Object.freeze({
        ...API_BUILD_RECIPE,
        workspaceFilters,
        lockSha256: lockHash,
        profileSha256: digest(profile),
        forwarderSha256: digest(FORWARDER),
      }),
    }
  } catch (error) {
    uploadSnapshot?.cleanup()
    throw error
  } finally {
    cleanupApiBuild(snapshot, scratch, uploadSnapshot)
  }
}
