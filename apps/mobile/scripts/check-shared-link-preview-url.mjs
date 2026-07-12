import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const ENV_FILE =
  process.env.SHARED_LINK_PREVIEW_ENV_FILE ?? join(REPO_ROOT, ".env")
const EXAMPLE_ENV_FILE =
  process.env.SHARED_LINK_PREVIEW_EXAMPLE_ENV_FILE ??
  join(REPO_ROOT, ".env.example")
const REQUIRED_EXAMPLE_KEYS = [
  "EWATRADE_SHARED_LINK_PREVIEW_URL",
  "EWATRADE_SHARED_LINK_PREVIEW_EXPECTED_HOST",
  "EWATRADE_SHARED_LINK_PREVIEW_EXPECTED_PRODUCT_NAME",
  "EWATRADE_SHARED_LINK_PREVIEW_EXPECTED_BUSINESS_NAME",
  "EWATRADE_SHARED_LINK_PREVIEW_EVIDENCE_PATH",
  "EWATRADE_SHARED_LINK_PREVIEW_ALLOW_LOCALHOST",
]
const USER_AGENT = "WhatsApp/2.24 EwaTrade-Mobile-Retail-Ops-Preview-QA/1.0"

loadEnvFile(ENV_FILE)

try {
  await main()
} catch (error) {
  console.error("Shared-link public preview URL check failed.")
  console.error(
    "Configure an existing deployed product share URL, then rerun this check before release.",
  )
  console.error(`- ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

async function main() {
  assertExampleEnvKeys()

  const previewUrl = process.env.EWATRADE_SHARED_LINK_PREVIEW_URL?.trim()
  const expectedHost =
    process.env.EWATRADE_SHARED_LINK_PREVIEW_EXPECTED_HOST?.trim().toLowerCase()
  const expectedProductName =
    process.env.EWATRADE_SHARED_LINK_PREVIEW_EXPECTED_PRODUCT_NAME?.trim()
  const expectedBusinessName =
    process.env.EWATRADE_SHARED_LINK_PREVIEW_EXPECTED_BUSINESS_NAME?.trim()
  const evidencePath =
    process.env.EWATRADE_SHARED_LINK_PREVIEW_EVIDENCE_PATH?.trim()
  const allowLocalhost =
    process.env.EWATRADE_SHARED_LINK_PREVIEW_ALLOW_LOCALHOST === "1"
  const setupFailures = []

  if (!previewUrl) {
    setupFailures.push("EWATRADE_SHARED_LINK_PREVIEW_URL is required.")
  }

  if (!evidencePath) {
    setupFailures.push(
      "EWATRADE_SHARED_LINK_PREVIEW_EVIDENCE_PATH is required.",
    )
  } else {
    validateEvidencePath(evidencePath)
  }

  if (setupFailures.length > 0) {
    throw new Error(setupFailures.join("\n- "))
  }

  const evidence = await assertSharedLinkPreview({
    allowLocalhost,
    expectedBusinessName,
    expectedHost,
    expectedProductName,
    rawUrl: previewUrl,
  })

  writePreviewEvidence(evidencePath, evidence)
  console.log("Shared-link public preview URL check passed.")
}

function assertExampleEnvKeys() {
  if (!existsSync(EXAMPLE_ENV_FILE)) {
    throw new Error("Missing repo .env.example file.")
  }

  const exampleEnv = readEnvFile(EXAMPLE_ENV_FILE)
  const missingExampleKeys = REQUIRED_EXAMPLE_KEYS.filter(
    (key) => !(key in exampleEnv),
  )

  if (missingExampleKeys.length > 0) {
    throw new Error(
      `.env.example is missing documented shared-link preview keys: ${missingExampleKeys.join(
        ", ",
      )}.`,
    )
  }
}

async function assertSharedLinkPreview(input) {
  const pageUrl = requireAbsoluteUrl(
    input.rawUrl,
    "EWATRADE_SHARED_LINK_PREVIEW_URL",
  )

  assertPublicUrl(pageUrl, input.allowLocalhost)

  if (
    input.expectedHost &&
    pageUrl.hostname.toLowerCase() !== input.expectedHost
  ) {
    throw new Error(
      `EWATRADE_SHARED_LINK_PREVIEW_URL host ${pageUrl.hostname} did not match EWATRADE_SHARED_LINK_PREVIEW_EXPECTED_HOST ${input.expectedHost}.`,
    )
  }

  if (!pageUrl.pathname.startsWith("/p/")) {
    throw new Error("Shared-link preview URL must use the /p/ product path.")
  }

  if (!pageUrl.searchParams.get("share")) {
    throw new Error("Shared-link preview URL must include the share token.")
  }

  const response = await fetch(pageUrl, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": USER_AGENT,
    },
  })

  if (!response.ok) {
    throw new Error(
      `Shared-link preview page returned HTTP ${response.status}.`,
    )
  }

  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("text/html")) {
    throw new Error(
      `Shared-link preview page returned unexpected content type ${contentType || "unknown"}.`,
    )
  }

  const html = await response.text()
  assertCheckoutHtml(html)
  const metadata = extractPreviewMetadata(html)
  const canonicalUrl = requireAbsoluteUrl(metadata.canonical, "canonical link")
  const openGraphUrl = requireAbsoluteUrl(metadata.ogUrl, "og:url")
  const openGraphImageUrl = requireAbsoluteUrl(metadata.ogImage, "og:image")
  const twitterImageUrl = requireAbsoluteUrl(
    metadata.twitterImage,
    "twitter:image",
  )

  assertSameSharedProductUrl(canonicalUrl, pageUrl, "canonical link")
  assertSameSharedProductUrl(openGraphUrl, pageUrl, "og:url")
  assertPreviewImageUrl(openGraphImageUrl, pageUrl, "og:image")
  assertPreviewImageUrl(twitterImageUrl, pageUrl, "twitter:image")

  if (metadata.ogType !== "website") {
    throw new Error("Open Graph type must be website.")
  }

  if (metadata.twitterCard !== "summary_large_image") {
    throw new Error("Twitter card must be summary_large_image.")
  }

  if (metadata.ogDescription.length < 10) {
    throw new Error("Open Graph description is missing or too short.")
  }

  if (metadata.twitterDescription.length < 10) {
    throw new Error("Twitter description is missing or too short.")
  }

  if (metadata.twitterImageAlt.length < 3) {
    throw new Error("Twitter image alt text is missing or too short.")
  }

  if (
    metadata.ogImageWidth &&
    metadata.ogImageWidth !== "1200" &&
    metadata.ogImageWidth !== "1200.0"
  ) {
    throw new Error("Open Graph image width should be 1200.")
  }

  if (
    metadata.ogImageHeight &&
    metadata.ogImageHeight !== "630" &&
    metadata.ogImageHeight !== "630.0"
  ) {
    throw new Error("Open Graph image height should be 630.")
  }

  if (metadata.ogImageAlt.length < 3) {
    throw new Error("Open Graph image alt text is missing or too short.")
  }

  if (metadata.ogSiteName.length < 2) {
    throw new Error("Open Graph site name is missing or too short.")
  }

  if (input.expectedProductName) {
    assertIncludes(
      metadata.ogTitle,
      input.expectedProductName,
      "Open Graph title",
    )
    assertIncludes(
      metadata.twitterTitle,
      input.expectedProductName,
      "Twitter title",
    )
    if (isGeneratedPreviewImageUrl(openGraphImageUrl)) {
      assertIncludes(
        decodeURIComponent(openGraphImageUrl.searchParams.get("name") ?? ""),
        input.expectedProductName,
        "Open Graph image product name",
      )
    }
    assertIncludes(
      metadata.ogImageAlt,
      input.expectedProductName,
      "Open Graph image alt text",
    )
    assertIncludes(
      metadata.twitterImageAlt,
      input.expectedProductName,
      "Twitter image alt text",
    )
  }

  if (input.expectedBusinessName) {
    assertIncludes(
      metadata.ogSiteName,
      input.expectedBusinessName,
      "Open Graph site name",
    )
    assertIncludes(
      metadata.ogImageAlt,
      input.expectedBusinessName,
      "Open Graph image alt text",
    )
    assertIncludes(
      metadata.twitterImageAlt,
      input.expectedBusinessName,
      "Twitter image alt text",
    )
    if (isGeneratedPreviewImageUrl(openGraphImageUrl)) {
      assertIncludes(
        decodeURIComponent(
          openGraphImageUrl.searchParams.get("business") ?? "",
        ),
        input.expectedBusinessName,
        "Open Graph image business name",
      )
    }
  }

  await assertImageFetch(openGraphImageUrl, "Open Graph image")
  await assertImageFetch(twitterImageUrl, "Twitter image")

  return {
    checkedAt: new Date().toISOString(),
    checkoutHtmlVerified: true,
    expectedBusinessNameProvided: Boolean(input.expectedBusinessName),
    expectedHostMatched: input.expectedHost
      ? pageUrl.hostname.toLowerCase() === input.expectedHost
      : null,
    expectedProductNameProvided: Boolean(input.expectedProductName),
    imageFetch: {
      openGraph: true,
      twitter: true,
    },
    metadata: {
      canonicalVerified: true,
      openGraphImageAltVerified: true,
      openGraphSiteNameVerified: true,
      openGraphVerified: true,
      twitterImageAltVerified: true,
      twitterVerified: true,
    },
    page: {
      host: pageUrl.host,
      origin: pageUrl.origin,
      path: pageUrl.pathname,
    },
    userAgent: USER_AGENT,
  }
}

function loadEnvFile(filePath) {
  const values = readEnvFile(filePath)

  for (const [key, value] of Object.entries(values)) {
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {}

  const values = {}
  const content = readFileSync(filePath, "utf8")

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const equalsIndex = line.indexOf("=")
    if (equalsIndex === -1) continue

    const key = line.slice(0, equalsIndex).trim()
    const value = stripQuotes(line.slice(equalsIndex + 1).trim())

    values[key] = value
  }

  return values
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function requireAbsoluteUrl(value, label) {
  try {
    return new URL(value)
  } catch {
    throw new Error(`${label} must be an absolute URL.`)
  }
}

function assertPublicUrl(url, allowLocal) {
  const isLocal =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1" ||
    url.hostname.endsWith(".localhost")

  if (isLocal && !allowLocal) {
    throw new Error(
      `${url.href} points to a local host. Use EWATRADE_SHARED_LINK_PREVIEW_ALLOW_LOCALHOST=1 only for local fixtures.`,
    )
  }

  if (!allowLocal && url.protocol !== "https:") {
    throw new Error("Shared-link preview URL must use HTTPS.")
  }
}

function extractPreviewMetadata(html) {
  const metadata = {
    canonical: "",
    ogDescription: "",
    ogImage: "",
    ogImageAlt: "",
    ogImageHeight: "",
    ogSiteName: "",
    ogImageWidth: "",
    ogTitle: "",
    ogType: "",
    ogUrl: "",
    twitterCard: "",
    twitterDescription: "",
    twitterImage: "",
    twitterImageAlt: "",
    twitterTitle: "",
  }

  for (const tag of html.matchAll(/<(meta|link)\s+([^>]+)>/gi)) {
    const tagName = tag[1]?.toLowerCase()
    const attributes = parseTagAttributes(tag[2] ?? "")
    const property = attributes.property?.toLowerCase()
    const name = attributes.name?.toLowerCase()
    const rel = attributes.rel?.toLowerCase()
    const content = decodeHtml(attributes.content ?? "")

    if (tagName === "link" && rel === "canonical") {
      metadata.canonical = decodeHtml(attributes.href ?? "")
    }

    if (property === "og:title") metadata.ogTitle = content
    if (property === "og:description") metadata.ogDescription = content
    if (property === "og:image") metadata.ogImage = content
    if (property === "og:image:alt") metadata.ogImageAlt = content
    if (property === "og:image:height") metadata.ogImageHeight = content
    if (property === "og:site_name") metadata.ogSiteName = content
    if (property === "og:image:width") metadata.ogImageWidth = content
    if (property === "og:type") metadata.ogType = content
    if (property === "og:url") metadata.ogUrl = content
    if (name === "twitter:card") metadata.twitterCard = content
    if (name === "twitter:description") metadata.twitterDescription = content
    if (name === "twitter:image") metadata.twitterImage = content
    if (name === "twitter:image:alt") metadata.twitterImageAlt = content
    if (name === "twitter:title") metadata.twitterTitle = content
  }

  const missing = Object.entries(metadata)
    .filter(
      ([key, value]) =>
        !["ogImageHeight", "ogImageWidth"].includes(key) && !value,
    )
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(
      `Shared-link preview metadata is missing ${missing.join(", ")}.`,
    )
  }

  return metadata
}

function parseTagAttributes(rawAttributes) {
  const attributes = {}

  for (const match of rawAttributes.matchAll(
    /([a-zA-Z_:.-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/g,
  )) {
    const key = match[1]?.toLowerCase()
    const value = match[2]

    if (!key || !value) continue

    attributes[key] = value.replace(/^['"]|['"]$/g, "")
  }

  return attributes
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
}

function assertSameSharedProductUrl(actual, expected, label) {
  if (actual.origin !== expected.origin) {
    throw new Error(
      `${label} origin ${actual.origin} did not match ${expected.origin}.`,
    )
  }

  if (actual.pathname !== expected.pathname) {
    throw new Error(
      `${label} path ${actual.pathname} did not match ${expected.pathname}.`,
    )
  }

  if (actual.searchParams.get("share") !== expected.searchParams.get("share")) {
    throw new Error(`${label} share token did not match the checked link.`)
  }
}

function assertPreviewImageUrl(imageUrl, pageUrl, label) {
  if (
    isGeneratedPreviewImageUrl(imageUrl) &&
    imageUrl.origin !== pageUrl.origin
  ) {
    throw new Error(
      `${label} origin ${imageUrl.origin} did not match ${pageUrl.origin}.`,
    )
  }

  if (!["http:", "https:"].includes(imageUrl.protocol)) {
    throw new Error(`${label} must use an http(s) URL.`)
  }

  const hostname = imageUrl.hostname.toLowerCase()
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")

  if (isLocal && imageUrl.origin !== pageUrl.origin) {
    throw new Error(`${label} must not point to a local product image host.`)
  }
}

function isGeneratedPreviewImageUrl(imageUrl) {
  return imageUrl.pathname === "/api/og/shared-product"
}

function assertIncludes(value, expected, label) {
  if (!value.toLowerCase().includes(expected.toLowerCase())) {
    throw new Error(`${label} does not include ${expected}.`)
  }
}

async function assertImageFetch(url, label) {
  const response = await fetch(url, {
    headers: {
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*",
      "user-agent": USER_AGENT,
    },
  })

  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}.`)
  }

  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.startsWith("image/")) {
    throw new Error(
      `${label} returned unexpected content type ${contentType || "unknown"}.`,
    )
  }

  await response.arrayBuffer()
}

