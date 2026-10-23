import { createHash, randomUUID } from "node:crypto"
import {
  constants,
  chmodSync,
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { z } from "zod"

export const artifactHash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex")
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const fileName = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9.-]{0,79}$/)
  .refine((value) => value !== "artifact.json")
const inventorySchema = z
  .object({
    kind: z.literal("storefront-component-local-artifact"),
    version: z.literal(1),
    artifactId: digest,
    files: z
      .array(
        z
          .object({
            name: fileName,
            bytes: z.number().int().min(0).max(1_048_576),
            sha256: digest,
          })
          .strict(),
      )
      .min(1)
      .max(32),
  })
  .strict()
const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024
const attemptResultSchema = z
  .object({
    status: z.enum(["ready", "failed", "outcome-unknown"]),
    attemptId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
    artifactId: digest.nullable(),
    artifactPath: z.string().max(4096).nullable(),
    diagnostics: z
      .array(
        z
          .object({
            stage: z.enum(["generation", "schema", "build", "preview"]),
            code: z.string().regex(/^COMPONENT_[A-Z_]+(?::[a-z]+)?$/),
            repairable: z.boolean(),
          })
          .strict(),
      )
      .max(10),
  })
  .strict()

function directory(root: string) {
  if (!path.isAbsolute(root))
    throw new Error("COMPONENT_ABSOLUTE_STORE_REQUIRED")
  const absolute = path.resolve(root)
  let current = path.parse(absolute).root
  for (const segment of absolute
    .slice(current.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, segment)
    try {
      mkdirSync(current, { mode: 0o700 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    }
    const stat = lstatSync(current)
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("COMPONENT_STORE_DIRECTORY_REFUSED")
  }
  return absolute
}
function syncDirectory(root: string) {
  const fd = openSync(root, constants.O_RDONLY)
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}
function writeExclusive(file: string, bytes: string | Uint8Array) {
  const fd = openSync(
    file,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  )
  try {
    writeFileSync(fd, bytes)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}
function boundedRead(file: string, max = 1_048_576) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.size > max)
      throw new Error("COMPONENT_ARTIFACT_FILE_REFUSED")
    return readFileSync(fd)
  } finally {
    closeSync(fd)
  }
}
function attemptDirectory(root: string, attemptId: string) {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(attemptId))
    throw new Error("COMPONENT_ATTEMPT_ID_INVALID")
  return path.join(directory(path.join(directory(root), "attempts")), attemptId)
}

