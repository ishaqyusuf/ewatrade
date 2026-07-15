import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { createTRPCClient, httpLink } from "@trpc/client"
import superjson from "superjson"

type EnvValues = Record<string, string | undefined>

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const ENV_FILE =
  process.env.SHARED_LINK_LIVE_ENV_FILE ??
  process.env.SHARED_LINK_LIVE_READY_ENV_FILE ??
  join(REPO_ROOT, ".env")
const READINESS_SCRIPT = join(
  REPO_ROOT,
  "apps/mobile/scripts/check-shared-link-live-ready.mjs",
)
const DEFAULT_QUANTITY = 1
const NOTIFICATION_POLL_ATTEMPTS = 10
const NOTIFICATION_POLL_DELAY_MS = 500
const PREVIEW_USER_AGENT =
  "WhatsApp/2.24 EwaTrade-Mobile-Retail-Ops-Live-QA/1.0"

loadEnvFile(ENV_FILE)
runReadinessCheck()

const env = process.env as EnvValues
const apiUrl = pickEnv([
  "API_URL",
  "NEXT_PUBLIC_API_URL",
  "EXPO_PUBLIC_API_URL",
])
const storefrontUrl = pickEnv([
  "STOREFRONT_URL",
  "NEXT_PUBLIC_STOREFRONT_URL",
  "NEXT_PUBLIC_APP_URL",
])
const ownerBearerToken = requireEnv("SHARED_LINK_LIVE_OWNER_BEARER_TOKEN")
const productId = requireEnv("SHARED_LINK_LIVE_PRODUCT_ID")
const customerEmail = requireEnv("SHARED_LINK_LIVE_CUSTOMER_EMAIL")
const customerName = requireEnv("SHARED_LINK_LIVE_CUSTOMER_NAME")
const followUpMode = requireEnv("SHARED_LINK_LIVE_FOLLOW_UP_MODE")
const evidencePath = requireEnv("SHARED_LINK_LIVE_EVIDENCE_PATH")
const quantity = getQuantity()
const runId = `live-qa-${Date.now()}`

const trpc = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      headers: {
        "x-app-authorization": `Bearer ${ownerBearerToken}`,
        "x-trpc-source": "mobile-live-qa",
      },
      transformer: superjson,
      url: `${apiUrl.replace(/\/+$/, "")}/api/trpc`,
    }),
  ],
})

console.log("Starting shared-link live QA run.")

const shareLink = await trpc.retailOps.createProductShareLink.mutate({
  externalId: runId,
  label: "Live QA shared-link check",
  productId,
})
const shareUrl = new URL(shareLink.url)
const pageParams = getSharedPageParams(shareUrl)

console.log(
  `Created protected product share link at ${shareUrl.origin}; configured storefront base is ${
    new URL(storefrontUrl).origin
  }.`,
)

const publicPageResponse = await fetch(shareLink.url, {
  headers: {
    accept: "text/html,application/xhtml+xml",
    "user-agent": PREVIEW_USER_AGENT,
  },
})
if (!publicPageResponse.ok) {
  throw new Error(
    `Generated public product page returned HTTP ${publicPageResponse.status}.`,
  )
}

const publicPageHtml = await publicPageResponse.text()
if (!publicPageHtml.includes(shareLink.product.name)) {
  throw new Error(
    "Generated public product page did not include the product name.",
  )
}

await assertSharePreviewMetadata({
  html: publicPageHtml,
  pageUrl: shareUrl,
  productName: shareLink.product.name,
})

console.log(
  "Fetched generated public product page and verified preview metadata.",
)

const sharedProduct = await trpc.retailOps.sharedProduct.query({
  productSlug: pageParams.productSlug,
  storeSlug: pageParams.storeSlug,
  tenantSlug: pageParams.tenantSlug,
  token: pageParams.token,
})
const selectedVariant =
  sharedProduct.product.variants.find(
    (variant) => variant.availableQuantity >= quantity,
  ) ?? sharedProduct.product.variants[0]

if (!selectedVariant) {
  throw new Error("Shared product has no variants available for live QA.")
}

const orderRequest =
  await trpc.retailOps.createSharedProductOrderRequest.mutate({
    customerEmail,
    customerName,
    notes: `Automated shared-link live QA run ${runId}.`,
    productSlug: pageParams.productSlug,
    productVariantId: selectedVariant.id,
    quantity,
    storeSlug: pageParams.storeSlug,
    tenantSlug: pageParams.tenantSlug,
    token: pageParams.token,
  })

console.log(
  `Created public API order request ${orderRequest.order.orderNumber} and queued shared-link notifications.`,
)

