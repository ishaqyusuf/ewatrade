import { spawn } from "node:child_process"
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"

const SCRIPT_PATH = new URL(
  "./check-shared-link-preview-url.mjs",
  import.meta.url,
).pathname
const PRODUCT_NAME = "Retail Product"
const BUSINESS_NAME = "Retail Business"
const SHARE_PATH = "/p/retail-business/main-store/retail-product"
const SHARE_TOKEN = "share_token_123456"
const PRODUCT_IMAGE_SHARE_TOKEN = "share_token_product_image"
const pageRequestUserAgents = []
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
)

const server = createServer((request, response) => {
  const host = request.headers.host
  const pageUrl = `http://${host}${SHARE_PATH}?share=${SHARE_TOKEN}`
  const imageUrl = `http://${host}/api/og/shared-product?name=${encodeURIComponent(
    PRODUCT_NAME,
  )}&business=${encodeURIComponent(BUSINESS_NAME)}&price=NGN%2010`
  const productImageUrl = `http://${host}/product-image.png`

  if (
    request.url?.startsWith("/api/og/shared-product") ||
    request.url === "/product-image.png"
  ) {
    response.writeHead(200, {
      "content-type": "image/png",
    })
    response.end(PNG_1X1)
    return
  }

  if (request.url === `${SHARE_PATH}?share=${SHARE_TOKEN}`) {
    pageRequestUserAgents.push(request.headers["user-agent"] ?? "")
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
    })
    response.end(renderHtml({ imageUrl, pageUrl }))
    return
  }

  if (request.url === `${SHARE_PATH}?share=${PRODUCT_IMAGE_SHARE_TOKEN}`) {
    const productImagePageUrl = `http://${host}${SHARE_PATH}?share=${PRODUCT_IMAGE_SHARE_TOKEN}`

    pageRequestUserAgents.push(request.headers["user-agent"] ?? "")
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
    })
    response.end(
      renderHtml({ imageUrl: productImageUrl, pageUrl: productImagePageUrl }),
    )
    return
  }

  response.writeHead(404, {
    "content-type": "text/plain",
  })
  response.end("Not found")
})

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))

