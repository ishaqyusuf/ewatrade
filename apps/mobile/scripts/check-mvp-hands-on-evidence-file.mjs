import { existsSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"

const evidenceFile = process.argv[2] ?? process.env.MVP_HANDS_ON_EVIDENCE_FILE
const REQUIRED_CONTEXT_FIELDS = [
  "Date",
  "Device or emulator",
  "OS/API target",
  "Viewport",
  "API target host",
  "Storefront target host",
  "QA mode",
  "Tester",
]
const VALID_QA_MODES = new Set(["local", "production"])
const REQUIRED_SECTIONS = [
  "Launch And Auth",
  "First Product And Dashboard",
  "Staff And Sessions",
  "Sale And Customer Book",
  "Offline And Sync",
  "Inventory, Reports, And Subscription",
  "Share Links And Web Checkout",
]
const REQUIRED_SECTION_FIELDS = ["Evidence", "Screenshots or logs", "Notes"]
const REQUIRED_PREFLIGHT_COMMANDS = [
  {
    label: "hands-on checklist",
    outputMarkers: [/Mobile Retail Ops MVP hands-on smoke checklist/],
    pattern: /bun run --cwd apps\/mobile qa:mvp-hands-on-checklist(?::prod)?/,
    productionPattern:
      /bun run --cwd apps\/mobile qa:mvp-hands-on-checklist:prod/,
  },
  {
    label: "live env checklist",
    outputMarkers: [/Mobile Retail Ops MVP live environment checklist/],
    pattern: /bun run --cwd apps\/mobile qa:mvp-live-env-checklist(?::prod)?/,
    productionPattern:
      /bun run --cwd apps\/mobile qa:mvp-live-env-checklist:prod/,
  },
  {
    label: "live readiness",
    outputMarkers: [/Mobile Retail Ops MVP live readiness/],
    pattern: /bun run --cwd apps\/mobile qa:mvp-live-readiness(?::prod)?/,
    productionPattern: /bun run --cwd apps\/mobile qa:mvp-live-readiness:prod/,
    successMarkers: [/Mobile MVP live readiness check passed\./],
  },
  {
    label: "full readiness",
    outputMarkers: [/== Source QA ==/, /== MVP contract tests ==/],
    pattern: /bun run --cwd apps\/mobile qa:mvp-readiness(?::prod)?/,
    productionPattern: /bun run --cwd apps\/mobile qa:mvp-readiness:prod/,
    successMarkers: [/Mobile MVP readiness check passed\./],
  },
]
const BLOCKER_REPORT_PREFLIGHT_COMMAND = {
  label: "live blocker report",
  outputMarkers: [
    /Mobile Retail Ops MVP live environment checklist/,
    /Live checklist report written:/,
  ],
  pattern: /bun run --cwd apps\/mobile qa:mvp-live-blocker-report:prod/,
}
const REQUIRED_RELEASE_GATE_FIELDS = [
  "Google evidence",
  "Shared-link live evidence",
  "Public preview evidence",
  "Browser checkout evidence",
  "Device smoke evidence",
  "Live blocker report",
]
const REQUIRED_RELEASE_GATE_CHECKS = [
  {
    label: "Live Google provider flow",
    pattern: /- \[x\] Live Google provider flow has current evidence\./,
  },
  {
    label: "Live shared-link write/email flow",
    pattern:
      /- \[x\] Live shared-link write\/email flow has current evidence\./,
  },
  {
    label: "Deployed public preview",
    pattern: /- \[x\] Deployed public preview has current evidence\./,
  },
  {
    label: "Browser checkout",
    pattern: /- \[x\] Browser checkout has current evidence\./,
  },
  {
    label: "Full device smoke run",
    pattern: /- \[x\] Full device smoke run has current evidence\./,
  },
]
const REQUIRED_RELEASE_EVIDENCE_MARKERS = [
  {
    field: "Google evidence",
    label: "Google live run command",
    pattern: /qa:google-oauth-live-run(?::prod)?/,
    productionPattern: /qa:google-oauth-live-run:prod/,
  },
  {
    field: "Shared-link live evidence",
    label: "shared-link live run command",
    pattern: /qa:shared-link-live-run(?::prod)?/,
    productionPattern: /qa:shared-link-live-run:prod/,
  },
  {
    field: "Public preview evidence",
    label: "shared-link preview command",
    pattern: /qa:shared-link-preview(?::prod)?/,
    productionPattern: /qa:shared-link-preview:prod/,
  },
  {
    field: "Browser checkout evidence",
    label: "browser checkout command",
    pattern: /qa:shared-link-browser-checkout(?::prod)?/,
    productionPattern: /qa:shared-link-browser-checkout:prod/,
  },
  {
    field: "Device smoke evidence",
    label: "hands-on smoke checklist command or full device smoke note",
    pattern: /qa:mvp-hands-on-checklist(?::prod)?|full device smoke/i,
    modeScopedLabel: "hands-on smoke checklist command",
    modeScopedPattern: /qa:mvp-hands-on-checklist(?::prod)?/i,
    modeScopedProductionPattern: /qa:mvp-hands-on-checklist:prod/i,
  },
]
const REQUIRED_RELEASE_ARTIFACT_MARKERS = [
  {
    field: "Google evidence",
    kind: "json",
    label: "absolute Google live JSON evidence path",
    pattern: /(?:^|\s)\/[^\s]+\.json\b/,
    validate: validateGoogleLiveArtifact,
  },
  {
    field: "Shared-link live evidence",
    kind: "json",
    label: "absolute shared-link live JSON evidence path",
    pattern: /(?:^|\s)\/[^\s]+\.json\b/,
    validate: validateSharedLinkLiveArtifact,
  },
  {
    field: "Public preview evidence",
    kind: "json",
    label: "absolute public preview JSON evidence path",
    pattern: /(?:^|\s)\/[^\s]+\.json\b/,
    validate: validatePublicPreviewArtifact,
  },
  {
    field: "Browser checkout evidence",
    kind: "png",
    label: "absolute browser checkout PNG evidence path",
    pattern: /(?:^|\s)\/[^\s]+\.png\b/,
  },
  {
    field: "Device smoke evidence",
    kind: "device",
    label: "absolute device smoke screenshot or log artifact path",
    pattern: /(?:^|\s)\/[^\s]+\.(?:png|jpe?g|json|xml|md|txt|log)\b/i,
  },
]
const NONE_VALUE_PATTERN = /^none\.?$/i
const BLOCKER_REPORT_COMMAND_PATTERN = /qa:mvp-live-blocker-report:prod/
const PROD_COMMAND_VARIANT_PATTERN = /:prod\b/
const LOCAL_TARGET_HOST_PATTERNS = [
  /\blocalhost\b/i,
  /\b127(?:\.\d{1,3}){3}\b/,
  /\b0\.0\.0\.0\b/,
  /\[::1\]/,
  /(^|[^a-z0-9-])::1([^a-z0-9-]|$)/i,
  /(^|[/:.\s])[\w.-]+\.local(?::|\/|$|\s)/i,
]
const ABSOLUTE_JSON_PATH_PATTERN = /(?:^|\s)\/[^\s]+\.json\b/
const ABSOLUTE_EVIDENCE_ARTIFACT_PATTERN =
  /(?:^|\s)\/[^\s]+\.(?:png|jpe?g|json|xml|md|txt|log)\b/i
const ABSOLUTE_PREFLIGHT_ARTIFACT_PATTERN =
  /(?:^|\s)\/[^\s]+\.(?:json|log|md|txt)\b/i
const LIVE_BLOCKER_REPORT_TYPE = "mobile-retail-ops-live-env-checklist"
const REQUIRED_LIVE_BLOCKER_REPORT_SECTIONS = [
  "Google OAuth",
  "Google OAuth Live API QA",
  "Shared-Link Live Write And Email QA",
  "Shared-Link Public Preview",
  "Shared-Link Browser Checkout",
]
const PRODUCTION_PUBLIC_CONFIGURED_VALUES = {
  EWATRADE_API_URL: "https://ewatrade.com",
  EWATRADE_STOREFRONT_URL: "https://ewatrade.com",
  EXPO_PUBLIC_API_URL: "https://ewatrade.com",
  EXPO_PUBLIC_BASE_URL: "https://ewatrade.com",
  EXPO_PUBLIC_WEB_URL: "https://ewatrade.com",
  NEXT_PUBLIC_API_URL: "https://ewatrade.com",
  NEXT_PUBLIC_APP_URL: "https://ewatrade.com",
  NEXT_PUBLIC_STOREFRONT_URL: "https://ewatrade.com",
}
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff])
const SECRET_PATTERNS = [
  {
    label: "bearer token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/,
  },
  {
    label: "Google ID token env value",
    pattern: /\bEWATRADE_GOOGLE_LIVE_ID_TOKEN\s*=/,
  },
  {
    label: "Google ID token assignment",
    pattern: /\b(?:google_)?id_token["']?\s*[:=]\s*["']?\S+/i,
  },
  {
    label: "owner bearer token env value",
    pattern: /\bEWATRADE_SHARED_LINK_LIVE_OWNER_BEARER_TOKEN\s*=/,
  },
  {
    label: "live share token in URL",
    pattern: /[?&]share=[^\s)]+/,
  },
  {
    label: "password assignment",
    pattern: /\bpassword["']?\s*[:=]\s*["']?\S+/i,
  },
  {
    label: "OTP value",
    pattern: /\bOTP\s*:\s*\d{4,8}\b/i,
  },
]
const failures = []
const preflightEvidence = new Map()
let runContextDate = ""
let isProductionQaMode = false

if (!evidenceFile) {
  failures.push(
    "Set MVP_HANDS_ON_EVIDENCE_FILE or pass the completed evidence note path as the first argument.",
  )
  reportFailures()
}

const resolvedEvidenceFile = resolve(process.cwd(), evidenceFile)

if (!existsSync(resolvedEvidenceFile)) {
  failures.push(`Evidence file does not exist: ${resolvedEvidenceFile}`)
  reportFailures()
}

if (!isRegularFile(resolvedEvidenceFile)) {
  failures.push(`Evidence file path must be a file: ${resolvedEvidenceFile}`)
  reportFailures()
}

const content = readFileSync(resolvedEvidenceFile, "utf8")
const qaMode = getFieldValue(content, "QA mode").toLowerCase()

requireIncludes("# Mobile Retail Ops MVP Hands-On Evidence")
requireIncludes("## Safe Evidence Rules")
requireIncludes("## Preflight Commands")
requireIncludes("## Run Context")
requireIncludes("## Release Gate Summary")

isProductionQaMode = qaMode === "production"

const preflightBody = getSectionBody("Preflight Commands")
if (!preflightBody) {
  failures.push("Missing Preflight Commands section.")
} else if (preflightBody.includes("- [ ]")) {
  failures.push("Preflight Commands still has unchecked commands.")
}
for (const command of REQUIRED_PREFLIGHT_COMMANDS) {
  validatePreflightCommandEvidence({
    command,
    missingMessage: `Preflight Commands must include the ${command.label} command.`,
  })
}

for (const field of REQUIRED_CONTEXT_FIELDS) {
  requireFilledLineField(field)
}
runContextDate = getFieldValue(content, "Date")
validateRunContextDate()
validateQaMode()
validateProductionTargetHosts()

for (const section of REQUIRED_SECTIONS) {
  const sectionBody = getSectionBody(section)

  if (!sectionBody) {
    failures.push(`Missing evidence section: ${section}`)
    continue
  }

  if (sectionBody.includes("- [ ]")) {
    failures.push(`${section} still has unchecked smoke checklist items.`)
  }

  for (const field of REQUIRED_SECTION_FIELDS) {
    requireFilledSectionField({ field, section, sectionBody })
  }

  validateSectionEvidenceArtifact({ section, sectionBody })
}

const releaseGateBody = getSectionBody("Release Gate Summary")
if (!releaseGateBody) {
  failures.push("Missing Release Gate Summary section.")
} else {
  if (releaseGateBody.includes("- [ ]")) {
    failures.push("Release Gate Summary still has unchecked release gates.")
  }

  for (const gate of REQUIRED_RELEASE_GATE_CHECKS) {
    if (!gate.pattern.test(releaseGateBody)) {
      failures.push(
        `Release Gate Summary must include checked ${gate.label} gate.`,
      )
    }
  }

  if (!fieldHasValue(releaseGateBody, "Remaining blockers")) {
    failures.push(
      "Release Gate Summary must state Remaining blockers, even when the value is None.",
    )
  }

  for (const field of REQUIRED_RELEASE_GATE_FIELDS) {
    if (!fieldHasValue(releaseGateBody, field)) {
      failures.push(`Release Gate Summary must include filled ${field}.`)
    }
  }

  for (const marker of REQUIRED_RELEASE_EVIDENCE_MARKERS) {
    const fieldValue = getFieldValue(releaseGateBody, marker.field)

    if (!marker.pattern.test(fieldValue)) {
      failures.push(
        `Release Gate Summary ${marker.field} must reference the ${marker.label}.`,
      )
    }

    if (
      isProductionQaMode &&
      marker.productionPattern &&
      !marker.productionPattern.test(fieldValue)
    ) {
      failures.push(
        `Release Gate Summary ${marker.field} must reference the production ${marker.label} when QA mode is production.`,
      )
    }

    if (
      qaMode === "local" &&
      marker.productionPattern &&
      PROD_COMMAND_VARIANT_PATTERN.test(fieldValue)
    ) {
      failures.push(
        `Release Gate Summary ${marker.field} must reference the default ${marker.label} when QA mode is local.`,
      )
    }

    if (marker.modeScopedPattern?.test(fieldValue)) {
      if (
        isProductionQaMode &&
        !marker.modeScopedProductionPattern.test(fieldValue)
      ) {
        failures.push(
          `Release Gate Summary ${marker.field} must reference the production ${marker.modeScopedLabel} when QA mode is production.`,
        )
      }

      if (qaMode === "local" && PROD_COMMAND_VARIANT_PATTERN.test(fieldValue)) {
        failures.push(
          `Release Gate Summary ${marker.field} must reference the default ${marker.modeScopedLabel} when QA mode is local.`,
        )
      }
    }
  }

  for (const marker of REQUIRED_RELEASE_ARTIFACT_MARKERS) {
    const fieldValue = getFieldValue(releaseGateBody, marker.field)

    if (!marker.pattern.test(fieldValue)) {
      failures.push(
        `Release Gate Summary ${marker.field} must reference the ${marker.label}.`,
      )
      continue
    }

    validateReleaseArtifact({
      field: marker.field,
      kind: marker.kind,
      path: extractAbsolutePath(fieldValue, marker.pattern),
      validate: marker.validate,
    })
  }

  const remainingBlockers = getFieldValue(releaseGateBody, "Remaining blockers")
  const liveBlockerReport = getFieldValue(
    releaseGateBody,
    "Live blocker report",
  )

  if (remainingBlockers && !NONE_VALUE_PATTERN.test(remainingBlockers)) {
    validatePreflightCommandEvidence({
      command: BLOCKER_REPORT_PREFLIGHT_COMMAND,
      missingMessage:
        "Preflight Commands must include the live blocker report command when Remaining blockers is not None.",
    })

    if (!BLOCKER_REPORT_COMMAND_PATTERN.test(liveBlockerReport)) {
      failures.push(
        "Release Gate Summary Live blocker report must reference qa:mvp-live-blocker-report:prod when Remaining blockers is not None.",
      )
    }

    const blockerReportPath = extractAbsoluteJsonPath(liveBlockerReport)

    if (!blockerReportPath) {
      failures.push(
        "Release Gate Summary Live blocker report must reference an absolute blocker JSON report path when Remaining blockers is not None.",
      )
    } else {
      validateLiveBlockerReportPreflightPath(blockerReportPath)
      validateLiveBlockerReport(blockerReportPath)
    }
  } else if (remainingBlockers) {
    if (!NONE_VALUE_PATTERN.test(liveBlockerReport)) {
      failures.push(
        "Release Gate Summary Live blocker report must be None when Remaining blockers is None.",
      )
    }
    requireSuccessfulPreflightArtifact("live readiness")
    requireSuccessfulPreflightArtifact("full readiness")
  }
}

for (const secret of SECRET_PATTERNS) {
  reportSecretMatch({ label: "Evidence file", secret, text: content })
}

reportFailures()
console.log("MVP hands-on evidence file check passed.")

function requireIncludes(marker) {
  if (!content.includes(marker)) {
    failures.push(`Evidence file is missing required marker: ${marker}`)
  }
}

function requireFilledLineField(field) {
  const pattern = new RegExp(
    `^- ${escapeRegExp(field)}:[^\\S\\r\\n]*(.*)$`,
    "m",
  )
  const match = content.match(pattern)

  if (!match) {
    failures.push(`Run Context is missing ${field}.`)
    return
  }

  if (!match[1]?.trim()) {
    failures.push(`Run Context field ${field} must be filled.`)
  }
}

function getSectionBody(section) {
  const sectionHeader = `## ${section}`
  const sectionStart = content.indexOf(sectionHeader)

  if (sectionStart === -1) return ""

  const bodyStart = sectionStart + sectionHeader.length
  const nextSectionStart = content.indexOf("\n## ", bodyStart)

  return content
    .slice(bodyStart, nextSectionStart === -1 ? undefined : nextSectionStart)
    .trim()
}

function requireFilledSectionField({ field, section, sectionBody }) {
  if (!fieldHasValue(sectionBody, field)) {
    failures.push(`${section} must include filled ${field}.`)
  }
}

function fieldHasValue(sectionBody, field) {
  return Boolean(getFieldValue(sectionBody, field))
}

function getFieldValue(sectionBody, field) {
  const lines = sectionBody.split("\n")
  const label = `- ${field}:`
  const labelIndex = lines.findIndex((line) =>
    line.trimStart().startsWith(label),
  )

  if (labelIndex === -1) return ""

  const sameLineValue = lines[labelIndex].slice(
    lines[labelIndex].indexOf(":") + 1,
  )
  if (sameLineValue.trim()) return sameLineValue.trim()

  const continuationLines = []
  for (let index = labelIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) continue
    if (trimmed.startsWith("- [")) break
    if (trimmed.startsWith("- ") && trimmed.endsWith(":")) break
    if (trimmed.startsWith("## ")) break

    continuationLines.push(trimmed)
  }

  return continuationLines.join("\n").trim()
}