const notificationStatus = await waitForNotificationStatus(
  orderRequest.order.id,
)
if (!notificationStatus) {
  throw new Error(
    "Shared-link notification dispatch did not record a sent or failed status before timeout.",
  )
}

if (notificationStatus.status !== "sent") {
  throw new Error(
    `Shared-link notification dispatch finished with status ${notificationStatus.status}.`,
  )
}

console.log("Verified shared-link notification dispatch audit.")

await trpc.retailOps.updateSharedLinkOrderRequestStatus.mutate(
  followUpMode === "complete"
    ? {
        fulfilledAt: new Date(),
        fulfillmentMethod: "pickup",
        fulfillmentNote: `Automated shared-link live QA completion ${runId}.`,
        fulfillmentStatus: "ready_for_pickup",
        orderId: orderRequest.order.id,
        paidAt: new Date(),
        paymentMethod: "cash",
        status: "completed",
      }
    : {
        fulfillmentNote: `Automated shared-link live QA cancellation ${runId}.`,
        orderId: orderRequest.order.id,
        status: "cancelled",
      },
)

console.log(`Recorded ${followUpMode} follow-up for order request.`)

await trpc.retailOps.deactivateProductShareLink.mutate({
  externalId: `${runId}-deactivate`,
  productId,
  shareLinkId: shareLink.id,
})

console.log("Deactivated generated product share link.")
writeLiveEvidence({
  notificationStatus,
  orderNumber: orderRequest.order.orderNumber,
  productName: shareLink.product.name,
  selectedVariantName: selectedVariant.name,
  shareUrl,
})
console.log("Shared-link live QA run passed.")

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return

  const content = readFileSync(filePath, "utf8")

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const equalsIndex = line.indexOf("=")
    if (equalsIndex === -1) continue

    const key = line.slice(0, equalsIndex).trim()
    const value = stripQuotes(line.slice(equalsIndex + 1).trim())

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

function stripQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function runReadinessCheck() {
  const result = spawnSync(process.execPath, [READINESS_SCRIPT], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      SHARED_LINK_LIVE_READY_ENV_FILE: ENV_FILE,
    },
    stdio: "inherit",
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function pickEnv(keys: string[]) {
  const key = keys.find((candidate) => process.env[candidate]?.trim())
  if (!key) {
    throw new Error(`Missing one of ${keys.join(", ")}.`)
  }

  return process.env[key]?.trim() ?? ""
}

function requireEnv(key: string) {
  const value = process.env[key]?.trim()

  if (!value) {
    throw new Error(`${key} is required.`)
  }

  return value
}

function getQuantity() {
  const parsed = Number(process.env.SHARED_LINK_LIVE_QUANTITY ?? "")

  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_QUANTITY

  return Math.trunc(parsed)
}

function getSharedPageParams(shareUrl: URL) {
  const [, prefix, tenantSlug, storeSlug, productSlug] =
    shareUrl.pathname.split("/")

  if (prefix !== "p" || !tenantSlug || !storeSlug || !productSlug) {
    throw new Error(
      "Generated share URL did not match the shared product path.",
    )
  }

  const token = shareUrl.searchParams.get("share")

  if (!token) {
    throw new Error("Generated share URL did not include a public share token.")
  }

  return {
    productSlug: decodeURIComponent(productSlug),
    storeSlug: decodeURIComponent(storeSlug),
    tenantSlug: decodeURIComponent(tenantSlug),
    token,
  }
}

async function assertSharePreviewMetadata(input: {
  html: string
  pageUrl: URL
  productName: string
}) {
  const metadata = extractPreviewMetadata(input.html)
  const canonicalUrl = requireAbsoluteUrl(metadata.canonical, "canonical link")
  const openGraphUrl = requireAbsoluteUrl(metadata.ogUrl, "og:url")
  const openGraphImageUrl = requireAbsoluteUrl(metadata.ogImage, "og:image")
  const twitterImageUrl = requireAbsoluteUrl(
    metadata.twitterImage,
    "twitter:image",
  )

  assertSameSharedProductUrl(canonicalUrl, input.pageUrl, "canonical link")
  assertSameSharedProductUrl(openGraphUrl, input.pageUrl, "og:url")

  if (!metadata.ogTitle.includes(input.productName)) {
    throw new Error("Open Graph title does not include the product name.")
  }

  if (!metadata.twitterTitle.includes(input.productName)) {
    throw new Error("Twitter title does not include the product name.")
  }

  if (metadata.ogDescription.length < 10) {
    throw new Error("Open Graph description is missing or too short.")
  }

  if (metadata.ogImageAlt.length < 3) {
    throw new Error("Open Graph image alt text is missing or too short.")
  }

  if (!metadata.ogImageAlt.includes(input.productName)) {
    throw new Error(
      "Open Graph image alt text does not include the product name.",
    )
  }

  if (metadata.ogSiteName.length < 2) {
    throw new Error("Open Graph site name is missing or too short.")
  }

  if (metadata.twitterCard !== "summary_large_image") {
    throw new Error("Twitter card must be summary_large_image.")
  }

  if (metadata.twitterImageAlt.length < 3) {
    throw new Error("Twitter image alt text is missing or too short.")
  }

  if (!metadata.twitterImageAlt.includes(input.productName)) {
    throw new Error("Twitter image alt text does not include the product name.")
  }

  assertPreviewImageUrl(openGraphImageUrl, input.pageUrl, input.productName)
  assertPreviewImageUrl(twitterImageUrl, input.pageUrl, input.productName)

  const imageResponse = await fetch(openGraphImageUrl)
  if (!imageResponse.ok) {
    throw new Error(`Open Graph image returned HTTP ${imageResponse.status}.`)
  }

  const contentType = imageResponse.headers.get("content-type") ?? ""
  if (!contentType.startsWith("image/")) {
    throw new Error(
      `Open Graph image returned unexpected content type ${contentType || "unknown"}.`,
    )
  }
}

function extractPreviewMetadata(html: string) {
  const metadata = {
    canonical: "",
    ogDescription: "",
    ogImage: "",
    ogImageAlt: "",
    ogSiteName: "",
    ogTitle: "",
    ogUrl: "",
    twitterCard: "",
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
    if (property === "og:site_name") metadata.ogSiteName = content
    if (property === "og:url") metadata.ogUrl = content
    if (name === "twitter:card") metadata.twitterCard = content
    if (name === "twitter:title") metadata.twitterTitle = content
    if (name === "twitter:image") metadata.twitterImage = content
    if (name === "twitter:image:alt") metadata.twitterImageAlt = content
  }

  const missing = Object.entries(metadata)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(
      `Shared-link preview metadata is missing ${missing.join(", ")}.`,
    )
  }

  return metadata
}