const address = server.address()
const origin = `http://127.0.0.1:${address.port}`
const validUrl = `${origin}${SHARE_PATH}?share=${SHARE_TOKEN}`
const productImageUrl = `${origin}${SHARE_PATH}?share=${PRODUCT_IMAGE_SHARE_TOKEN}`
const validEnv = [
  `EWATRADE_SHARED_LINK_PREVIEW_URL=${validUrl}`,
  "EWATRADE_SHARED_LINK_PREVIEW_EXPECTED_HOST=127.0.0.1",
  `EWATRADE_SHARED_LINK_PREVIEW_EXPECTED_PRODUCT_NAME=${PRODUCT_NAME}`,
  `EWATRADE_SHARED_LINK_PREVIEW_EXPECTED_BUSINESS_NAME=${BUSINESS_NAME}`,
  "EWATRADE_SHARED_LINK_PREVIEW_EVIDENCE_PATH=/tmp/ewatrade-share-preview-evidence.json",
  "EWATRADE_SHARED_LINK_PREVIEW_ALLOW_LOCALHOST=1",
].join("\n")
const productImageEnv = validEnv.replace(
  `EWATRADE_SHARED_LINK_PREVIEW_URL=${validUrl}`,
  `EWATRADE_SHARED_LINK_PREVIEW_URL=${productImageUrl}`,
)
const exampleEnv = [
  "EWATRADE_SHARED_LINK_PREVIEW_URL=",
  "EWATRADE_SHARED_LINK_PREVIEW_EXPECTED_HOST=",
  "EWATRADE_SHARED_LINK_PREVIEW_EXPECTED_PRODUCT_NAME=",
  "EWATRADE_SHARED_LINK_PREVIEW_EXPECTED_BUSINESS_NAME=",
  "EWATRADE_SHARED_LINK_PREVIEW_EVIDENCE_PATH=",
  "EWATRADE_SHARED_LINK_PREVIEW_ALLOW_LOCALHOST=",
].join("\n")
const cases = [
  {
    env: validEnv,
    exampleEnv,
    expectedStatus: 0,
    label: "valid preview metadata",
    requiredOutput: "Shared-link public preview URL check passed.",
  },
  {
    env: productImageEnv,
    exampleEnv,
    expectedStatus: 0,
    label: "valid preview metadata with product image",
    requiredOutput: "Shared-link public preview URL check passed.",
  },
  {
    env: validEnv.replace(
      "EWATRADE_SHARED_LINK_PREVIEW_ALLOW_LOCALHOST=1",
      "EWATRADE_SHARED_LINK_PREVIEW_ALLOW_LOCALHOST=",
    ),
    exampleEnv,
    expectedStatus: 1,
    label: "localhost without explicit allowance",
    requiredOutput: "points to a local host",
  },
  {
    env: validEnv.replace(
      `EWATRADE_SHARED_LINK_PREVIEW_EXPECTED_PRODUCT_NAME=${PRODUCT_NAME}`,
      "EWATRADE_SHARED_LINK_PREVIEW_EXPECTED_PRODUCT_NAME=Missing Product",
    ),
    exampleEnv,
    expectedStatus: 1,
    label: "expected product mismatch",
    requiredOutput: "Open Graph title does not include Missing Product",
  },
  {
    env: validEnv.replace(
      `EWATRADE_SHARED_LINK_PREVIEW_URL=${validUrl}`,
      `EWATRADE_SHARED_LINK_PREVIEW_URL=${origin}${SHARE_PATH}`,
    ),
    exampleEnv,
    expectedStatus: 1,
    label: "missing share token",
    requiredOutput: "must include the share token",
  },
  {
    env: validEnv.replace(
      "EWATRADE_SHARED_LINK_PREVIEW_EVIDENCE_PATH=/tmp/ewatrade-share-preview-evidence.json",
      "EWATRADE_SHARED_LINK_PREVIEW_EVIDENCE_PATH=",
    ),
    exampleEnv,
    expectedStatus: 1,
    label: "missing preview evidence path",
    requiredOutput: "EWATRADE_SHARED_LINK_PREVIEW_EVIDENCE_PATH is required.",
  },
  {
    env: validEnv.replace(
      "EWATRADE_SHARED_LINK_PREVIEW_EVIDENCE_PATH=/tmp/ewatrade-share-preview-evidence.json",
      "EWATRADE_SHARED_LINK_PREVIEW_EVIDENCE_PATH=relative/share-preview.txt",
    ),
    exampleEnv,
    expectedStatus: 1,
    label: "invalid preview evidence path",
    requiredOutput:
      "EWATRADE_SHARED_LINK_PREVIEW_EVIDENCE_PATH must be an absolute path.",
  },
  {
    env: validEnv,
    exampleEnv: exampleEnv.replace(
      "EWATRADE_SHARED_LINK_PREVIEW_EXPECTED_BUSINESS_NAME=\n",
      "",
    ),
    expectedStatus: 1,
    label: "missing example documentation",
    requiredOutput:
      ".env.example is missing documented shared-link preview keys",
  },
]

