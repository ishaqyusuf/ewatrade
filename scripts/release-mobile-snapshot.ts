import { execFileSync } from "node:child_process"
import type { Dirent } from "node:fs"
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import { matchesAny } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/manifest"
import type { ReleaseManifest } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/plan"
import { assertConfigSourceEnvironment } from "./release-mobile-config-environment"
const MAX_SOURCE_BYTES = 512 * 1024 * 1024
const COMMAND_TIMEOUT_MS = 120_000

export async function assertCommittedToolchainInputs(
  snapshotRoot: string,
  toolchainRoot: string,
) {
  for (const relativePath of [
    "package.json",
    "bun.lock",
    "apps/mobile/package.json",
  ]) {
    const [candidate, installed] = await Promise.all([
      readFile(path.join(snapshotRoot, relativePath)),
      readFile(path.join(toolchainRoot, relativePath)),
    ])
    if (!candidate.equals(installed))
      throw new Error(
        `Committed ${relativePath} differs from the installed trusted Expo toolchain provenance.`,
      )
  }
}

export async function assertConfigEnvironmentIsDeterministic(
  projectRoot: string,
  approvedNames: readonly string[] = [],
) {
  const files = [path.join(projectRoot, "app.config.ts")]
  const pluginRoot = path.join(projectRoot, "plugins")
  async function collect(directory: string): Promise<void> {
    let entries: Dirent[]
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return
      throw error
    }
    for (const entry of entries) {
      const item = path.join(directory, entry.name)
      if (entry.isDirectory()) await collect(item)
      else if (entry.isFile()) files.push(item)
    }
  }
  await collect(pluginRoot)
  for (const file of files) {
    const source = await readFile(file, "utf8")
    assertConfigSourceEnvironment(source, file, approvedNames)
  }
}

export async function materializeCommittedMobileSnapshot(
  repository: string,
  revision: string,
  manifest: ReleaseManifest,
  snapshotRoot: string,
) {
  const target = manifest.targets[0]
  if (!target) throw new Error("Mobile release target is missing.")
  const tree = execFileSync(
    "git",
    [
      "-c",
      "core.fsmonitor=false",
      "ls-tree",
      "-r",
      "-z",
      "--full-tree",
      revision,
    ],
    { cwd: repository, maxBuffer: 64 * 1024 * 1024 },
  )
  const entries = tree
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const tab = entry.indexOf("\t")
      const [mode, kind, object] = entry.slice(0, tab).split(" ")
      return { path: entry.slice(tab + 1), mode, kind, object }
    })
    .filter((entry) =>
      matchesAny(entry.path, [
        ...target.sourcePaths,
        ...(target.nativeCandidatePaths ?? []),
        ".gitignore",
        "package.json",
        "bun.lock",
        "patches/**",
      ]),
    )
    .filter((entry) => !isEnvironmentFile(entry.path))

  const blobEntries = entries.filter(
    (entry) =>
      entry.kind === "blob" && ["100644", "100755"].includes(entry.mode ?? ""),
  )
  if (entries.length !== blobEntries.length)
    throw new Error(
      "Committed mobile snapshot contains a symlink or submodule and cannot be isolated safely.",
    )

  const records = blobEntries.map(({ object, path: filePath, mode }) => {
    if (
      !object ||
      !filePath ||
      filePath.startsWith("/") ||
      filePath.split("/").includes("..")
    )
      throw new Error("Git mobile snapshot contains an unsafe path.")
    return { object, filePath, mode }
  })
  const catFile = Bun.spawn({
    cmd: ["git", "-c", "core.fsmonitor=false", "cat-file", "--batch"],
    cwd: repository,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: process.env.HOME ?? "/tmp",
    },
  })
  const timer = setTimeout(() => catFile.kill("SIGKILL"), COMMAND_TIMEOUT_MS)
  let output: Buffer
  try {
    const input = `${records.map((record) => record.object).join("\n")}\n`
    catFile.stdin.write(input)
    catFile.stdin.end()
    output = await readBoundedBytes(catFile.stdout, MAX_SOURCE_BYTES)
    if ((await catFile.exited) !== 0)
      throw new Error(
        "Committed mobile snapshot could not be read within bounds.",
      )
  } catch (error) {
    catFile.kill("SIGKILL")
    await catFile.exited
    throw error
  } finally {
    clearTimeout(timer)
  }

  let offset = 0
  for (const record of records) {
    const headerEnd = output.indexOf(10, offset)
    if (headerEnd < 0)
      throw new Error("Git object response header is malformed.")
    const header = output.toString("utf8", offset, headerEnd).split(" ")
    const size = Number(header[2])
    offset = headerEnd + 1
    if (
      header[0] !== record.object ||
      header[1] !== "blob" ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      offset + size >= output.byteLength
    )
      throw new Error("Git object response size is malformed.")
    const file = path.join(snapshotRoot, record.filePath)
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
    await writeFile(file, output.subarray(offset, offset + size), {
      mode: record.mode === "100755" ? 0o700 : 0o600,
    })
    offset += size + 1
    if (output[offset - 1] !== 10)
      throw new Error("Git object response framing is malformed.")
  }
  if (offset !== output.byteLength)
    throw new Error("Git object response contains trailing data.")
}