function extractAbsoluteJsonPath(value) {
  return value.match(ABSOLUTE_JSON_PATH_PATTERN)?.[0]?.trim() ?? ""
}

function extractAbsolutePath(value, pattern) {
  return value.match(pattern)?.[0]?.trim() ?? ""
}

function getMatchingLine(sectionBody, pattern) {
  return sectionBody.split("\n").find((line) => pattern.test(line)) ?? ""
}

function validatePreflightCommandEvidence({ command, missingMessage }) {
  const preflightLine = getMatchingLine(preflightBody, command.pattern)

  if (!preflightLine) {
    failures.push(missingMessage)
    return
  }

  if (
    isProductionQaMode &&
    command.productionPattern &&
    !command.productionPattern.test(preflightLine)
  ) {
    failures.push(
      `Preflight Commands ${command.label} command must use the :prod variant when QA mode is production.`,
    )
  }

  if (qaMode === "local" && PROD_COMMAND_VARIANT_PATTERN.test(preflightLine)) {
    failures.push(
      `Preflight Commands ${command.label} command must use the default variant when QA mode is local.`,
    )
  }

  const artifact = validatePreflightEvidenceArtifact({
    command,
    preflightLine,
  })

  if (artifact) {
    preflightEvidence.set(command.label, artifact)
  }
}

