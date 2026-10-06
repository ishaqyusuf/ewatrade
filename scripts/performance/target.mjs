import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  applyDatabaseProfile,
  databaseTargetsEqual,
} from "../database-profile.mjs"
import { readEnvironmentFile } from "../environment-profile.mjs"

export const performanceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
)
export const performanceTarget = JSON.parse(
  readFileSync(new URL("./target.json", import.meta.url), "utf8"),
)

export function assertPerformanceTarget(
  url,
  protectedUrls,
  target = performanceTarget,
  now = new Date(),
) {
  if (!url || protectedUrls.some((value) => !value))
    throw new Error(
      "Performance and all protected profiles must have explicit database URLs.",
    )
  try {
    const parsed = new URL(url)
    if (
      !["postgres:", "postgresql:"].includes(parsed.protocol) ||
      !parsed.hostname.endsWith(".neon.tech") ||
      parsed.hostname.split(".")[0].replace(/-pooler$/, "") !==
        target.endpoint ||
      decodeURIComponent(parsed.pathname.slice(1)) !== target.database ||
      !["require", "verify-full"].includes(
        parsed.searchParams.get("sslmode"),
      ) ||
      parsed.searchParams.get("options")
    )
      throw new Error()
    if (protectedUrls.some((value) => databaseTargetsEqual(value, url)))
      throw new Error()
    if (
      !Number.isFinite(Date.parse(target.expiresAt)) ||
      now.getTime() >= Date.parse(target.expiresAt)
    )
      throw new Error()
    applyDatabaseProfile(
      { DEV_PROFILE: "dev", EWATRADE_DATABASE_URL: url },
      protectedUrls.at(-1),
    )
  } catch {
    throw new Error(
      "Performance target rejected: verify pinned endpoint/database, expiry, TLS and separation from local/Preview/Production.",
    )
  }
  return url
}

export function loadPerformanceDatabaseUrl(root = performanceRoot) {
  return assertPerformanceTarget(
    readEnvironmentFile(path.join(root, ".env.dev")).EWATRADE_DATABASE_URL,
    ["local", "preview", "production"].map(
      (profile) =>
        readEnvironmentFile(path.join(root, `.env.${profile}`))
          .EWATRADE_DATABASE_URL,
    ),
  )
}
