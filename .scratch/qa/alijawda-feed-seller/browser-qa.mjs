import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { chromium } from "../../../apps/mobile/node_modules/playwright/index.mjs"

const outDir = resolve(
  process.cwd(),
  "../../.scratch/qa/alijawda-feed-seller/screenshots",
)
mkdirSync(outDir, { recursive: true })

const runId = `${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 17)}${Math.floor(
  Math.random() * 100,
)
  .toString()
  .padStart(2, "0")}`
const slug = `alijawda-${runId.slice(8, 18)}`
const email = `alijawda-${runId}@test.com`
const phone = `+234 80${runId.slice(-8)}`
const password = "Alijawda-Test-2026!"

const marketingUrl = "http://ewatrade.localhost/signup"
const dashboardUrl = "http://localhost:3094"

function shot(name) {
  return resolve(outDir, `web-${name}.png`)
}

async function screenshot(page, name) {
  await page.screenshot({ fullPage: true, path: shot(name) })
}

async function copyCookiesToDashboard(context) {
  const sourceCookies = await context.cookies("http://ewatrade.localhost")
  const authCookies = sourceCookies.filter((cookie) =>
    cookie.name.toLowerCase().includes("auth"),
  )

  await context.addCookies(
    authCookies.flatMap((cookie) =>
      ["http://localhost:3094", "http://ewatrade-dashboard.localhost"].map(
        (url) => ({
          expires: cookie.expires,
          httpOnly: cookie.httpOnly,
          name: cookie.name,
          sameSite: cookie.sameSite,
          secure: cookie.secure,
          url,
          value: cookie.value,
        }),
      ),
    ),
  )
}

async function seedProducts(page) {
  return await page.evaluate(async () => {
    const products = [
      {
        name: "Rabbit feed",
        primaryUnitName: "Bag",
        priceMinor: 1800000,
        openingStockQuantity: 5,
        variants: [
          {
            name: "Half bag",
            priceMinor: 950000,
            openingStockQuantity: 5,
            conversionMultiplier: 0.5,
          },
          {
            name: "Quarter bag",
            priceMinor: 500000,
            openingStockQuantity: 5,
            conversionMultiplier: 0.25,
          },
          {
            name: "Kilo",
            priceMinor: 80000,
            openingStockQuantity: 5,
            conversionMultiplier: 0.025,
          },
        ],
      },
      {
        name: "Chicken feed",
        primaryUnitName: "Bag",
        priceMinor: 2200000,
        openingStockQuantity: 5,
        variants: [
          {
            name: "Half bag",
            priceMinor: 1150000,
            openingStockQuantity: 5,
            conversionMultiplier: 0.5,
          },
          {
            name: "Quarter bag",
            priceMinor: 600000,
            openingStockQuantity: 5,
            conversionMultiplier: 0.25,
          },
          {
            name: "Kilo",
            priceMinor: 95000,
            openingStockQuantity: 5,
            conversionMultiplier: 0.025,
          },
        ],
      },
    ]

    const results = []

    for (const product of products) {
      const response = await fetch("/api/products", {
        body: JSON.stringify(product),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body.error || `Failed to create ${product.name}`)
      }
      results.push(body)
    }

    return results
  })
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { height: 900, width: 1440 },
})
const page = await context.newPage()

try {
  await page.goto(marketingUrl, { waitUntil: "networkidle" })
  await page.getByText("Full merchant suite").click()
  await screenshot(page, "01-signup-account-type")
  await page.getByRole("button", { name: "Continue" }).click()

  await page.getByLabel("Choose your subdomain").fill(slug)
  await page.waitForTimeout(900)
  await screenshot(page, "02-signup-workspace")
  await page.getByRole("button", { name: "Continue" }).click()

  await page.getByLabel("Business name").fill("Alijawda")
  await page.getByLabel("Industry").selectOption("retail")
  await page.getByLabel("Team size").selectOption("2_10")
  await page.getByLabel("Country").selectOption("NG")
  await page.getByLabel("Phone number").fill(phone)
  await screenshot(page, "03-signup-business")
  await page.getByRole("button", { name: "Continue" }).click()

  await page.getByLabel("First name").fill("Ali")
  await page.getByLabel("Last name").fill("Jawda")
  await page.getByLabel("Email address").fill(email)
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByLabel("Confirm password").fill(password)
  await screenshot(page, "04-signup-owner-account")
  await page.getByRole("button", { name: /create workspace/i }).click()

  await page.getByText("Your workspace is ready.").waitFor({ timeout: 20000 })
  await screenshot(page, "05-signup-success")

  await copyCookiesToDashboard(context)
  await page.goto(`${dashboardUrl}/setup`, { waitUntil: "networkidle" })
  await page.getByLabel("Store name").fill("Alijawda")
  await page.getByLabel("Business type").selectOption("product_sales")
  await page.getByLabel("Main product category").fill("Rabbit and chicken feed")
  await page.getByLabel("Country").selectOption("NG")
  await page.getByLabel("Store currency").selectOption("NGN")
  await page.getByLabel("Sales method").selectOption("In-store sales")
  await page.getByLabel("Team size").selectOption("2-5 people")
  await screenshot(page, "06-dashboard-store-onboarding")
  await page.getByRole("button", { name: /create store/i }).click()
  await page.waitForURL(`${dashboardUrl}/`, { timeout: 20000 })
  await page.waitForLoadState("networkidle")
  await screenshot(page, "07-dashboard-overview-empty")

  await page.goto(`${dashboardUrl}/products`, { waitUntil: "networkidle" })
  await screenshot(page, "08-dashboard-products-empty")
  await page.getByRole("button", { name: "New product" }).click()
  await page.waitForTimeout(700)
  await screenshot(page, "09-dashboard-product-sheet")
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)

  const seededProducts = await seedProducts(page)
  await page.goto(`${dashboardUrl}/products`, { waitUntil: "networkidle" })
  await screenshot(page, "10-dashboard-products-seeded")
  await page.goto(`${dashboardUrl}/sales`, { waitUntil: "networkidle" })
  await screenshot(page, "11-dashboard-sales-empty")

  const metadata = {
    businessName: "Alijawda",
    dashboardUrl,
    email,
    productCount: seededProducts.length,
    runId,
    slug,
  }
  writeFileSync(
    resolve(dirname(outDir), "browser-qa-result.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
  )
  console.log(JSON.stringify(metadata, null, 2))
} finally {
  await browser.close()
}