/** Exclusive durable receipt precedes the injected call; crash/timeout never silently repeats it. */
export function beginComponentAttempt(
  root: string,
  attemptId: string,
  request: unknown,
  prompt: string,
) {
  const destination = attemptDirectory(root, attemptId)
  try {
    mkdirSync(destination, { mode: 0o700 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      const stat = lstatSync(destination)
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error("COMPONENT_ATTEMPT_DIRECTORY_REFUSED")
      try {
        const oldRequest = boundedRead(
          path.join(destination, "request.json"),
          128_000,
        )
        const oldPrompt = boundedRead(
          path.join(destination, "prompt.txt"),
          128_000,
        )
        if (
          artifactHash(oldRequest) !== artifactHash(JSON.stringify(request)) ||
          artifactHash(oldPrompt) !== artifactHash(prompt)
        )
          throw new Error("COMPONENT_ATTEMPT_INPUT_CONFLICT")
      } catch (readError) {
        if ((readError as NodeJS.ErrnoException).code !== "ENOENT")
          throw readError
      }
      return false
    }
    throw error
  }
  writeExclusive(
    path.join(destination, "request.json"),
    JSON.stringify(request),
  )
  writeExclusive(path.join(destination, "prompt.txt"), prompt)
  writeExclusive(
    path.join(destination, "started.json"),
    JSON.stringify({
      attemptId,
      status: "outcome-unknown",
      startedAt: new Date().toISOString(),
    }),
  )
  syncDirectory(destination)
  syncDirectory(path.dirname(destination))
  return true
}
export function finishComponentAttempt(
  root: string,
  attemptId: string,
  result: unknown,
) {
  const destination = attemptDirectory(root, attemptId)
  const stat = lstatSync(destination)
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("COMPONENT_ATTEMPT_DIRECTORY_REFUSED")
  writeExclusive(path.join(destination, "result.json"), JSON.stringify(result))
  syncDirectory(destination)
}
export function readAttemptStatus(
  root: string,
  attemptId: string,
): z.infer<typeof attemptResultSchema> | null {
  const destination = attemptDirectory(root, attemptId)
  let stat: ReturnType<typeof lstatSync>
  try {
    stat = lstatSync(destination)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("COMPONENT_ATTEMPT_DIRECTORY_REFUSED")
  try {
    const result = attemptResultSchema.parse(
      JSON.parse(
        boundedRead(path.join(destination, "result.json"), 32_768).toString(),
      ),
    )
    if (result.attemptId !== attemptId)
      throw new Error("COMPONENT_ATTEMPT_ID_MISMATCH")
    return result
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    // Even an interrupted pre-receipt creation is a reserved attempt, never replayable.
    return {
      attemptId,
      status: "outcome-unknown",
      artifactId: null,
      artifactPath: null,
      diagnostics: [
        {
          stage: "generation",
          code: "COMPONENT_ATTEMPT_REQUIRES_RECONCILIATION",
          repairable: false,
        },
      ],
    }
  }
}

export function saveComponentArtifact(
  root: string,
  contents: Readonly<Record<string, string | Uint8Array>>,
) {
  const names = Object.keys(contents).sort()
  const files = names.map((name) => {
    fileName.parse(name)
    const bytes = contents[name]
    if (bytes === undefined)
      throw new Error("COMPONENT_ARTIFACT_BYTES_REQUIRED")
    return {
      name,
      bytes: Buffer.byteLength(bytes),
      sha256: artifactHash(bytes),
    }
  })
  const artifactId = artifactHash(JSON.stringify(files))
  const inventory = inventorySchema.parse({
    kind: "storefront-component-local-artifact",
    version: 1,
    artifactId,
    files,
  })
  if (files.reduce((sum, file) => sum + file.bytes, 0) > MAX_ARTIFACT_BYTES)
    throw new Error("COMPONENT_ARTIFACT_SIZE_LIMIT")
  const artifacts = directory(path.join(directory(root), "artifacts"))
  const destination = path.join(artifacts, artifactId)
  if (existsSync(destination)) {
    verifyArtifact(root, artifactId)
    return { artifactId, artifactPath: destination }
  }
  const staging = path.join(artifacts, `.stage-${randomUUID()}`)
  mkdirSync(staging, { mode: 0o700 })
  try {
    for (const name of names) {
      writeExclusive(path.join(staging, name), contents[name] ?? "")
      chmodSync(path.join(staging, name), 0o444)
    }
    writeExclusive(
      path.join(staging, "artifact.json"),
      JSON.stringify(inventory),
    )
    chmodSync(path.join(staging, "artifact.json"), 0o444)
    syncDirectory(staging)
    try {
      renameSync(staging, destination)
    } catch (error) {
      if (
        !["EEXIST", "ENOTEMPTY", "EACCES"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        throw error
      verifyArtifact(root, artifactId)
    }
    chmodSync(destination, 0o555)
    syncDirectory(artifacts)
    return { artifactId, artifactPath: destination }
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

/** Hash/size/path verification only. Never imports a bundle or inserts HTML into a DOM. */
export function verifyArtifact(root: string, artifactId: string) {
  digest.parse(artifactId)
  const artifactPath = path.join(
    directory(path.join(directory(root), "artifacts")),
    artifactId,
  )
  const stat = lstatSync(artifactPath)
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("COMPONENT_ARTIFACT_DIRECTORY_REFUSED")
  const inventory = inventorySchema.parse(
    JSON.parse(
      boundedRead(path.join(artifactPath, "artifact.json"), 16_384).toString(),
    ),
  )
  if (
    inventory.artifactId !== artifactId ||
    artifactHash(JSON.stringify(inventory.files)) !== artifactId ||
    new Set(inventory.files.map((file) => file.name)).size !==
      inventory.files.length ||
    inventory.files.reduce((sum, file) => sum + file.bytes, 0) >
      MAX_ARTIFACT_BYTES
  )
    throw new Error("COMPONENT_ARTIFACT_INVENTORY_INVALID")
  const expected = [
    ...inventory.files.map((file) => file.name),
    "artifact.json",
  ].sort()
  if (
    JSON.stringify(readdirSync(artifactPath).sort()) !==
    JSON.stringify(expected)
  )
    throw new Error("COMPONENT_ARTIFACT_INVENTORY_CHANGED")
  for (const file of inventory.files) {
    const bytes = boundedRead(path.join(artifactPath, file.name))
    if (bytes.length !== file.bytes || artifactHash(bytes) !== file.sha256)
      throw new Error("COMPONENT_ARTIFACT_HASH_MISMATCH")
  }
  const receipt = inventory.files.some((file) => file.name === "receipt.json")
    ? JSON.parse(
        boundedRead(path.join(artifactPath, "receipt.json")).toString(),
      )
    : null
  return { artifactId, artifactPath, files: inventory.files, receipt }
}
