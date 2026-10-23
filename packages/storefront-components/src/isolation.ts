import { spawn, spawnSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  COMPONENT_DEPENDENCIES,
  COMPONENT_LIMITS,
  COMPONENT_SDK_VERSION,
  type ComponentInput,
  assertComponentInputForManifest,
  createComponentInput,
} from "./contracts"
import { validateComponentSource } from "./source-policy"

/** Isolated compiler recipe, intentionally separate from the repository's Bun 1.3.9 launcher. */
export const COMPONENT_COMPILER = Object.freeze({
  image:
    "oven/bun@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4",
  imageId:
    "sha256:b4e28676860761b02257849f827ecee18611343a0541b1bf45007dc59be0bcfb",
  version: "1.3.14",
})
export const COMPONENT_DEPENDENCY_HASHES = Object.freeze({
  react: "5dba386037540e81bba3d2b82e7f1af100d658a88ac3daaf965290fc47bf4d51",
  "react-dom":
    "1f56622ee28d80b83be036e4e83f46d767f1a2796733632195de8df4159f088a",
  scheduler: "1494fa079f3ca1f7ea2d5eefbbd27dd66fad0a0ae76b5e0d34d3482c81c4f2c8",
})
const required = createRequire(import.meta.url)
const sdkRoot = path.dirname(fileURLToPath(import.meta.url))
const sha256 = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex")
const toolEnvironment = Object.fromEntries(
  ["HOME", "PATH", "TMPDIR", "USER"].flatMap((key) => {
    const value = process.env[key]
    return value ? [[key, value]] : []
  }),
)
const containerEnvironment = Object.freeze({
  HOME: "/tmp",
  TMPDIR: "/tmp",
  PATH: "/usr/local/bin:/usr/bin:/bin",
})

function docker(args: string[], socket?: string) {
  const result = spawnSync(
    "docker",
    [...(socket ? ["--host", socket] : []), ...args],
    {
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: COMPONENT_LIMITS.outputBytes,
      env: toolEnvironment,
    },
  )
  if (result.error || result.status !== 0)
    throw new Error(`COMPONENT_DOCKER_STEP_FAILED:${args[0]}`)
  return result.stdout
}

/** Context inspection is local config only; no daemon is contacted before the socket fence. */
export function localComponentDockerSocket() {
  if (process.env.DOCKER_TLS_VERIFY || process.env.DOCKER_CERT_PATH)
    throw new Error("COMPONENT_LOCAL_DOCKER_SOCKET_REQUIRED")
  let host = process.env.DOCKER_HOST
  if (!host) {
    const contextArgs = process.env.DOCKER_CONTEXT
      ? [process.env.DOCKER_CONTEXT]
      : []
    host = JSON.parse(
      docker([
        "context",
        "inspect",
        ...contextArgs,
        "--format",
        "{{json .Endpoints.docker.Host}} ",
      ]),
    ) as string
  }
  if (
    typeof host !== "string" ||
    !host.startsWith("unix:///") ||
    /[\r\n\0]/.test(host) ||
    !statSync(host.slice(7)).isSocket()
  )
    throw new Error("COMPONENT_LOCAL_DOCKER_SOCKET_REQUIRED")
  return host
}

