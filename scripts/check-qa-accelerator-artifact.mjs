import { existsSync, readFileSync, readdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const SCANNED_EXTENSIONS = new Set([".hbc", ".js", ".json"])
const PRODUCTION_MARKERS = [
  "QA ONLY",
  "QA accelerator",
  "Quick Fill",
  "qa+",
  "createQaFixture",
  "QA Test Merchant",
  "qa-access",
  "qa_authorization",
  "QA Domain",
  "tester credential",
  "ewatrade.qa",
]

const PREVIEW_MARKERS = {
  dashboard: ["QA ONLY", "Quick Fill", "qa+"],
  marketing: ["QA ONLY", "Quick Fill", "qa+", "QA Domain"],
  mobile: ["Quick Fill", "qa+", "createQaFixture", "QA Domain"],
}
const EXPECTED_MARKETING_QA_ROUTES = [
  "/api/qa-access/capability/route",
  "/api/qa-access/exchange/route",
  "/api/qa-access/profiles/route",
  "/api/qa-access/revalidate/route",
  "/api/qa-access/revoke/route",
  "/api/qa-access/select/route",
]

function collectFiles(path) {
  if (!existsSync(path))
    throw new Error(`Artifact path does not exist: ${path}`)
  const entries = readdirSync(path, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const entryPath = join(path, entry.name)
    if (entry.isDirectory()) return collectFiles(entryPath)
    return SCANNED_EXTENSIONS.has(extname(entry.name)) ? [entryPath] : []
  })
}

function readArtifact(path) {
  const files = collectFiles(path)
  if (files.length === 0) {
    throw new Error(`Artifact path has no scannable bundles: ${path}`)
  }
  return {
    content: files.map((file) => readFileSync(file)).join("\n"),
    fileCount: files.length,
  }
}

function readMarketingManifest(marketingArtifactPath) {
  const manifestPath = join(
    marketingArtifactPath,
    "server",
    "app-paths-manifest.json",
  )
  if (!existsSync(manifestPath)) {
    throw new Error(`Marketing route manifest is missing: ${manifestPath}`)
  }
  return JSON.parse(readFileSync(manifestPath, "utf8"))
}

function qaMarketingRoutes(manifest) {
  return Object.keys(manifest).filter((route) =>
    route.startsWith("/api/qa-access/"),
  )
}

export function verifyQaAcceleratorArtifacts(input) {
  const artifacts = {
    dashboard: readArtifact(join(input.dashboardArtifactPath, "static")),
    marketing: readArtifact(join(input.marketingArtifactPath, "static")),
    mobile: readArtifact(input.mobileArtifactPath),
  }
  const manifest = readMarketingManifest(input.marketingArtifactPath)
  const routes = qaMarketingRoutes(manifest)

  if (input.mode === "production") {
    for (const [surface, artifact] of Object.entries(artifacts)) {
      const discovered = PRODUCTION_MARKERS.filter((marker) =>
        artifact.content.includes(marker),
      )
      if (discovered.length > 0) {
        throw new Error(
          `${surface} production artifact exposes QA markers: ${discovered.join(", ")}`,
        )
      }
    }
    if (routes.length > 0) {
      throw new Error(
        `Marketing production manifest exposes QA routes: ${routes.join(", ")}`,
      )
    }
  } else if (input.mode === "preview") {
    for (const [surface, required] of Object.entries(PREVIEW_MARKERS)) {
      const missing = required.filter(
        (marker) => !artifacts[surface].content.includes(marker),
      )
      if (missing.length > 0) {
        throw new Error(
          `${surface} preview artifact is missing QA markers: ${missing.join(", ")}`,
        )
      }
    }
    const missingRoutes = EXPECTED_MARKETING_QA_ROUTES.filter(
      (route) => !routes.includes(route),
    )
    const unexpectedRoutes = routes.filter(
      (route) => !EXPECTED_MARKETING_QA_ROUTES.includes(route),
    )
    if (missingRoutes.length > 0 || unexpectedRoutes.length > 0) {
      throw new Error(
        `Marketing preview manifest has the wrong QA routes; missing=${missingRoutes.join(",") || "none"}; unexpected=${unexpectedRoutes.join(",") || "none"}.`,
      )
    }
  } else {
    throw new Error(`Unsupported QA artifact mode: ${input.mode}`)
  }

  return {
    fileCounts: Object.fromEntries(
      Object.entries(artifacts).map(([surface, artifact]) => [
        surface,
        artifact.fileCount,
      ]),
    ),
    marketingQaRouteCount: routes.length,
    mode: input.mode,
  }
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Set ${name} to an artifact directory.`)
  return resolve(value)
}

function main() {
  const result = verifyQaAcceleratorArtifacts({
    dashboardArtifactPath: requiredEnvironment("QA_DASHBOARD_ARTIFACT_DIR"),
    marketingArtifactPath: requiredEnvironment("QA_MARKETING_ARTIFACT_DIR"),
    mobileArtifactPath: requiredEnvironment("QA_MOBILE_ARTIFACT_DIR"),
    mode: process.env.QA_ARTIFACT_MODE?.trim(),
  })
  console.info(
    `QA accelerator ${result.mode} artifact boundary passed: mobile=${result.fileCounts.mobile}, marketing=${result.fileCounts.marketing}, dashboard=${result.fileCounts.dashboard}, marketingRoutes=${result.marketingQaRouteCount}`,
  )
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main()
}
