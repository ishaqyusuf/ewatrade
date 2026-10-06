// These deployment JSON shapes and `api --method GET --raw` are reviewed against
// this CLI version. Keep every Vercel step in the deploy wrappers on the same pin.
export const RELEASE_VERCEL_CLI = "vercel@54.4.1"
export const EWATRADE_VERCEL_API_TARGET = Object.freeze({
  projectId: "prj_ykC8ltJlPgEuFN90CQhFpC5uC3Vh",
  teamId: "team_BV5rgKHJH4fMyFL1YfscZIZK",
})

const deploymentIdPattern = /^dpl_[A-Za-z0-9]{1,128}$/
const projectIdPattern = /^prj_[A-Za-z0-9]{1,128}$/
const teamIdPattern = /^team_[A-Za-z0-9]{1,128}$/
const maxJsonLength = 1024 * 1024
const maxTimestamp = 8_640_000_000_000_000

function fail(reason) {
  // Neither CLI output nor provider records are safe diagnostic material.
  throw new Error(`VERCEL_DEPLOYMENT_${reason}`)
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function safeId(value, pattern) {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    !pattern.test(value)
  )
    fail("INVALID_ID")
  return value
}

function safeUrl(value) {
  if (typeof value !== "string") fail("INVALID_URL")
  const host = value.startsWith("https://") ? value.slice(8) : value
  if (
    host.length > 253 ||
    /[^a-z0-9.-]/.test(host) ||
    !host.endsWith(".vercel.app") ||
    host === "vercel.app" ||
    !host
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    fail("INVALID_URL")
  return `https://${host}`
}

function assertUniqueJsonKeys(output) {
  // JSON.parse silently chooses the last duplicate key. The CLI serializes
  // objects with JSON.stringify, so duplicates are never a legitimate shape.
  const tokens = output.match(/"(?:[^"\\]|\\.)*"|[{}[\],:]|[^\s{}[\],:]+/g)
  const containers = []
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (token === "{") containers.push(new Set())
    else if (token === "[") containers.push(null)
    else if (token === "}" || token === "]") containers.pop()
    else if (token.startsWith('"') && tokens[index + 1] === ":") {
      const keys = containers.at(-1)
      const key = JSON.parse(token)
      if (keys.has(key)) fail("AMBIGUOUS_OUTPUT")
      keys.add(key)
    }
  }
}

/** Parse only the pinned CLI's direct deployment or single deployment wrapper. */
export function parseVercelDeploymentOutput(output) {
  if (typeof output !== "string" || output.length > maxJsonLength)
    fail("INVALID_OUTPUT")
  let parsed
  try {
    parsed = JSON.parse(output)
  } catch {
    fail("INVALID_OUTPUT")
  }
  if (!record(parsed)) fail("INVALID_OUTPUT")
  assertUniqueJsonKeys(output)
  if (
    Object.hasOwn(parsed, "error") ||
    (Object.hasOwn(parsed, "status") && parsed.status !== "ok")
  )
    fail("FAILED_OUTPUT")

  let deployment = parsed
  if (Object.hasOwn(parsed, "deployment")) {
    // Two identity locations are ambiguous, even if their values happen to agree.
    if (Object.hasOwn(parsed, "id") || Object.hasOwn(parsed, "url"))
      fail("AMBIGUOUS_OUTPUT")
    deployment = parsed.deployment
  }
  if (!record(deployment) || Object.hasOwn(deployment, "deployment"))
    fail("INVALID_OUTPUT")
  if (Object.hasOwn(deployment, "error")) fail("FAILED_OUTPUT")
  return Object.freeze({
    id: safeId(deployment.id, deploymentIdPattern),
    url: safeUrl(deployment.url),
  })
}

function lifecycleTimestamp(value, now) {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > maxTimestamp ||
    value > now
  )
    fail("INVALID_LIFECYCLE")
  return value
}

/** Validate a separately fetched provider record, returning only safe identity. */
export function assertOwnedVercelDeployment(raw, expected, now = Date.now()) {
  if (!record(raw) || !record(expected)) fail("INVALID_RECORD")
  const id = safeId(expected.id, deploymentIdPattern)
  const projectId = safeId(expected.projectId, projectIdPattern)
  const teamId = safeId(expected.teamId, teamIdPattern)
  const url = safeUrl(expected.url)
  if (!["production", "preview"].includes(expected.environment))
    fail("INVALID_ENVIRONMENT")
  if (raw.id !== id || raw.projectId !== projectId || raw.ownerId !== teamId)
    fail("OWNERSHIP_MISMATCH")
  const target = expected.environment === "production" ? "production" : null
  if (raw.target !== target) fail("ENVIRONMENT_MISMATCH")
  if (raw.readyState !== "READY" || raw.deletedAt != null) fail("NOT_READY")
  if (safeUrl(raw.url) !== url) fail("URL_MISMATCH")
  if (!Number.isSafeInteger(now) || now <= 0 || now > maxTimestamp)
    fail("INVALID_LIFECYCLE")
  const createdAt = lifecycleTimestamp(raw.createdAt, now)
  const readyAt = lifecycleTimestamp(raw.ready, now)
  if (readyAt < createdAt) fail("INVALID_LIFECYCLE")
  if (raw.buildingAt != null) {
    const buildingAt = lifecycleTimestamp(raw.buildingAt, now)
    if (buildingAt < createdAt || buildingAt > readyAt)
      fail("INVALID_LIFECYCLE")
  }
  // This proves identity, ownership and Ready chronology. It says nothing about
  // the uploaded source bytes, commit, credentials, or a trusted release receipt.
  return Object.freeze({
    id,
    url,
    projectId,
    teamId,
    environment: expected.environment,
    createdAt,
    readyAt,
  })
}