type FileHash = { path: string; sha256: string }
function files(root: string, prefix = ""): FileHash[] {
  const entries: FileHash[] = []
  for (const name of readdirSync(root)) {
    const absolute = path.join(root, name)
    const relative = path.posix.join(prefix, name)
    const stat = lstatSync(absolute)
    if (stat.isSymbolicLink())
      throw new Error("COMPONENT_WORKSPACE_SYMLINK_REFUSED")
    if (stat.isDirectory()) entries.push(...files(absolute, relative))
    else if (stat.isFile() && stat.size <= 8 * 1024 * 1024)
      entries.push({ path: relative, sha256: sha256(readFileSync(absolute)) })
    else throw new Error("COMPONENT_WORKSPACE_FILE_REFUSED")
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path))
}
function regularRead(file: string, root: string, maximum: number) {
  const stat = lstatSync(file)
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > maximum ||
    !realpathSync(file).startsWith(`${realpathSync(root)}${path.sep}`)
  )
    throw new Error("COMPONENT_WORKSPACE_FILE_REFUSED")
  return readFileSync(file)
}
function write(stage: string, name: string, bytes: string | Uint8Array) {
  const destination = path.join(stage, name)
  mkdirSync(path.dirname(destination), { recursive: true, mode: 0o755 })
  writeFileSync(destination, bytes, { flag: "wx", mode: 0o444 })
}
function copyDependency(
  stage: string,
  name: keyof typeof COMPONENT_DEPENDENCY_HASHES,
) {
  const root = path.dirname(
    realpathSync(required.resolve(`${name}/package.json`)),
  )
  const manifest = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  )
  const inventory = files(root)
  if (
    manifest.name !== name ||
    manifest.version !== COMPONENT_DEPENDENCIES[name] ||
    sha256(JSON.stringify(inventory)) !== COMPONENT_DEPENDENCY_HASHES[name]
  )
    throw new Error("COMPONENT_PINNED_DEPENDENCY_CHANGED")
  for (const file of inventory) {
    if (
      /(?:^|\/)\.env(?:\.|$)|(?:^|\/)(?:bunfig|\.npmrc|\.yarnrc)/.test(
        file.path,
      )
    )
      throw new Error("COMPONENT_DEPENDENCY_CONFIG_REFUSED")
    const bytes = regularRead(path.join(root, file.path), root, 8 * 1024 * 1024)
    if (sha256(bytes) !== file.sha256)
      throw new Error("COMPONENT_DEPENDENCY_CHANGED_DURING_COPY")
    write(stage, `node_modules/${name}/${file.path}`, bytes)
  }
  return {
    name,
    version: manifest.version as string,
    sha256: COMPONENT_DEPENDENCY_HASHES[name],
  }
}

function boundedDockerStart(socket: string, id: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("docker", ["--host", socket, "start", "--attach", id], {
      env: toolEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    })
    const chunks: Buffer[] = []
    const errors: Buffer[] = []
    let count = 0
    let failure: string | null = null
    const stop = (code: string) => {
      failure ??= code
      child.kill("SIGKILL")
    }
    const timer = setTimeout(
      () => stop("COMPONENT_WALL_TIME_LIMIT"),
      COMPONENT_LIMITS.wallTimeMs,
    )
    child.stdout.on("data", (bytes: Buffer) => {
      count += bytes.length
      if (count > COMPONENT_LIMITS.outputBytes) stop("COMPONENT_OUTPUT_LIMIT")
      else chunks.push(bytes)
    })
    child.stderr.on("data", (bytes: Buffer) => {
      count += bytes.length
      if (count > COMPONENT_LIMITS.outputBytes) stop("COMPONENT_OUTPUT_LIMIT")
      else errors.push(bytes)
    })
    child.once("error", () => {
      clearTimeout(timer)
      reject(new Error("COMPONENT_CONTAINER_START_UNAVAILABLE"))
    })
    child.once("close", (code) => {
      clearTimeout(timer)
      const diagnostic = Buffer.concat(errors)
        .toString("utf8")
        .match(/COMPONENT_SANDBOX_RUN_FAILED:[a-z]+/)?.[0]
      if (failure || code !== 0)
        reject(
          new Error(
            failure ?? diagnostic ?? "COMPONENT_SANDBOX_EXECUTION_FAILED",
          ),
        )
      else resolve(Buffer.concat(chunks).toString("utf8"))
    })
  })
}