function validatePreflightEvidenceArtifact({ command, preflightLine }) {
  const artifactPath = extractAbsolutePath(
    preflightLine,
    ABSOLUTE_PREFLIGHT_ARTIFACT_PATTERN,
  )

  if (!artifactPath) {
    failures.push(
      `Preflight Commands ${command.label} command must reference an absolute log or report artifact path.`,
    )
    return null
  }

  const artifact = validateEvidenceArtifactFile({
    label: `Preflight Commands ${command.label}`,
    path: artifactPath,
  })
  if (!artifact) return null

  const artifactText = artifact.toString("utf8")
  const missingOutputMarkers = command.outputMarkers.filter(
    (marker) => !marker.test(artifactText),
  )

  if (missingOutputMarkers.length > 0) {
    failures.push(
      `Preflight Commands ${command.label} artifact must contain output from the matching command.`,
    )
  }

  return {
    command,
    content: artifactText,
    path: artifactPath,
  }
}

function requireSuccessfulPreflightArtifact(label) {
  const artifact = preflightEvidence.get(label)
  const successMarkers = artifact?.command.successMarkers ?? []

  if (!artifact || successMarkers.length === 0) return

  const hasSuccessMarker = successMarkers.some((marker) =>
    marker.test(artifact.content),
  )

  if (!hasSuccessMarker) {
    failures.push(
      `Preflight Commands ${label} artifact must show the command passed when Remaining blockers is None.`,
    )
  }
}

