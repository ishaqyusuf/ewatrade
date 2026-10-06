import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  executeMetadataCommand,
  getNextUpdateVersion,
  prepareUpdateMetadata,
} from "./eas-update.mjs"

const runDirs = []

afterEach(async () => {
  await Promise.all(
    runDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

test("update metadata preparation is pure until explicit prepare-only execution", async () => {
  const source = 'export const UPDATE_VERSION = "2026.09.22"\n'
  const prepared = prepareUpdateMetadata({
    source,
    currentVersion: "2026.09.22",
    date: "2026.10.02",
  })
  expect(prepared.nextVersion).toBe("2026.10.02")
  expect(source).toBe('export const UPDATE_VERSION = "2026.09.22"\n')
  expect(prepared.source).toBe('export const UPDATE_VERSION = "2026.10.02"\n')
  expect(getNextUpdateVersion("2026.10.02.02", "2026.10.02")).toBe(
    "2026.10.02.03",
  )

  const root = await mkdtemp(path.join(tmpdir(), "ewatrade-eas-update-"))
  runDirs.push(root)
  const config = path.join(root, "app.config.ts")
  await writeFile(config, source)
  const dryRun = executeMetadataCommand({
    argv: ["--dry-run", "--date", "2026-10-02"],
    targetConfigFile: config,
  })
  expect(dryRun.message).toBe("2026.09.22 -> 2026.10.02")
  expect(dryRun.changed).toBe(false)
  expect(await readFile(config, "utf8")).toBe(source)

  expect(() =>
    executeMetadataCommand({
      argv: ["--date", "2026-10-02"],
      targetConfigFile: config,
    }),
  ).toThrow("Use --prepare-only")
  expect(await readFile(config, "utf8")).toBe(source)

  const preparedRun = executeMetadataCommand({
    argv: ["--prepare-only", "--date", "2026-10-02"],
    targetConfigFile: config,
  })
  expect(preparedRun.changed).toBe(true)
  expect(preparedRun.message).toContain("native compatibility checks")
  expect(await readFile(config, "utf8")).toBe(
    'export const UPDATE_VERSION = "2026.10.02"\n',
  )
})
