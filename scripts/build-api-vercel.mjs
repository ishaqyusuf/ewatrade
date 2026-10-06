import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Mirror the existing isolated Preview deploy bundle inside Vercel's disposable
// checkout. Never rewrite source in an ordinary development checkout.
if (process.env.VERCEL !== "1") {
  throw new Error("This build helper requires a disposable Vercel checkout.")
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
function run(args) {
  const result = spawnSync("bun", args, { cwd: root, stdio: "inherit" })
  if (result.error || result.status !== 0) {
    throw new Error(`API build step failed: ${args[0]}`)
  }
}
run(["run", "--cwd", "packages/db", "db:generate"])
run([
  "build",
  "--target=bun",
  "--packages=bundle",
  "--env=disable",
  "--outfile=apps/api/src/bundle.js",
  "apps/api/src/index.ts",
])
const configPath = resolve(root, "apps/api/tsconfig.json")
const config = JSON.parse(readFileSync(configPath, "utf8"))
config.compilerOptions = { ...config.compilerOptions, noCheck: true }
// Vercel needs to compile only the generated forwarding entry, not the source graph.
config.include = ["src/index.ts"]
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
writeFileSync(
  resolve(root, "apps/api/src/index.ts"),
  'import { Hono } from "hono"\nimport bundledApp from "./bundle.js"\nconst app = new Hono()\napp.all("*", (context) => bundledApp.fetch(context.req.raw))\nexport default app\n',
)