function validateSectionEvidenceArtifact({ section, sectionBody }) {
  const fieldValue = getFieldValue(sectionBody, "Screenshots or logs")
  if (!fieldValue) return

  const artifactPath = extractAbsolutePath(
    fieldValue,
    ABSOLUTE_EVIDENCE_ARTIFACT_PATTERN,
  )

  if (!artifactPath) {
    failures.push(
      `${section} Screenshots or logs must reference an absolute screenshot or log artifact path.`,
    )
    return
  }

  validateEvidenceArtifactFile({
    label: `${section} Screenshots or logs`,
    path: artifactPath,
  })
}

function validateReleaseArtifact({ field, kind, path, validate }) {
  if (!path) {
    failures.push(
      `Release Gate Summary ${field} artifact path does not exist: ${path}`,
    )
    return
  }

  if (
    !validateRegularEvidenceFile({
      label: `Release Gate Summary ${field} artifact`,
      missingMessage: `Release Gate Summary ${field} artifact path does not exist: ${path}`,
      path,
    })
  ) {
    return
  }

  if (kind === "json") {
    const artifactText = readFileSync(path, "utf8")
    scanTextForSecrets({
      label: `Release Gate Summary ${field} artifact`,
      text: artifactText,
    })

    let artifact
    try {
      artifact = JSON.parse(artifactText)
    } catch {
      failures.push(
        `Release Gate Summary ${field} artifact file must be valid JSON: ${path}`,
      )
      return
    }

    if (validate) {
      validate({ artifact, field, path })
    }
    validateArtifactCheckedAtDate({ artifact, field })
    return
  }

  if (kind === "png") {
    const screenshot = readFileSync(path)

    if (!hasPngSignature(screenshot)) {
      failures.push(
        `Release Gate Summary ${field} artifact file must be a valid PNG: ${path}`,
      )
    }
    return
  }

  if (kind === "device") {
    validateDeviceSmokeArtifact({ field, path })
  }
}

