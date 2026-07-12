import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ENV_FILE =
  process.env.SHARED_LINK_BROWSER_CHECKOUT_ENV_FILE ?? join(REPO_ROOT, ".env")
const USER_AGENT =
  "Mozilla/5.0 EwaTrade-Mobile-Retail-Ops-Browser-Checkout-QA/1.0"

loadEnvFile(ENV_FILE)

const readiness = spawnSync(
  process.execPath,
  [join(SCRIPT_DIR, "check-shared-link-browser-checkout-ready.mjs")],
  {
    env: {
      ...process.env,
      SHARED_LINK_BROWSER_READY_ENV_FILE: ENV_FILE,
    },
    stdio: "inherit",
  },
)

if (readiness.error) {
  console.error(readiness.error.message)
  process.exit(1)
}

if (readiness.status !== 0) {
  process.exit(readiness.status ?? 1)
}

try {
  await runBrowserCheckout()
} catch (error) {
  console.error("Shared-link browser checkout QA failed.")
  console.error(`- ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

async function runBrowserCheckout() {
  const playwright = await importPlaywright()
  const browser = await playwright.chromium.launch({
    headless: process.env.EWATRADE_SHARED_LINK_BROWSER_HEADFUL !== "1",
  })

  try {
    const page = await browser.newPage({
      userAgent: USER_AGENT,
    })
    const shareUrl = requireEnv("EWATRADE_SHARED_LINK_PREVIEW_URL")
    const authMode = getAuthMode()
    const quantity = process.env.EWATRADE_SHARED_LINK_BROWSER_QUANTITY ?? "1"

    await page.goto(shareUrl, {
      waitUntil: "domcontentloaded",
    })
    await page
      .locator('[data-testid="shared-product-order-form"]')
      .waitFor({ state: "visible", timeout: 15_000 })
    await page
      .locator('[data-testid="shared-product-variant-radio"]:not([disabled])')
      .first()
      .check()
    await page
      .locator('[data-testid="shared-product-quantity-input"]')
      .fill(quantity)

    if (authMode === "login") {
      await page.locator('[data-testid="shared-product-login-radio"]').check()
    } else {
      await page
        .locator('[data-testid="shared-product-register-radio"]')
        .check()
      await page
        .locator('[data-testid="shared-product-customer-name"]')
        .fill(requireEnv("EWATRADE_SHARED_LINK_BROWSER_CUSTOMER_NAME"))
    }

    await page
      .locator('[data-testid="shared-product-customer-email"]')
      .fill(requireEnv("EWATRADE_SHARED_LINK_BROWSER_CUSTOMER_EMAIL"))
    await page
      .locator('[data-testid="shared-product-customer-password"]')
      .fill(requireEnv("EWATRADE_SHARED_LINK_BROWSER_CUSTOMER_PASSWORD"))

    const phone =
      process.env.EWATRADE_SHARED_LINK_BROWSER_CUSTOMER_PHONE?.trim()
    if (phone) {
      await page
        .locator('[data-testid="shared-product-customer-phone"]')
        .fill(phone)
    }

    const notes =
      process.env.EWATRADE_SHARED_LINK_BROWSER_NOTES?.trim() ??
      "Automated browser checkout QA order request."
    await page.locator('[data-testid="shared-product-notes"]').fill(notes)
    await page.locator('[data-testid="shared-product-submit"]').click()

    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => undefined)

    const error = page.locator('[data-testid="shared-product-order-error"]')
    if (
      await error
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      throw new Error(
        `Checkout returned error: ${await error.first().innerText()}`,
      )
    }

    await page
      .locator('[data-testid="shared-product-order-requested"]')
      .waitFor({ state: "visible", timeout: 20_000 })

    const screenshotPath = requireEnv(
      "EWATRADE_SHARED_LINK_BROWSER_SCREENSHOT_PATH",
    )
    mkdirSync(dirname(screenshotPath), { recursive: true })
    await page.screenshot({
      fullPage: true,
      path: screenshotPath,
    })

    console.log("Shared-link browser checkout QA passed.")
    console.log(`Browser checkout screenshot: ${screenshotPath}`)
  } finally {
    await browser.close()
  }
}

async function importPlaywright() {
  try {
    return await import("playwright")
  } catch {
    throw new Error(
      "Playwright is required for browser checkout QA. Install or expose the playwright package, then rerun this command.",
    )
  }
}

function loadEnvFile(filePath) {
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

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function requireEnv(key) {
  const value = process.env[key]?.trim()

  if (!value) {
    throw new Error(`${key} is required.`)
  }

  return value
}

function getAuthMode() {
  return process.env.EWATRADE_SHARED_LINK_BROWSER_AUTH_MODE?.trim() === "login"
    ? "login"
    : "register"
}