const driver = String.raw`
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
const mode=process.argv[2],hostCanary=process.argv[3];
let step='version';
try {
 if(Bun.version!=='${COMPONENT_COMPILER.version}')throw Error('compiler');
 step='environment';
 const expected={HOME:'/tmp',TMPDIR:'/tmp',PATH:'/usr/local/bin:/usr/bin:/bin'};
 if(Object.keys(process.env).some(key=>!Object.hasOwn(expected,key))||Object.entries(expected).some(([key,value])=>process.env[key]!==value))throw Error('environment');
 step='isolation';let hostReadDenied=false,sourceWriteDenied=false,rootWriteDenied=false;
 try{fs.readFileSync(hostCanary)}catch{hostReadDenied=true}
 try{fs.writeFileSync('/workspace/Component.tsx','CORRUPTED')}catch(e){sourceWriteDenied=['EROFS','EACCES','EPERM'].includes(e.code)}
 try{fs.writeFileSync('/etc/ewatrade-component-probe','CORRUPTED')}catch(e){rootWriteDenied=['EROFS','EACCES','EPERM'].includes(e.code)}
 const server=net.createServer(socket=>socket.end());
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const address=server.address();
 const loopbackControl=await new Promise(resolve=>{const socket=net.connect(address.port,'127.0.0.1');socket.once('connect',()=>{socket.destroy();resolve(true)});socket.once('error',()=>resolve(false))});
 await new Promise(resolve=>server.close(resolve));
 let networkError='timeout';
 const noExternalInterface=Object.values(os.networkInterfaces()).flat().every(address=>address.internal);
 const noExternalRoute=fs.readFileSync('/proc/net/route','utf8').trim().split('\n').length===1;
 const networkDenied=await new Promise(resolve=>{const socket=net.connect(9,'192.0.2.1');const timer=setTimeout(()=>{socket.destroy();resolve(false)},1500);socket.once('connect',()=>{clearTimeout(timer);socket.destroy();resolve(false)});socket.once('error',error=>{clearTimeout(timer);networkError=String(error.code).toLowerCase().replace(/[^a-z]/g,'');resolve(['ENETUNREACH','EHOSTUNREACH','EPERM','EACCES','ECONNREFUSED'].includes(error.code))})});
 if(!hostReadDenied){step='hostread';throw Error('isolation')}
 if(!sourceWriteDenied){step='sourcewrite';throw Error('isolation')}
 if(!rootWriteDenied){step='rootwrite';throw Error('isolation')}
 if(!loopbackControl){step='loopback';throw Error('isolation')}
 if(!networkDenied||!noExternalInterface||!noExternalRoute){step='network'+networkError;throw Error('isolation')}
 const checks={hostReadDenied,sourceWriteDenied,rootWriteDenied,loopbackControl,networkDenied,noExternalInterface,noExternalRoute,credentialFreeEnvironment:true};
 if(mode==='compile'){
   step='compile';
   const result=spawnSync('/usr/local/bin/bun',['build','/workspace/entry.tsx','--no-env-file','--config=/workspace/bunfig.toml','--no-install','--target=bun','--production','--packages=bundle','--env=disable','--outfile=/output/bundle.mjs'],{env:expected,encoding:'utf8',timeout:12000,maxBuffer:262144});
   if(result.error||result.status!==0)throw Error('build');
   const stat=fs.lstatSync('/output/bundle.mjs');if(!stat.isFile()||stat.isSymbolicLink()||stat.size>524288)throw Error('bundle');
   process.stdout.write(JSON.stringify({compilerVersion:Bun.version,checks,bundle:fs.readFileSync('/output/bundle.mjs').toString('base64')}));
 }else if(mode==='render'){
   step='render';
   const value=await import('/workspace/bundle.mjs');
   const fixtures=JSON.parse(fs.readFileSync('/workspace/fixtures.json','utf8'));
   if(!Array.isArray(fixtures)||fixtures.length<1||fixtures.length>3||typeof value.default!=='function')throw Error('fixtures');
   const htmlFixtures=fixtures.map(input=>{const html=value.default(input);if(typeof html!=='string'||Buffer.byteLength(html)>262144)throw Error('html');return html});
   process.stdout.write(JSON.stringify({compilerVersion:Bun.version,checks,htmlFixtures}));
 }else throw Error('mode');
}catch{process.stderr.write('COMPONENT_SANDBOX_RUN_FAILED:'+step);process.exit(1)}
`

