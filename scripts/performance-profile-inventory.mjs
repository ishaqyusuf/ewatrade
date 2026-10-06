import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  applyDatabaseProfile,
  databaseTargetsEqual,
} from "./database-profile.mjs"
import {
  ENVIRONMENT_FILE_BY_PROFILE,
  readEnvironmentFile,
} from "./environment-profile.mjs"

// Configuration inspection only: no connections, process-env fallback or writes.
// Target group names are local to this report, not persistent database identities.
export function inspectPerformanceProfiles(repoRoot) {
  const profiles = Object.entries(ENVIRONMENT_FILE_BY_PROFILE).map(
    ([profile, file]) => {
      const filePath = path.join(repoRoot, file)
      if (!existsSync(filePath))
        return { profile, file, status: "missing-file" }
      try {
        const url = readEnvironmentFile(filePath).EWATRADE_DATABASE_URL?.trim()
        if (!url) return { profile, file, status: "missing-url" }
        const parsed = new URL(url)
        if (
          !["postgres:", "postgresql:"].includes(parsed.protocol) ||
          !parsed.hostname ||
          !parsed.pathname ||
          parsed.pathname === "/"
        ) {
          return { profile, file, status: "invalid-url" }
        }
        return { profile, file, status: "configured", url, parsed }
      } catch {
        // Never include parser errors: they may echo a credential-bearing URL.
        return { profile, file, status: "invalid-url" }
      }
    },
  )
  const productionUrl = profiles.find((p) => p.profile === "production")?.url
  const groups = []
  const results = profiles.map(({ profile, file, status, url, parsed }) => {
    if (!url) return { profile, file, status }
    let group = groups.find((entry) => databaseTargetsEqual(entry.url, url))
    if (!group) {
      group = { url, id: `target-${groups.length + 1}`, profiles: [] }
      groups.push(group)
    }
    group.profiles.push(profile)
    let guard = "passed"
    try {
      applyDatabaseProfile(
        { DEV_PROFILE: profile, EWATRADE_DATABASE_URL: url },
        productionUrl,
      )
    } catch {
      guard = "rejected"
    }
    return {
      profile,
      file,
      status,
      targetGroup: group.id,
      pooled:
        parsed.hostname.endsWith(".neon.tech") &&
        parsed.hostname.split(".")[0].endsWith("-pooler"),
      guard,
    }
  })
  return {
    schemaVersion: 1,
    evidence: "local-profile-configuration-only",
    deployedTargetsVerified: false,
    profiles: results,
    sharedTargets: groups
      .filter((group) => group.profiles.length > 1)
      .map(({ id, profiles }) => ({ targetGroup: id, profiles })),
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length > 2) {
    console.error("Usage: node scripts/performance-profile-inventory.mjs")
    process.exitCode = 1
  } else {
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    )
    console.log(JSON.stringify(inspectPerformanceProfiles(repoRoot), null, 2))
  }
}
