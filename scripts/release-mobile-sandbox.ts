import { realpath } from "node:fs/promises"
import { createServer } from "node:net"
const MAX_OUTPUT_BYTES = 12 * 1024 * 1024
const MAX_STDERR_BYTES = 64 * 1024
const COMMAND_TIMEOUT_MS = 120_000

export type CandidateSandboxContext = {
  snapshotRoot: string
  projectRoot: string
  home: string
  temp: string
  dependencyStore: string
  nodeBinary: string
  gitBinary: string
  runtimeLibraries: string[]
  environment: NodeJS.ProcessEnv
  profile: string
}

export type CandidateCommand = {
  label:
    | "isolation-probe"
    | "expo-config"
    | "expo-fingerprint-android"
    | "expo-fingerprint-ios"
    | "expo-runtime-android"
    | "expo-runtime-ios"
  executable: string
  args: string[]
}

export type IsolatedCandidateExecutor = {
  /** Must reject unless its OS sandbox can enforce the supplied profile. */
  probe(context: CandidateSandboxContext): Promise<void>
  /** Runs only the supplied trusted Expo command under that enforced profile. */
  execute(
    command: CandidateCommand,
    context: CandidateSandboxContext,
  ): Promise<string>
}

export function buildCandidateSandboxProfile(context: {
  snapshotRoot: string
  projectRoot: string
  home: string
  temp: string
  dependencyStore: string
  nodeBinary: string
  gitBinary: string
  runtimeLibraries: string[]
}): string {
  const reads = [
    context.snapshotRoot,
    context.home,
    context.temp,
    context.dependencyStore,
    "/System",
    "/usr/lib",
    "/usr/bin",
    "/bin",
    "/dev/null",
    "/dev/urandom",
  ]
  // Candidate config and Expo fingerprint code may inspect only the immutable
  // committed snapshot. Writable state is confined to per-run scratch paths.
  const writes = [context.home, context.temp]
  const executables = [context.nodeBinary, context.gitBinary]
  const rules = [
    "(version 1)",
    "(deny default)",
    "(allow process-fork)",
    `(allow process-exec ${executables.map((item) => `(literal ${sbplString(item)})`).join(" ")})`,
    `(allow file-read* ${[
      ...reads.map((item) => `(subpath ${sbplString(item)})`),
      `(literal ${sbplString(context.nodeBinary)})`,
      `(literal ${sbplString(context.gitBinary)})`,
      ...context.runtimeLibraries.map(
        (item) => `(literal ${sbplString(item)})`,
      ),
    ].join(" ")})`,
    `(allow file-write* ${writes.map((item) => `(subpath ${sbplString(item)})`).join(" ")})`,
    "(allow sysctl-read)",
    "(deny network-inbound)",
    "(deny network-outbound)",
  ]
  return `${rules.join("\n")}\n`
}

export async function createSandboxContext(input: {
  snapshotRoot: string
  projectRoot: string
  home: string
  temp: string
  dependencyStore: string
  nodeBinary: string
  gitBinary: string
  runtimeLibraries: string[]
  environment: NodeJS.ProcessEnv
}): Promise<CandidateSandboxContext> {
  const dependencyStore = await realpath(input.dependencyStore)
  const nodeBinary = await realpath(input.nodeBinary)
  const gitBinary = await realpath(input.gitBinary)
  const context = {
    ...input,
    dependencyStore,
    nodeBinary,
    gitBinary,
    runtimeLibraries: input.runtimeLibraries,
    profile: "",
  }
  return { ...context, profile: buildCandidateSandboxProfile(context) }
}

export function createSandboxExecExecutor(): IsolatedCandidateExecutor {
  const sandboxExec = Bun.which("sandbox-exec")
  if (!sandboxExec || !Bun.which("otool"))
    throw new Error(
      "Credential-free Expo source generation requires macOS sandbox-exec and otool; no candidate config was executed.",
    )
  return {
    async probe(context) {
      const server = createServer((socket) => socket.destroy())
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject)
        server.listen(0, "127.0.0.1", resolve)
      })
      const address = server.address()
      if (!address || typeof address === "string") {
        server.close()
        throw new Error(
          "Could not establish the local network isolation probe.",
        )
      }
      const probe = [
        "(async()=>{",
        "const fs=require('node:fs');",
        "let outsideDenied=false; try { fs.readFileSync('/etc/passwd'); } catch(e) { outsideDenied=e.code==='EPERM'||e.code==='EACCES'; }",
        "const {spawnSync}=require('node:child_process');",
        "const child=spawnSync('/bin/sh',['-c','exit 0']);",
        "const processDenied=Boolean(child.error)&&(child.error.code==='EPERM'||child.error.code==='EACCES');",
        "const net=require('node:net');",
        `const networkDenied=await new Promise(resolve=>{const socket=net.createConnection(${address.port},'127.0.0.1');let settled=false;const finish=value=>{if(settled)return;settled=true;socket.destroy();resolve(value)};socket.once('connect',()=>finish(false));socket.once('error',error=>finish(error.code==='EPERM'||error.code==='EACCES'||/operation not permitted/i.test(error.message)));setTimeout(()=>finish(false),1500).unref();});`,
        "const secretNames=['EXPO_TOKEN','AWS_SECRET_ACCESS_KEY','VERCEL_TOKEN','GITHUB_TOKEN','NPM_TOKEN'];",
        "if(!outsideDenied||!processDenied||!networkDenied||secretNames.some(k=>process.env[k])) process.exit(61);",
        "process.stdout.write('MOBILE_SOURCE_ISOLATION_OK');",
        "})().catch(()=>process.exit(62));",
      ].join("\n")
      try {
        const result = await spawnInSandbox(
          sandboxExec,
          {
            label: "isolation-probe",
            executable: context.nodeBinary,
            args: ["-e", probe],
          },
          context,
        )
        if (result.trim() !== "MOBILE_SOURCE_ISOLATION_OK")
          throw new Error(
            "OS sandbox did not prove host-file, unapproved child-process, and localhost network isolation; no candidate config was executed.",
          )
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    },
    async execute(command, context) {
      return spawnInSandbox(sandboxExec, command, context)
    },
  }
}

async function spawnInSandbox(
  sandboxExec: string,
  command: CandidateCommand,
  context: CandidateSandboxContext,
): Promise<string> {
  const proc = Bun.spawn({
    cmd: [
      sandboxExec,
      "-p",
      context.profile,
      command.executable,
      ...command.args,
    ],
    cwd: context.projectRoot,
    env: context.environment,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const timer = setTimeout(() => proc.kill("SIGKILL"), COMMAND_TIMEOUT_MS)
  try {
    const [streams, status] = await Promise.all([
      Promise.all([
        readBounded(proc.stdout, MAX_OUTPUT_BYTES),
        readBounded(proc.stderr, MAX_STDERR_BYTES),
      ]),
      proc.exited,
    ])
    if (status !== 0)
      throw new Error(
        `Isolated Expo ${command.label} failed with status ${status}; candidate source was not accepted.`,
      )
    return streams[0]
  } catch (error) {
    proc.kill("SIGKILL")
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function readBounded(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<string> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > limit) {
      await reader.cancel()
      throw new Error(
        "Isolated Expo command exceeded its bounded output limit.",
      )
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

function sbplString(value: string) {
  if (
    [...value].some((character) => {
      const code = character.codePointAt(0) ?? 0
      return code < 32 || code === 127
    })
  )
    throw new Error("Sandbox paths cannot contain control characters.")
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}
