import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import type { ApiSourceInventoryFile } from "./release-api-source-stage.mjs"
import { apiBuildWorkspaceFilters } from "./release-api-workspaces.mjs"

const stages: string[] = []
type Metadata = Record<string, unknown> | string | Buffer

function fixture(manifests: Record<string, Metadata> = {}) {
  const stage = realpathSync(
    mkdtempSync("/private/tmp/ewatrade-api-workspaces-test-"),
  )
  stages.push(stage)
  const inventory: ApiSourceInventoryFile[] = []
  for (const [relative, metadata] of Object.entries({
    "apps/api/package.json": { name: "@ewatrade/api" },
    "packages/db/package.json": { name: "@ewatrade/db" },
    ...manifests,
  })) {
    const bytes = Buffer.isBuffer(metadata)
      ? metadata
      : Buffer.from(
          typeof metadata === "string" ? metadata : JSON.stringify(metadata),
        )
    const filename = path.join(stage, relative)
    mkdirSync(path.dirname(filename), { recursive: true })
    writeFileSync(filename, bytes)
    inventory.push({
      path: relative,
      mode: "100644",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    })
  }
  return { stage, inventory }
}

afterEach(() => {
  for (const stage of stages.splice(0))
    rmSync(stage, { recursive: true, force: true })
})

test("selects both roots and transitive dependency and devDependency closure", () => {
  const input = fixture({
    "apps/api/package.json": {
      name: "@ewatrade/api",
      dependencies: { "@ewatrade/email": "workspace:*", hono: "4.13.9" },
      scripts: { postinstall: "exit 99" },
    },
    "packages/email/package.json": {
      name: "@ewatrade/email",
      dependencies: { react: "19.1.0" },
      devDependencies: {
        "@ewatrade/tsconfig": "workspace:*",
        "@types/react": "^19.1.13",
      },
    },
    "packages/tsconfig/package.json": {
      name: "@ewatrade/tsconfig",
      devDependencies: { "@ewatrade/compiler-tools": "workspace:^" },
    },
    "tooling/compiler/package.json": {
      name: "@ewatrade/compiler-tools",
      dependencies: { "@ewatrade/api": "workspace:*" },
    },
    "packages/db/package.json": {
      name: "@ewatrade/db",
      devDependencies: { prisma: "7.6.0" },
    },
    "apps/mobile/package.json": {
      name: "@ewatrade/mobile",
      dependencies: { "@ewatrade/not-needed": "workspace:*" },
    },
  })
  const filters = apiBuildWorkspaceFilters(input)
  expect(filters).toEqual([
    "--filter=./apps/api",
    "--filter=./packages/db",
    "--filter=./packages/email",
    "--filter=./packages/tsconfig",
    "--filter=./tooling/compiler",
  ])
  expect(Object.isFrozen(filters)).toBe(true)
  expect(
    apiBuildWorkspaceFilters({
      ...input,
      inventory: [...input.inventory].reverse(),
    }),
  ).toEqual(filters)
})

test("reads only inventoried top-level workspace manifests", () => {
  const input = fixture({
    "packages/unused/package.json": { name: "@ewatrade/unused" },
    "packages/db/src/package.json": "not valid JSON",
    "node_modules/host/package.json": "not valid JSON",
  })
  mkdirSync(path.join(input.stage, "packages/unlisted"), { recursive: true })
  writeFileSync(
    path.join(input.stage, "packages/unlisted/package.json"),
    "not valid JSON",
  )
  expect(apiBuildWorkspaceFilters(input)).toEqual([
    "--filter=./apps/api",
    "--filter=./packages/db",
  ])
})

test("refuses unresolved workspace dependencies and devDependencies", () => {
  for (const section of ["dependencies", "devDependencies"]) {
    const input = fixture({
      "packages/db/package.json": {
        name: "@ewatrade/db",
        [section]: { "@ewatrade/missing": "workspace:*" },
      },
    })
    expect(() => apiBuildWorkspaceFilters(input)).toThrow("UNRESOLVED")
  }
})

test("requires exact root paths and package identities", () => {
  for (const relative of [
    "apps/api/package.json",
    "packages/db/package.json",
  ]) {
    const input = fixture()
    expect(() =>
      apiBuildWorkspaceFilters({
        ...input,
        inventory: input.inventory.filter((item) => item.path !== relative),
      }),
    ).toThrow("REQUIRED")
    const wrong = fixture({ [relative]: { name: "@ewatrade/wrong" } })
    expect(() => apiBuildWorkspaceFilters(wrong)).toThrow("REQUIRED")
  }
})

test("refuses duplicate package names and inventory paths", () => {
  const duplicate = fixture({
    "packages/copy/package.json": { name: "@ewatrade/api" },
  })
  expect(() => apiBuildWorkspaceFilters(duplicate)).toThrow("DUPLICATE_NAME")
  const input = fixture()
  expect(() =>
    apiBuildWorkspaceFilters({
      ...input,
      inventory: [...input.inventory, ...input.inventory],
    }),
  ).toThrow("DUPLICATE_PATH")
})