async function isolatedCommand(
  socket: string,
  stage: string,
  hostCanary: string,
  mode: "compile" | "render",
) {
  const name = `ewatrade-component-${randomUUID()}`
  let created = false
  try {
    const id = docker(
      [
        "create",
        "--pull=never",
        "--name",
        name,
        "--network=none",
        "--read-only",
        "--user=65534:65534",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--pids-limit=64",
        "--memory=512m",
        "--memory-swap=512m",
        "--cpus=1",
        "--ulimit=nofile=128:128",
        "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777",
        "--tmpfs=/output:rw,noexec,nosuid,nodev,size=8m,uid=65534,gid=65534,mode=0700",
        "--mount",
        `type=bind,source=${stage},target=/workspace,readonly`,
        "--workdir=/workspace",
        "--entrypoint=/usr/bin/env",
        COMPONENT_COMPILER.image,
        "-i",
        ...Object.entries(containerEnvironment).map(
          ([key, value]) => `${key}=${value}`,
        ),
        "/usr/local/bin/bun",
        "--no-env-file",
        "--config=/workspace/bunfig.toml",
        "--no-install",
        "/workspace/driver.mjs",
        mode,
        hostCanary,
      ],
      socket,
    ).trim()
    created = true
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new Error("COMPONENT_CONTAINER_ID_INVALID")
    const inspected = JSON.parse(docker(["inspect", id], socket))[0]
    const config = inspected?.HostConfig
    const mounts = inspected?.Mounts
    if (
      inspected.Image !== COMPONENT_COMPILER.imageId ||
      inspected.Config?.User !== "65534:65534" ||
      config?.NetworkMode !== "none" ||
      !config.ReadonlyRootfs ||
      config.Privileged !== false ||
      config.Devices?.length ||
      config.DeviceRequests?.length ||
      config.Binds?.length ||
      config.Memory !== COMPONENT_LIMITS.memoryBytes ||
      config.MemorySwap !== COMPONENT_LIMITS.memoryBytes ||
      config.NanoCpus !== 1_000_000_000 ||
      config.PidsLimit !== 64 ||
      !config.CapDrop?.includes("ALL") ||
      !config.SecurityOpt?.includes("no-new-privileges") ||
      mounts?.length !== 1 ||
      mounts[0].Type !== "bind" ||
      mounts[0].Source !== stage ||
      mounts[0].Destination !== "/workspace" ||
      mounts[0].RW !== false
    )
      throw new Error("COMPONENT_CONTAINER_GUARDS_MISMATCH")
    const output = await boundedDockerStart(socket, id)
    const state = JSON.parse(docker(["inspect", id], socket))[0]?.State
    if (state?.Running || state?.OOMKilled || state?.ExitCode !== 0)
      throw new Error("COMPONENT_CONTAINER_LIMIT_OR_EXIT_FAILURE")
    return {
      output,
      guards: {
        imageId: inspected.Image as string,
        network: "none" as const,
        readOnly: true,
        user: "65534:65534",
        memoryBytes: config.Memory as number,
        memorySwapBytes: config.MemorySwap as number,
        cpuCount: 1,
        pids: config.PidsLimit as number,
        mount: { source: stage, target: "/workspace", readOnly: true },
        wallTimeMs: COMPONENT_LIMITS.wallTimeMs,
        outputBytes: COMPONENT_LIMITS.outputBytes,
      },
    }
  } finally {
    if (created) docker(["rm", "--force", name], socket)
  }
}