function validateDeviceSmokeArtifact({ field, path }) {
  validateEvidenceArtifactFile({
    label: `Release Gate Summary ${field}`,
    path,
  })
}

function validateRunContextDate() {
  if (!runContextDate) return

  if (!/^\d{4}-\d{2}-\d{2}$/.test(runContextDate)) {
    failures.push(
      "Run Context field Date must use YYYY-MM-DD so release evidence can be matched to the QA run.",
    )
  }
}

function validateQaMode() {
  if (!qaMode) return

  if (!VALID_QA_MODES.has(qaMode)) {
    failures.push(
      "Run Context field QA mode must be either local or production.",
    )
  }
}

function validateProductionTargetHosts() {
  if (!isProductionQaMode) return

  for (const field of ["API target host", "Storefront target host"]) {
    const fieldValue = getFieldValue(content, field)

    if (isLocalTargetHost(fieldValue)) {
      failures.push(
        `Run Context field ${field} must not use a local host when QA mode is production.`,
      )
    }
  }
}

function isLocalTargetHost(value) {
  return LOCAL_TARGET_HOST_PATTERNS.some((pattern) => pattern.test(value))
}

function validateArtifactCheckedAtDate({ artifact, field }) {
  if (!runContextDate || !/^\d{4}-\d{2}-\d{2}$/.test(runContextDate)) return

  if (typeof artifact?.checkedAt !== "string") {
    failures.push(
      `Release Gate Summary ${field} artifact must include checkedAt so it can be matched to the QA run date.`,
    )
    return
  }

  const checkedAtDate = artifact.checkedAt.slice(0, 10)
  if (checkedAtDate !== runContextDate) {
    failures.push(
      `Release Gate Summary ${field} artifact checkedAt date must match Run Context Date ${runContextDate}.`,
    )
  }
}