test("refuses malformed JSON, metadata and dependency types", () => {
  for (const metadata of [
    "{",
    "null",
    "[]",
    { name: 1 },
    { name: "@ewatrade/api", private: "yes" },
    { name: "@ewatrade/api", version: [] },
    { name: "@ewatrade/api", dependencies: null },
    { name: "@ewatrade/api", devDependencies: [] },
    { name: "@ewatrade/api", dependencies: { hono: 4 } },
    { name: "@ewatrade/api", dependencies: { hono: "" } },
    { name: "@ewatrade/api", dependencies: { hono: "4.13.9\n" } },
    { name: "@ewatrade/api", dependencies: { "--filter=**": "workspace:*" } },
  ]) {
    expect(() =>
      apiBuildWorkspaceFilters(fixture({ "apps/api/package.json": metadata })),
    ).toThrow("API_BUILD_WORKSPACE_INVALID_")
  }
})

test("refuses duplicate JSON keys, including escaped keys", () => {
  for (const metadata of [
    '{"name":"wrong","name":"@ewatrade/api"}',
    '{"name":"wrong","\\u006eame":"@ewatrade/api"}',
    '{"name":"@ewatrade/api","dependencies":{"hono":"1","hono":"2"}}',
  ]) {
    expect(() =>
      apiBuildWorkspaceFilters(fixture({ "apps/api/package.json": metadata })),
    ).toThrow("DUPLICATE_JSON_KEY")
  }
})

test("refuses unsafe package names and workspace ranges", () => {
  for (const name of [
    "../api",
    "@ewatrade/api --filter=**",
    "@/api",
    "__proto__",
    "@ewatrade/api\n",
    "@EWATRADE/api",
  ]) {
    expect(() =>
      apiBuildWorkspaceFilters(fixture({ "apps/api/package.json": { name } })),
    ).toThrow("NAME")
  }
  for (const version of [
    "workspace:../outside",
    "workspace:/etc",
    "workspace:**",
    "workspace:",
  ]) {
    expect(() =>
      apiBuildWorkspaceFilters(
        fixture({
          "apps/api/package.json": {
            name: "@ewatrade/api",
            dependencies: { "@ewatrade/db": version },
          },
        }),
      ),
    ).toThrow("WORKSPACE_RANGE")
  }
})

test("refuses escaping inventory paths before reading them", () => {
  const input = fixture()
  const first = input.inventory[0]
  if (!first) throw new Error("Missing fixture inventory")
  for (const relative of [
    "../package.json",
    "/etc/package.json",
    "apps/../api/package.json",
    "apps//api/package.json",
    "packages\\db\\package.json",
    "packages/db/package.json\n",
  ]) {
    expect(() =>
      apiBuildWorkspaceFilters({
        ...input,
        inventory: [{ ...first, path: relative }, ...input.inventory],
      }),
    ).toThrow("PATH")
  }
})

test("refuses workspace directories that can expand or alter filters", () => {
  for (const directory of [
    "*",
    "[email]",
    "{a,b}",
    "--filter=**",
    "email other",
    "email#other",
  ]) {
    expect(() =>
      apiBuildWorkspaceFilters(
        fixture({
          [`packages/${directory}/package.json`]: { name: "@ewatrade/extra" },
        }),
      ),
    ).toThrow("FILTER_PATH")
  }
})

test("refuses manifests changed after snapshot inventory", () => {
  const input = fixture()
  writeFileSync(
    path.join(input.stage, "apps/api/package.json"),
    '{"name":"@ewatrade/apj"}',
  )
  expect(() => apiBuildWorkspaceFilters(input)).toThrow("CHANGED_MANIFEST")
})

test("refuses manifest symlinks and symlinked workspace directories", () => {
  const outside = fixture()
  const input = fixture()
  const filename = path.join(input.stage, "apps/api/package.json")
  rmSync(filename)
  symlinkSync(path.join(outside.stage, "apps/api/package.json"), filename)
  expect(() => apiBuildWorkspaceFilters(input)).toThrow("SYMLINK")
  const directories = fixture()
  const directory = path.join(directories.stage, "packages/db")
  rmSync(directory, { recursive: true })
  symlinkSync(path.join(outside.stage, "packages/db"), directory)
  expect(() => apiBuildWorkspaceFilters(directories)).toThrow("SYMLINK")
})

test("refuses invalid stage and bounded inventory metadata", () => {
  const input = fixture()
  expect(() =>
    apiBuildWorkspaceFilters({ ...input, stage: "relative-stage" }),
  ).toThrow("INPUT")
  for (const metadata of [
    { bytes: 1024 * 1024 + 1 },
    { bytes: -1 },
    { sha256: "not-a-hash" },
    { mode: "120000" },
  ]) {
    const inventory = input.inventory.map((item, index) =>
      index === 0 ? { ...item, ...metadata } : item,
    )
    expect(() =>
      apiBuildWorkspaceFilters({
        ...input,
        inventory: inventory as ApiSourceInventoryFile[],
      }),
    ).toThrow("INVENTORY_METADATA")
  }
})

test("refuses non-UTF8 manifests and excessive JSON nesting", () => {
  expect(() =>
    apiBuildWorkspaceFilters(
      fixture({ "apps/api/package.json": Buffer.from([0xff, 0xff]) }),
    ),
  ).toThrow("ENCODING")
  const nested = `{"name":"@ewatrade/api","data":${"[".repeat(65)}0${"]".repeat(65)}}`
  expect(() =>
    apiBuildWorkspaceFilters(fixture({ "apps/api/package.json": nested })),
  ).toThrow("METADATA_DEPTH")
})