function assertCheckoutHtml(html) {
  const requiredMarkers = [
    'data-testid="shared-product-order-form"',
    'data-testid="shared-product-variant-radio"',
    'data-testid="shared-product-quantity-input"',
    'data-testid="shared-product-total"',
    'data-testid="shared-product-register-radio"',
    'data-testid="shared-product-login-radio"',
    'data-testid="shared-product-customer-name"',
    'data-testid="shared-product-customer-email"',
    'data-testid="shared-product-customer-password"',
    'data-testid="shared-product-submit"',
    'name="quantity"',
    'name="customerAuthMode"',
    'value="register"',
    'value="login"',
    "Submit order request",
  ]
  const stateMarkers = [
    'data-testid="shared-product-order-requested"',
    'data-testid="shared-product-order-error"',
    "Currently unavailable",
  ]
  const missingMarkers = requiredMarkers.filter(
    (marker) => !html.includes(marker),
  )

  if (missingMarkers.length > 0) {
    throw new Error(
      `Shared-link checkout HTML is missing ${missingMarkers.join(", ")}.`,
    )
  }

  if (!stateMarkers.some((marker) => html.includes(marker))) {
    throw new Error(
      "Shared-link checkout HTML is missing requested, error, and unavailable state hooks.",
    )
  }
}

function validateEvidencePath(evidencePath) {
  if (!isAbsolute(evidencePath)) {
    throw new Error(
      "EWATRADE_SHARED_LINK_PREVIEW_EVIDENCE_PATH must be an absolute path.",
    )
  }

  if (!evidencePath.toLowerCase().endsWith(".json")) {
    throw new Error(
      "EWATRADE_SHARED_LINK_PREVIEW_EVIDENCE_PATH must point to a .json file.",
    )
  }
}

function writePreviewEvidence(evidencePath, evidence) {
  mkdirSync(dirname(evidencePath), { recursive: true })
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(`Shared-link public preview evidence: ${evidencePath}`)
}
