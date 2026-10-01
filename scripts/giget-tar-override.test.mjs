import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { gzipSync } from "node:zlib"

const root = path.resolve(import.meta.dirname, "..")
const trigger = realpathSync(
  path.join(root, "packages/jobs/node_modules/trigger.dev"),
)
const triggerRequire = createRequire(path.join(trigger, "package.json"))
const c12Require = createRequire(triggerRequire.resolve("c12"))
const gigetEntry = c12Require.resolve("giget")
const gigetRequire = createRequire(gigetEntry)
const { downloadTemplate } = await import(
  pathToFileURL(path.resolve(path.dirname(gigetEntry), "index.mjs")).href
)
const tarPackage = JSON.parse(
  readFileSync(
    path.resolve(path.dirname(gigetEntry), "../../tar/package.json"),
    "utf8",
  ),
)

function octal(value, width) {
  return Buffer.from(`${value.toString(8).padStart(width - 1, "0")}\0`)
}

function archive(entries) {
  const blocks = []
  for (const entry of entries) {
    const data = Buffer.from(entry.data ?? "")
    const header = Buffer.alloc(512)
    header.write(entry.name, 0, 100, "utf8")
    octal(0o644, 8).copy(header, 100)
    octal(0, 8).copy(header, 108)
    octal(0, 8).copy(header, 116)
    octal(entry.type === "symlink" ? 0 : data.length, 12).copy(header, 124)
    octal(0, 12).copy(header, 136)
    header.fill(32, 148, 156)
    header.write(entry.type === "symlink" ? "2" : "0", 156)
    if (entry.link) header.write(entry.link, 157, 100, "utf8")
    header.write("ustar\0", 257, 6, "utf8")
    header.write("00", 263, 2, "utf8")
    let sum = 0
    for (const byte of header) sum += byte
    header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii")
    blocks.push(header)
    if (entry.type !== "symlink") {
      blocks.push(data)
      blocks.push(Buffer.alloc((512 - (data.length % 512)) % 512))
    }
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks))
}

test("Trigger's giget resolves the patched tar override", () => {
  assert.equal(tarPackage.name, "tar")
  assert.equal(tarPackage.version, "7.5.21")
  assert.match(gigetRequire.resolve("tar"), /tar@7\.5\.21/)
})

test("giget extracts a selected subdirectory and cannot overwrite outside sentinels", async () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "ewatrade-giget-tar-"))
  const priorCache = process.env.XDG_CACHE_HOME
  process.env.XDG_CACHE_HOME = path.join(scratch, "cache")
  try {
    const cases = [
      {
        name: "benign",
        entries: [
          { name: "repo/sub/a.txt", data: "A" },
          { name: "repo/sub/deep/b.txt", data: "B" },
          { name: "repo/top.txt", data: "TOP" },
        ],
        expected: { "a.txt": "A", "deep/b.txt": "B" },
      },
      {
        name: "traversal",
        entries: [{ name: "repo/sub/../../escape.txt", data: "ESCAPE" }],
      },
      {
        name: "absolute",
        entries: [{ name: "repo/sub//../../escape2.txt", data: "ESCAPE" }],
      },
      {
        name: "symlink",
        entries: [
          {
            name: "repo/sub/link",
            type: "symlink",
            link: "../../escape-target",
          },
          { name: "repo/sub/link/payload.txt", data: "ESCAPE" },
        ],
      },
    ]
    for (const fixture of cases) {
      const name = `${fixture.name}-${randomUUID()}`
      const dir = path.join(scratch, name)
      const cache = path.join(
        process.env.XDG_CACHE_HOME,
        "giget",
        "fixture",
        name,
      )
      mkdirSync(cache, { recursive: true })
      mkdirSync(path.join(dir, "escape-target"), { recursive: true })
      const sentinels = [
        path.join(dir, "escape.txt"),
        path.join(dir, "escape2.txt"),
        path.join(dir, "escape-target/payload.txt"),
        path.join(scratch, "escape.txt"),
      ]
      for (const sentinel of sentinels) writeFileSync(sentinel, "UNCHANGED")
      writeFileSync(path.join(cache, "v1.tar.gz"), archive(fixture.entries))
      await downloadTemplate(`fixture:${name}`, {
        registry: false,
        offline: true,
        cwd: dir,
        dir: "out",
        providers: {
          fixture: () => ({
            name,
            version: "v1",
            tar: "https://invalid.test/never",
            subdir: "/sub",
          }),
        },
      })
      const out = path.join(dir, "out")
      for (const [relative, content] of Object.entries(
        fixture.expected ?? {},
      )) {
        assert.equal(readFileSync(path.join(out, relative), "utf8"), content)
      }
      assert.equal(existsSync(path.join(out, "top.txt")), false)
      for (const sentinel of sentinels)
        assert.equal(readFileSync(sentinel, "utf8"), "UNCHANGED")
      const link = path.join(out, "link")
      if (fixture.name === "symlink" && existsSync(link)) {
        assert.equal(lstatSync(link).isSymbolicLink(), false)
        assert.equal(lstatSync(link).isDirectory(), true)
      }
    }
  } finally {
    if (priorCache === undefined)
      Reflect.deleteProperty(process.env, "XDG_CACHE_HOME")
    else process.env.XDG_CACHE_HOME = priorCache
    rmSync(scratch, { recursive: true, force: true })
  }
})
