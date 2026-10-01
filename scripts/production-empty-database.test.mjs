import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  assertDistinctProductionDatabase,
  inspectFreshProductionDatabase,
} from "./production-empty-database.mjs"

const roots = []
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

async function fixture() {
  const rootDir = await mkdtemp(path.join(tmpdir(), "ewatrade-empty-prod-"))
  roots.push(rootDir)
  await mkdir(path.join(rootDir, ".scratch"))
  const backupPath = path.join(rootDir, ".scratch", "before.dump")
  const archive = Buffer.from("PGDMPtest-archive")
  await writeFile(backupPath, archive, { mode: 0o600 })
  return {
    rootDir,
    backupPath,
    backupReference: `local-pg-dump:.scratch/before.dump:sha256=${createHash("sha256").update(archive).digest("hex")}`,
    productionUrl:
      "postgresql://prod:secret@ep-production-pooler.neon.tech/neondb",
    localUrl: "postgresql://dev:secret@ep-development-pooler.neon.tech/neondb",
    previewUrl:
      "postgresql://preview:secret@ep-preview-pooler.neon.tech/neondb",
  }
}

test("read-only empty inspection accepts an isolated target and verified backup", async () => {
  const input = await fixture()
  let calls = 0
  const result = inspectFreshProductionDatabase(
    input,
    (command, args, options) => {
      calls++
      expect(command).toBe("psql")
      expect(args.join(" ")).toContain("BEGIN TRANSACTION READ ONLY")
      expect(args.join(" ")).not.toContain("secret")
      expect(options.env.PGPASSWORD).toBe("secret")
      expect(options.env.PGOPTIONS).toContain(
        "default_transaction_read_only=on",
      )
      return { status: 0, stdout: "BEGIN\n0\nCOMMIT\n" }
    },
  )
  expect(result).toBe(true)
  expect(calls).toBe(1)
})

test("a nonempty or failed inspection refuses the initial migration", async () => {
  const input = await fixture()
  for (const result of [
    { status: 0, stdout: "BEGIN\n1\nCOMMIT\n" },
    { status: 1, stdout: "" },
  ]) {
    expect(() => inspectFreshProductionDatabase(input, () => result)).toThrow(
      "API_DEPLOY_PRODUCTION_DATABASE_NOT_EMPTY",
    )
  }
})

test("backup tampering and a reused Preview database fail before inspection", async () => {
  const input = await fixture()
  await writeFile(input.backupPath, "PGDMPchanged", { mode: 0o600 })
  expect(() => inspectFreshProductionDatabase(input, () => {})).toThrow(
    "API_DEPLOY_FRESH_DATABASE_BACKUP_INVALID",
  )
  expect(() =>
    assertDistinctProductionDatabase(
      "postgresql://other:secret@ep-preview.neon.tech/neondb",
      input.localUrl,
      input.previewUrl,
    ),
  ).toThrow("API_DEPLOY_PRODUCTION_DATABASE_NOT_ISOLATED")
})