export async function linkSnapshotDependencies(
  repository: string,
  snapshotRoot: string,
  projectRoot: string,
  nodeModules: string,
) {
  const installedRoot = await realpath(nodeModules)
  const rootModules = path.join(snapshotRoot, "node_modules")
  const appModules = path.join(projectRoot, "node_modules")
  await Promise.all([
    mkdir(rootModules, { recursive: true, mode: 0o700 }),
    mkdir(appModules, { recursive: true, mode: 0o700 }),
  ])
  await Promise.all([
    linkInstalledEntries(repository, snapshotRoot, rootModules, installedRoot),
    linkInstalledEntries(repository, snapshotRoot, appModules, installedRoot),
  ])
}

async function linkInstalledEntries(
  repository: string,
  snapshotRoot: string,
  destination: string,
  installedRoot: string,
) {
  const entries = await readdir(installedRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === ".cache" || entry.name === ".bin") continue
    const source = path.join(installedRoot, entry.name)
    const destinationEntry = path.join(destination, entry.name)
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      await mkdir(destinationEntry, { recursive: true, mode: 0o700 })
      for (const scoped of await readdir(source, { withFileTypes: true })) {
        const scopedSource = path.join(source, scoped.name)
        await linkInstalledPackage(
          repository,
          snapshotRoot,
          scopedSource,
          path.join(destinationEntry, scoped.name),
        )
      }
    } else if (entry.isDirectory() && !entry.isSymbolicLink()) {
      await symlink(await realpath(source), destinationEntry, "dir")
    } else {
      await linkInstalledPackage(
        repository,
        snapshotRoot,
        source,
        destinationEntry,
      )
    }
  }
}

async function linkInstalledPackage(
  repository: string,
  snapshotRoot: string,
  source: string,
  destination: string,
) {
  const target = await realpath(source)
  const relative = path.relative(repository, target)
  if (
    relative &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !relative.split(path.sep).includes("node_modules")
  ) {
    const snapshotTarget = path.join(snapshotRoot, relative)
    try {
      await lstat(snapshotTarget)
      await symlink(snapshotTarget, destination, "dir")
      return
    } catch {
      throw new Error(
        `Workspace dependency ${relative} is not present in the committed mobile source snapshot.`,
      )
    }
  }
  await symlink(target, destination, "dir")
}

function isEnvironmentFile(filePath: string) {
  return filePath
    .split("/")
    .some((part) => part === ".env" || part.startsWith(".env."))
}

export function resolveWorkflow(
  repository: string,
  revision: string,
  platform: "android" | "ios",
): "managed" | "generic" {
  const nativeFiles = execFileSync(
    "git",
    [
      "-c",
      "core.fsmonitor=false",
      "ls-tree",
      "-r",
      "--name-only",
      revision,
      "--",
      `apps/mobile/${platform}`,
    ],
    { cwd: repository, encoding: "utf8" },
  )
  const files = nativeFiles.trim().split("\n").filter(Boolean)
  if (!files.length) return "managed"
  const recognized =
    platform === "android"
      ? files.includes("apps/mobile/android/app/build.gradle") &&
        files.includes("apps/mobile/android/app/src/main/AndroidManifest.xml")
      : files.some((file) =>
          /^apps\/mobile\/ios\/[^/]+\.xcodeproj\/project\.pbxproj$/.test(file),
        )
  if (!recognized)
    throw new Error(
      `${platform}: committed native project workflow cannot be classified safely.`,
    )
  return "generic"
}

async function readBoundedBytes(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Buffer> {
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
        "Committed mobile source snapshot exceeded its size limit.",
      )
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks, byteLength)
}
