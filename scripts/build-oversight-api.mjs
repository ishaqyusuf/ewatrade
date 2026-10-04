import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
const root = resolve(import.meta.dirname, "..")
const temp = await mkdtemp(join(tmpdir(), "oversight-prisma-"))
try {
  const config = join(temp, "prisma.config.ts")
  await writeFile(
    config,
    `export default ${JSON.stringify({ schema: join(root, "packages/db/prisma"), datasource: { url: "postgresql://build:build@localhost:5432/build" } })}`,
  )
  const generated = spawnSync(
    "bunx",
    ["prisma", "generate", "--config", config],
    { cwd: join(root, "packages/db"), stdio: "inherit" },
  )
  if (generated.status !== 0) throw new Error("Prisma generation failed")
  const bundled = spawnSync(
    "bun",
    [
      "build",
      join(root, "apps/oversight-api/src/service.ts"),
      "--target=node",
      "--format=esm",
      "--outfile",
      join(root, "apps/oversight-api/src/bundle.js"),
    ],
    { cwd: root, stdio: "inherit" },
  )
  if (bundled.status !== 0) throw new Error("Read-service bundling failed")
} finally {
  await rm(temp, { recursive: true, force: true })
}
