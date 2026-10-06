import { execFileSync } from "node:child_process"
import { lstatSync, realpathSync, statSync } from "node:fs"
import { readFile, realpath } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"

export async function resolveExpoTools(repository: string) {
  const mobileNodeModules = path.join(repository, "apps/mobile/node_modules")
  const expoPackagePath = await realpath(path.join(mobileNodeModules, "expo"))
  const expoUpdatesPath = await realpath(
    path.join(mobileNodeModules, "expo-updates"),
  )
  const nodeBinary = await realpath(Bun.which("node") ?? "")
  const gitBinary = await realpath(Bun.which("git") ?? "")
  const sandbox = Bun.which("sandbox-exec")
  if (!sandbox || !Bun.which("otool"))
    throw new Error(
      "Credential-free Expo source generation requires macOS sandbox-exec and otool; no candidate config was executed.",
    )
  const expoPackage = JSON.parse(
    await readFile(path.join(expoPackagePath, "package.json"), "utf8"),
  ) as { version?: string }
  const updatesPackage = JSON.parse(
    await readFile(path.join(expoUpdatesPath, "package.json"), "utf8"),
  ) as { version?: string }
  const appPackage = JSON.parse(
    await readFile(path.join(repository, "apps/mobile/package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> }
  const require = createRequire(path.join(expoPackagePath, "package.json"))
  const { satisfies } = require("semver") as {
    satisfies(version: string, range: string): boolean
  }
  if (
    !expoPackage.version ||
    !updatesPackage.version ||
    !satisfies(expoPackage.version, appPackage.dependencies?.expo ?? "") ||
    !satisfies(
      updatesPackage.version,
      appPackage.dependencies?.["expo-updates"] ?? "",
    )
  ) {
    throw new Error(
      "Installed Expo fingerprint/runtime tooling does not satisfy the committed mobile package versions.",
    )
  }
  return {
    mobileNodeModules,
    dependencyStore: await realpath(path.join(repository, "node_modules")),
    nodeBinary,
    gitBinary,
    runtimeLibraries: resolveTrustedRuntimeLibraries(nodeBinary, gitBinary),
    expoCli: path.join(expoPackagePath, "bin/cli"),
    expoUpdatesCli: path.join(expoUpdatesPath, "bin/cli.js"),
  }
}

export function resolveTrustedRuntimeLibraries(...executables: string[]) {
  const otool = process.platform === "darwin" ? "/usr/bin/otool" : undefined
  if (!otool)
    throw new Error("Trusted runtime dependency inspection is unavailable.")
  const inspector = lstatSync(otool)
  if (
    !inspector.isFile() ||
    inspector.uid !== 0 ||
    (inspector.mode & 0o022) !== 0 ||
    realpathSync(otool) !== otool
  )
    throw new Error(
      "Native runtime inspection requires the protected system tool.",
    )
  const systemLibrary = (file: string) =>
    path.isAbsolute(file) &&
    path.normalize(file) === file &&
    (file.startsWith("/System/") || file.startsWith("/usr/lib/"))
  const pending = executables.map((file) => ({
    file,
    inheritedRpaths: [] as string[],
  }))
  const visited = new Set<string>()
  const libraries = new Set<string>()
  while (pending.length) {
    const current = pending.shift()
    if (!current) continue
    const file = realpathSync(current.file)
    if (visited.has(file)) continue
    visited.add(file)
    if (systemLibrary(file)) continue
    const loadCommands = execFileSync(otool, ["-l", file], {
      env: { PATH: "/usr/bin:/bin", HOME: "/tmp" },
      maxBuffer: 2 * 1024 * 1024,
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).toString("utf8")
    const ownRpaths = [
      ...loadCommands.matchAll(/\bpath (.+?) \(offset \d+\)/g),
    ].map((match) => match[1] ?? "")
    const rpaths = [...new Set([...current.inheritedRpaths, ...ownRpaths])]
    const linked = execFileSync(otool, ["-L", file], {
      env: { PATH: "/usr/bin:/bin", HOME: "/tmp" },
      maxBuffer: 2 * 1024 * 1024,
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString("utf8")
      .split("\n")
      .slice(1)
      .map((line) => line.trim().split(" (")[0] ?? "")
      .filter(Boolean)
    for (const dependency of linked) {
      if (systemLibrary(dependency)) continue
      let candidates: string[]
      if (dependency.startsWith("@loader_path/"))
        candidates = [path.resolve(path.dirname(file), dependency.slice(13))]
      else if (dependency.startsWith("@executable_path/"))
        candidates = [
          path.resolve(
            path.dirname(executables[0] ?? file),
            dependency.slice(17),
          ),
        ]
      else if (dependency.startsWith("@rpath/"))
        candidates = rpaths.map((rpath) => {
          const base = rpath.startsWith("@loader_path/")
            ? path.resolve(path.dirname(file), rpath.slice(13))
            : rpath === "@loader_path"
              ? path.dirname(file)
              : rpath.startsWith("@executable_path/")
                ? path.resolve(
                    path.dirname(executables[0] ?? file),
                    rpath.slice(17),
                  )
                : rpath
          return path.resolve(base, dependency.slice(7))
        })
      else if (path.isAbsolute(dependency)) candidates = [dependency]
      else
        throw new Error(
          "Trusted runtime has an unsupported dynamic library reference.",
        )
      const resolved = candidates.find((candidate) => {
        try {
          return statSync(candidate).isFile()
        } catch {
          return false
        }
      })
      if (!resolved)
        throw new Error(
          "Trusted runtime dynamic library closure is incomplete.",
        )
      const real = realpathSync(resolved)
      if (!systemLibrary(real)) {
        libraries.add(real)
        pending.push({ file: real, inheritedRpaths: rpaths })
      }
    }
  }
  return [...libraries].sort()
}