function validateEvidenceArtifactFile({ label, path }) {
  if (
    !validateRegularEvidenceFile({
      label: `${label} artifact`,
      missingMessage: `${label} artifact path does not exist: ${path}`,
      path,
    })
  ) {
    return null
  }

  const artifact = readFileSync(path)

  if (artifact.length === 0) {
    failures.push(`${label} artifact file must not be empty: ${path}`)
    return null
  }

  if (path.toLowerCase().endsWith(".png") && !hasPngSignature(artifact)) {
    failures.push(`${label} PNG artifact file must be a valid PNG: ${path}`)
    return null
  }

  if (isJpegPath(path) && !hasJpegSignature(artifact)) {
    failures.push(`${label} JPEG artifact file must be a valid JPEG: ${path}`)
    return null
  }

  if (path.toLowerCase().endsWith(".json")) {
    try {
      JSON.parse(artifact.toString("utf8"))
    } catch {
      failures.push(`${label} JSON artifact file must be valid JSON: ${path}`)
      return null
    }
  }

  if (isTextEvidenceArtifact(path)) {
    scanTextForSecrets({
      label: `${label} artifact`,
      text: artifact.toString("utf8"),
    })
  }

  return artifact
}

function isTextEvidenceArtifact(path) {
  return /\.(?:json|log|md|txt|xml)$/i.test(path)
}