/** No installation, provider call, queue or registration. Source is never imported in the host process. */
export async function runIsolatedComponentBuild(
  value: unknown,
  fixture?: ComponentInput | readonly ComponentInput[],
) {
  const source = validateComponentSource(value)
  const supplied =
    fixture === undefined
      ? undefined
      : Array.isArray(fixture)
        ? (fixture as ComponentInput[])
        : [fixture as ComponentInput]
  if (supplied && (supplied.length < 1 || supplied.length > 3))
    throw new Error("COMPONENT_FIXTURE_COUNT_INVALID")
  for (const item of supplied ?? [])
    assertComponentInputForManifest(item, source.manifest)
  const socket = localComponentDockerSocket()
  const image = JSON.parse(
    docker(
      ["image", "inspect", COMPONENT_COMPILER.image, "--format", "{{json .}}"],
      socket,
    ),
  )
  if (
    image.Id !== COMPONENT_COMPILER.imageId ||
    !image.RepoDigests?.includes(COMPONENT_COMPILER.image)
  )
    throw new Error("COMPONENT_PINNED_LOCAL_IMAGE_UNAVAILABLE")
  const root = realpathSync(mkdtempSync("/private/tmp/ewatrade-component-"))
  const stage = path.join(root, "workspace")
  mkdirSync(stage, { mode: 0o755 })
  chmodSync(stage, 0o755)
  const canary = path.join(root, "host-canary")
  writeFileSync(canary, randomUUID(), { mode: 0o600 })
  const started = Date.now()
  try {
    const dependencies = Object.keys(COMPONENT_DEPENDENCY_HASHES).map((name) =>
      copyDependency(stage, name as keyof typeof COMPONENT_DEPENDENCY_HASHES),
    )
    const sdkFiles = ["sdk.tsx", "context.tsx", "host.tsx"].map((name) => ({
      path: name,
      bytes: regularRead(
        path.join(sdkRoot, name),
        sdkRoot,
        COMPONENT_LIMITS.sourceBytes,
      ),
    }))
    for (const file of sdkFiles)
      write(
        stage,
        `node_modules/@ewatrade/storefront-components/${file.path}`,
        file.bytes,
      )
    write(
      stage,
      "node_modules/@ewatrade/storefront-components/package.json",
      JSON.stringify({
        name: "@ewatrade/storefront-components",
        version: COMPONENT_SDK_VERSION,
        type: "module",
        exports: { "./sdk": "./sdk.tsx", "./host": "./host.tsx" },
      }),
    )
    write(
      stage,
      "package.json",
      JSON.stringify({
        private: true,
        type: "module",
        dependencies: COMPONENT_DEPENDENCIES,
      }),
    )
    write(stage, "bunfig.toml", "env = false\n")
    write(stage, "Component.tsx", source.source)
    write(stage, "styles.css", source.stylesheet)
    write(stage, "manifest.json", JSON.stringify(source.manifest))
    write(stage, "driver.mjs", driver)
    const inputs = supplied ?? [
      createComponentInput({
        manifest: source.manifest,
        settings: Object.fromEntries(
          source.manifest.section.fields.map((field) => [
            field.key,
            field.default,
          ]),
        ),
        data: {
          business: {
            name: "Local component fixture",
            slug: "component-fixture",
            description: "Synthetic local fixture.",
          },
          catalog: [],
          services: [],
        },
        theme: {},
        availableActions: [],
        approvedAssets: new Map(),
      }),
    ]
    const inputJson = inputs.map((input) => JSON.stringify(input))
    if (
      inputs.some(
        (input, index) =>
          input.componentKey !== source.manifest.key ||
          Buffer.byteLength(inputJson[index] ?? "") >
            COMPONENT_LIMITS.inputBytes,
      )
    )
      throw new Error("COMPONENT_BUILD_FIXTURE_INVALID")
    const fixturesJson = `[${inputJson.join(",")}]`
    write(
      stage,
      "entry.tsx",
      `import Component from './Component';\nimport {ComponentHost} from '@ewatrade/storefront-components/host';\nimport {renderToStaticMarkup} from 'react-dom/server';\nfunction freeze(value:any):any{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value)}return value}\nexport default function render(value:any){const input=freeze(value);return renderToStaticMarkup(<ComponentHost input={input} onAction={()=>{throw Error('FIXTURE_ACTION_REFUSED')}}><Component {...input}/></ComponentHost>)}\n`,
    )
    const before = files(stage)
    const stageBytes = before.reduce(
      (sum, file) => sum + statSync(path.join(stage, file.path)).size,
      0,
    )
    if (
      stageBytes + Buffer.byteLength(fixturesJson) + 524_288 >
      COMPONENT_LIMITS.workspaceBytes
    )
      throw new Error("COMPONENT_WORKSPACE_SIZE_LIMIT")
    const compiled = await isolatedCommand(socket, stage, canary, "compile")
    const result = JSON.parse(compiled.output)
    assertProbes(result.checks)
    if (
      result.compilerVersion !== COMPONENT_COMPILER.version ||
      typeof result.bundle !== "string" ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(result.bundle)
    )
      throw new Error("COMPONENT_BUILD_OUTPUT_INVALID")
    const bundle = Buffer.from(result.bundle, "base64")
    if (
      bundle.length > 524_288 ||
      bundle.toString("base64") !== result.bundle ||
      JSON.stringify(files(stage)) !== JSON.stringify(before)
    )
      throw new Error("COMPONENT_BUILD_BYTES_OR_SOURCE_CHANGED")
    write(stage, "bundle.mjs", bundle)
    write(stage, "fixtures.json", fixturesJson)
    const renderInventory = files(stage)
    const rendered = await isolatedCommand(socket, stage, canary, "render")
    const view = JSON.parse(rendered.output)
    assertProbes(view.checks)
    if (
      view.compilerVersion !== COMPONENT_COMPILER.version ||
      !Array.isArray(view.htmlFixtures) ||
      view.htmlFixtures.length !== inputs.length ||
      view.htmlFixtures.some(
        (html: unknown) =>
          typeof html !== "string" || Buffer.byteLength(html) > 262_144,
      ) ||
      JSON.stringify(files(stage)) !== JSON.stringify(renderInventory)
    )
      throw new Error("COMPONENT_RENDER_OUTPUT_INVALID")
    const dependencyLockHash = sha256(JSON.stringify(dependencies))
    const htmlFixtures = view.htmlFixtures as string[]
    return {
      bundle,
      html: htmlFixtures[0] ?? "",
      htmlFixtures,
      receipt: {
        image: COMPONENT_COMPILER.image,
        compilerVersion: COMPONENT_COMPILER.version,
        dependencies,
        dependencyLockHash,
        sdkSourceHash: sha256(
          JSON.stringify(
            sdkFiles.map((file) => ({
              path: file.path,
              sha256: sha256(file.bytes),
            })),
          ),
        ),
        buildRecipeHash: sha256(
          JSON.stringify(
            ["isolation.ts", "source-policy.ts", "contracts.ts"].map(
              (name) => ({
                path: name,
                sha256: sha256(
                  regularRead(
                    path.join(sdkRoot, name),
                    sdkRoot,
                    COMPONENT_LIMITS.sourceBytes,
                  ),
                ),
              }),
            ),
          ),
        ),
        sourceHash: sha256(source.source),
        stylesheetHash: sha256(source.stylesheet),
        manifestHash: sha256(JSON.stringify(source.manifest)),
        inputHash: sha256(inputJson[0] ?? ""),
        fixtureCount: inputs.length,
        fixtureInputHashes: inputJson.map(sha256),
        bundleHash: sha256(bundle),
        htmlHash: sha256(htmlFixtures[0] ?? ""),
        fixtureHtmlHashes: htmlFixtures.map(sha256),
        durationMs: Date.now() - started,
        compiler: { guards: compiled.guards, probes: result.checks },
        renderer: { guards: rendered.guards, probes: view.checks },
        generatedSourceExecutedInHost: false as const,
      },
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function assertProbes(value: unknown) {
  const expected = [
    "hostReadDenied",
    "sourceWriteDenied",
    "rootWriteDenied",
    "loopbackControl",
    "networkDenied",
    "noExternalInterface",
    "noExternalRoute",
    "credentialFreeEnvironment",
  ].sort()
  if (
    !value ||
    typeof value !== "object" ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expected) ||
    Object.values(value).some((entry) => entry !== true)
  )
    throw new Error("COMPONENT_ISOLATION_PROBE_FAILED")
}
