import fs from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dir, "..")
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
)
const tauriConfig = JSON.parse(
  fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"),
)
const devConfig = JSON.parse(
  fs.readFileSync(path.join(root, "src-tauri", "tauri.dev.conf.json"), "utf8"),
)
const stagingConfig = JSON.parse(
  fs.readFileSync(
    path.join(root, "src-tauri", "tauri.staging.conf.json"),
    "utf8",
  ),
)
const rustLauncher = fs.readFileSync(
  path.join(root, "src-tauri", "src", "lib.rs"),
  "utf8",
)

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

assert(packageJson.name === "@ewatrade/desktop", "Unexpected package name")
assert(tauriConfig.productName === "EwaTrade", "Production name mismatch")
assert(devConfig.productName === "EwaTrade Dev", "Dev name mismatch")
assert(
  stagingConfig.productName === "EwaTrade Staging",
  "Staging name mismatch",
)
assert(
  tauriConfig.identifier === "com.ewatrade.desktop",
  "Production bundle id mismatch",
)
assert(
  rustLauncher.includes("http://localhost:3094"),
  "Development dashboard URL missing",
)
assert(
  rustLauncher.includes("https://dashboard.ewatrade.com"),
  "Production dashboard URL missing",
)
assert(rustLauncher.includes("DASHBOARD_URL"), "DASHBOARD_URL override missing")
assert(
  rustLauncher.includes("WebviewUrl::External"),
  "Wrapper must load the dashboard as an external webview URL",
)

console.log("desktop smoke config ok")