function isRegularFile(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function validateRegularEvidenceFile({ label, missingMessage, path }) {
  if (!existsSync(path)) {
    failures.push(missingMessage)
    return false
  }

  if (!isRegularFile(path)) {
    failures.push(`${label} path must be a file: ${path}`)
    return false
  }

  return true
}

function scanTextForSecrets({ label, text }) {
  for (const secret of SECRET_PATTERNS) {
    reportSecretMatch({ label, secret, text })
  }
}

function reportSecretMatch({ label, secret, text }) {
  if (secret.pattern.test(text)) {
    failures.push(`${label} appears to contain a secret: ${secret.label}.`)
  }
}

function hasPngSignature(fileBuffer) {
  return (
    fileBuffer.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((byte, index) => fileBuffer[index] === byte)
  )
}

function hasJpegSignature(fileBuffer) {
  return (
    fileBuffer.length >= JPEG_SIGNATURE.length &&
    JPEG_SIGNATURE.every((byte, index) => fileBuffer[index] === byte)
  )
}

function isJpegPath(path) {
  return /\.jpe?g$/i.test(path)
}

function validateGoogleLiveArtifact({ artifact, field }) {
  const missingMarkers = []

  if (artifact?.verification !== "auth.verifyMobileGoogle") {
    missingMarkers.push("verification auth.verifyMobileGoogle")
  }

  if (artifact?.profile?.businessContextVerified !== true) {
    missingMarkers.push("profile business context")
  }

  if (artifact?.profile?.emailMatched !== true) {
    missingMarkers.push("profile email match")
  }

  if (artifact?.session?.bearerTokenReturned !== true) {
    missingMarkers.push("returned bearer session proof")
  }

  if (artifact?.tenant?.idMatchesProfile !== true) {
    missingMarkers.push("tenant/profile alignment")
  }

  reportMissingArtifactMarkers(field, missingMarkers)
}

function validateSharedLinkLiveArtifact({ artifact, field }) {
  const missingMarkers = []

  if (artifact?.publicPage?.fetched !== true) {
    missingMarkers.push("public page fetch")
  }

  if (artifact?.publicPage?.metadataVerified !== true) {
    missingMarkers.push("public page metadata")
  }

  if (artifact?.order?.requested !== true) {
    missingMarkers.push("order request creation")
  }

  if (artifact?.notification?.verified !== true) {
    missingMarkers.push("notification dispatch")
  }

  if (artifact?.followUp?.recorded !== true) {
    missingMarkers.push("follow-up recording")
  }

  if (artifact?.shareLink?.deactivated !== true) {
    missingMarkers.push("share-link deactivation")
  }

  reportMissingArtifactMarkers(field, missingMarkers)
}

function validatePublicPreviewArtifact({ artifact, field }) {
  const missingMarkers = []

  if (artifact?.checkoutHtmlVerified !== true) {
    missingMarkers.push("checkout HTML hooks")
  }

  if (artifact?.metadata?.openGraphVerified !== true) {
    missingMarkers.push("Open Graph metadata")
  }

  if (artifact?.metadata?.twitterVerified !== true) {
    missingMarkers.push("Twitter metadata")
  }

  if (artifact?.metadata?.openGraphImageAltVerified !== true) {
    missingMarkers.push("Open Graph image alt")
  }

  if (artifact?.metadata?.twitterImageAltVerified !== true) {
    missingMarkers.push("Twitter image alt")
  }

  if (artifact?.imageFetch?.openGraph !== true) {
    missingMarkers.push("Open Graph image fetch")
  }

  if (artifact?.imageFetch?.twitter !== true) {
    missingMarkers.push("Twitter image fetch")
  }

  if (
    typeof artifact?.userAgent !== "string" ||
    !artifact.userAgent.includes("WhatsApp")
  ) {
    missingMarkers.push("WhatsApp-style preview user agent")
  }

  reportMissingArtifactMarkers(field, missingMarkers)
}

function reportMissingArtifactMarkers(field, missingMarkers) {
  if (missingMarkers.length === 0) return

  failures.push(
    `Release Gate Summary ${field} artifact is missing required proof markers: ${missingMarkers.join(
      ", ",
    )}.`,
  )
}

function validateLiveBlockerReport(reportPath) {
  if (
    !validateRegularEvidenceFile({
      label: "Release Gate Summary Live blocker report",
      missingMessage: `Release Gate Summary Live blocker report path does not exist: ${reportPath}`,
      path: reportPath,
    })
  ) {
    return
  }

  let report
  const reportText = readFileSync(reportPath, "utf8")
  scanTextForSecrets({
    label: "Release Gate Summary Live blocker report",
    text: reportText,
  })

  try {
    report = JSON.parse(reportText)
  } catch {
    failures.push(
      `Release Gate Summary Live blocker report must be valid JSON: ${reportPath}`,
    )
    return
  }

  if (report?.reportType !== LIVE_BLOCKER_REPORT_TYPE) {
    failures.push(
      `Release Gate Summary Live blocker report must have reportType ${LIVE_BLOCKER_REPORT_TYPE}.`,
    )
  }

  if (
    !Array.isArray(report?.missingRequired) ||
    report.missingRequired.length === 0
  ) {
    failures.push(
      "Release Gate Summary Live blocker report must include missingRequired rows when Remaining blockers is not None.",
    )
  } else {
    validateLiveBlockerReportMissingCount(report)
  }

  validateBlockerReportGeneratedAt(report)
  validateLiveBlockerReportSections(report)
  validateLiveBlockerReportMissingSectionItems(report)

  if (isProductionQaMode) {
    validateLiveBlockerReportProductionTarget(report)
    validateLiveBlockerReportPublicConfiguredValues(report)
  }
}

function validateLiveBlockerReportMissingCount(report) {
  if (report?.missingRequiredCount !== report.missingRequired.length) {
    failures.push(
      "Release Gate Summary Live blocker report missingRequiredCount must match missingRequired rows.",
    )
  }
}

function validateLiveBlockerReportSections(report) {
  if (!Array.isArray(report?.sections)) {
    failures.push(
      "Release Gate Summary Live blocker report must include checklist section rows.",
    )
    return
  }

  for (const title of REQUIRED_LIVE_BLOCKER_REPORT_SECTIONS) {
    const section = report.sections.find((row) => row?.title === title)
    if (
      !section ||
      !Array.isArray(section.items) ||
      section.items.length === 0
    ) {
      failures.push(
        `Release Gate Summary Live blocker report must include checklist section ${title}.`,
      )
    }
  }
}

function validateLiveBlockerReportMissingSectionItems(report) {
  if (
    !Array.isArray(report?.missingRequired) ||
    !Array.isArray(report?.sections)
  ) {
    return
  }

  for (const missingItem of report.missingRequired) {
    const sectionTitle = missingItem?.section
    const label = missingItem?.label
    const keys = normalizeKeys(missingItem?.keys)

    if (
      typeof sectionTitle !== "string" ||
      typeof label !== "string" ||
      keys.length === 0
    ) {
      failures.push(
        "Release Gate Summary Live blocker report missingRequired rows must include section, label, and keys.",
      )
      continue
    }

    const section = report.sections.find((row) => row?.title === sectionTitle)
    const matchingItem = section?.items?.find(
      (item) =>
        item?.label === label &&
        item?.status === "missing" &&
        haveSameKeys(item?.keys, keys),
    )

    if (!matchingItem) {
      failures.push(
        `Release Gate Summary Live blocker report missingRequired row must match a missing item in checklist section ${sectionTitle}: ${label}.`,
      )
    }
  }
}

function haveSameKeys(leftKeys, rightKeys) {
  const left = normalizeKeys(leftKeys)
  const right = normalizeKeys(rightKeys)

  return (
    left.length === right.length &&
    left.every((key, index) => key === right[index])
  )
}

function normalizeKeys(keys) {
  if (!Array.isArray(keys)) return []

  return keys
    .filter((key) => typeof key === "string" && key.trim().length > 0)
    .map((key) => key.trim())
    .sort()
}

function validateLiveBlockerReportPreflightPath(blockerReportPath) {
  const artifact = preflightEvidence.get(BLOCKER_REPORT_PREFLIGHT_COMMAND.label)
  if (!artifact) return

  if (
    !artifact.content.includes(
      `Live checklist report written: ${blockerReportPath}`,
    )
  ) {
    failures.push(
      "Preflight Commands live blocker report artifact must show the same blocker JSON path referenced in Release Gate Summary.",
    )
  }
}

function validateBlockerReportGeneratedAt(report) {
  if (!runContextDate || !/^\d{4}-\d{2}-\d{2}$/.test(runContextDate)) return

  if (typeof report?.generatedAt !== "string") {
    failures.push(
      "Release Gate Summary Live blocker report must include generatedAt so it can be matched to the QA run date.",
    )
    return
  }

  const generatedAtDate = report.generatedAt.slice(0, 10)
  if (generatedAtDate !== runContextDate) {
    failures.push(
      `Release Gate Summary Live blocker report generatedAt date must match Run Context Date ${runContextDate}.`,
    )
  }
}

function validateLiveBlockerReportProductionTarget(report) {
  if (report?.isProductionEnvTarget !== true) {
    failures.push(
      "Release Gate Summary Live blocker report must be generated from the production env target.",
    )
  }
}

function validateLiveBlockerReportPublicConfiguredValues(report) {
  for (const [key, expectedValue] of Object.entries(
    PRODUCTION_PUBLIC_CONFIGURED_VALUES,
  )) {
    if (report?.publicConfiguredValues?.[key] !== expectedValue) {
      failures.push(
        `Release Gate Summary Live blocker report publicConfiguredValues must include ${key}=${expectedValue} for production QA.`,
      )
    }
  }
}

function reportFailures() {
  if (failures.length === 0) return

  console.error("MVP hands-on evidence file check failed.")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