try {
  for (const testCase of cases) {
    const fixtureDir = mkdtempSync(join(tmpdir(), "ewatrade-share-preview-"))
    const envFile = join(fixtureDir, ".env")
    const exampleEnvFile = join(fixtureDir, ".env.example")
    const evidencePath = join(fixtureDir, "share-preview-evidence.json")

    try {
      writeFileSync(
        envFile,
        `${testCase.env.replace(
          "EWATRADE_SHARED_LINK_PREVIEW_EVIDENCE_PATH=/tmp/ewatrade-share-preview-evidence.json",
          `EWATRADE_SHARED_LINK_PREVIEW_EVIDENCE_PATH=${evidencePath}`,
        )}\n`,
      )
      writeFileSync(exampleEnvFile, `${testCase.exampleEnv}\n`)

      const result = await runScriptWithEnv({
        env: {
          ...process.env,
          SHARED_LINK_PREVIEW_ENV_FILE: envFile,
          SHARED_LINK_PREVIEW_EXAMPLE_ENV_FILE: exampleEnvFile,
        },
      })
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`

      if (result.status !== testCase.expectedStatus) {
        fail(
          testCase.label,
          `Expected status ${testCase.expectedStatus}, received ${result.status}.`,
          output,
        )
      }

      if (!output.includes(testCase.requiredOutput)) {
        fail(
          testCase.label,
          `Expected output to include: ${testCase.requiredOutput}`,
          output,
        )
      }

      if (testCase.expectedStatus === 0) {
        if (!existsSync(evidencePath) || statSync(evidencePath).size === 0) {
          fail(
            testCase.label,
            "Expected preview checker to save a non-empty evidence file.",
            output,
          )
        }

        const evidenceContent = readFileSync(evidencePath, "utf8")
        if (
          evidenceContent.includes(SHARE_TOKEN) ||
          evidenceContent.includes(PRODUCT_IMAGE_SHARE_TOKEN) ||
          evidenceContent.includes(validUrl) ||
          evidenceContent.includes(productImageUrl)
        ) {
          fail(
            testCase.label,
            "Preview evidence leaked a share token or full private URL.",
            evidenceContent,
          )
        }

        if (!evidenceContent.includes('"metadata"')) {
          fail(
            testCase.label,
            "Preview evidence did not record metadata proof.",
            evidenceContent,
          )
        }
      }
    } finally {
      rmSync(fixtureDir, { force: true, recursive: true })
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve))
}

if (
  pageRequestUserAgents.length === 0 ||
  pageRequestUserAgents.some((userAgent) => !userAgent.includes("WhatsApp/"))
) {
  fail(
    "WhatsApp user agent",
    "Expected every shared-link page fetch to use the WhatsApp-style preview user agent.",
    pageRequestUserAgents.join("\n"),
  )
}

console.log("Shared-link preview URL fixture checks passed.")

function renderHtml(input) {
  return `<!doctype html>
<html>
  <head>
    <title>${PRODUCT_NAME} | ${BUSINESS_NAME}</title>
    <link rel="canonical" href="${input.pageUrl}">
    <meta property="og:title" content="${PRODUCT_NAME}">
    <meta property="og:description" content="Order ${PRODUCT_NAME} from ${BUSINESS_NAME}.">
    <meta property="og:image" content="${input.imageUrl}">
    <meta property="og:image:alt" content="${PRODUCT_NAME} from ${BUSINESS_NAME}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:site_name" content="${BUSINESS_NAME}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${input.pageUrl}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${PRODUCT_NAME}">
    <meta name="twitter:description" content="Order ${PRODUCT_NAME} from ${BUSINESS_NAME}.">
    <meta name="twitter:image" content="${input.imageUrl}">
    <meta name="twitter:image:alt" content="${PRODUCT_NAME} from ${BUSINESS_NAME}">
  </head>
  <body>
    <main>
      <h1>${PRODUCT_NAME}</h1>
      <form data-testid="shared-product-order-form">
        <label>
          <input data-testid="shared-product-variant-radio" name="productVariantId" type="radio" value="variant_1" checked>
          Unit
        </label>
        <input data-testid="shared-product-quantity-input" name="quantity" type="number" value="1">
        <p data-testid="shared-product-total">NGN 10</p>
        <label>
          <input data-testid="shared-product-register-radio" name="customerAuthMode" type="radio" value="register" checked>
          Register
        </label>
        <label>
          <input data-testid="shared-product-login-radio" name="customerAuthMode" type="radio" value="login">
          Log in
        </label>
        <input data-testid="shared-product-customer-name" name="customerName" placeholder="Enter your name">
        <input data-testid="shared-product-customer-email" name="customerEmail" placeholder="Enter your email address">
        <input data-testid="shared-product-customer-password" name="customerPassword" type="password" placeholder="Enter your password">
        <button data-testid="shared-product-submit" type="submit">Submit order request</button>
        <p data-testid="shared-product-order-requested">Order requested</p>
      </form>
    </main>
  </body>
</html>`
}

function fail(label, message, output) {
  console.error(`Shared-link preview URL fixture failed: ${label}`)
  console.error(message)
  console.error(output)
  process.exit(1)
}

function runScriptWithEnv({ env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT_PATH], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", reject)
    child.on("close", (status) => {
      resolve({
        status,
        stderr,
        stdout,
      })
    })
  })
}