function parseTagAttributes(rawAttributes: string) {
  const attributes: Record<string, string> = {}

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

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
}

function requireAbsoluteUrl(value: string, label: string) {
  try {
    return new URL(value)
  } catch {
    throw new Error(`${label} must be an absolute URL.`)
  }
}

function assertSameSharedProductUrl(actual: URL, expected: URL, label: string) {
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
    throw new Error(`${label} share token did not match the generated link.`)
  }
}

function assertPreviewImageUrl(
  imageUrl: URL,
  pageUrl: URL,
  productName: string,
) {
  if (imageUrl.origin !== pageUrl.origin) {
    throw new Error(
      `Preview image origin ${imageUrl.origin} did not match ${pageUrl.origin}.`,
    )
  }

  if (imageUrl.pathname !== "/api/og/shared-product") {
    throw new Error(
      "Preview image URL must point to the shared-product OG route.",
    )
  }

  if (imageUrl.searchParams.get("name") !== productName) {
    throw new Error("Preview image URL does not include the product name.")
  }
}

async function waitForNotificationStatus(orderId: string) {
  for (let attempt = 0; attempt < NOTIFICATION_POLL_ATTEMPTS; attempt++) {
    const orderRequests = await trpc.retailOps.sharedLinkOrderRequests.query({
      limit: 50,
      status: "all",
    })
    const orderRequest = orderRequests.find((request) => request.id === orderId)
    const notification = orderRequest?.notification

    if (notification?.status === "sent" || notification?.status === "failed") {
      return notification
    }

    await new Promise((resolve) =>
      setTimeout(resolve, NOTIFICATION_POLL_DELAY_MS),
    )
  }

  return null
}

function writeLiveEvidence(input: {
  notificationStatus: { status: string | null }
  orderNumber: string
  productName: string
  selectedVariantName: string
  shareUrl: URL
}) {
  const evidence = {
    apiOrigin: new URL(apiUrl).origin,
    checkedAt: new Date().toISOString(),
    followUp: {
      mode: followUpMode,
      recorded: true,
    },
    notification: {
      status: input.notificationStatus.status ?? "unknown",
      verified: input.notificationStatus.status === "sent",
    },
    order: {
      orderNumber: input.orderNumber,
      requested: true,
    },
    product: {
      name: input.productName,
      selectedVariantName: input.selectedVariantName,
    },
    publicPage: {
      fetched: true,
      metadataVerified: true,
    },
    quantity,
    runId,
    shareLink: {
      deactivated: true,
      origin: input.shareUrl.origin,
      path: input.shareUrl.pathname,
    },
    storefrontOrigin: new URL(storefrontUrl).origin,
  }

  mkdirSync(dirname(evidencePath), { recursive: true })
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(`Shared-link live evidence: ${evidencePath}`)
}
