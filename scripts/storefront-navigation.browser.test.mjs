import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import { launchSmokeBrowser } from "./qa-web-smoke.mjs"

const origin = process.env.STOREFRONT_NAVIGATION_ORIGIN
const artifacts = resolve(".scratch/storefront-navigation/2026-10-28")

test(
  "configured storefront retains its shell during streaming navigation",
  {
    skip: !origin,
    timeout: 180000,
  },
  async () => {
    const target = new URL(origin)
    assert.equal(target.protocol, "https:")
    assert.match(
      target.hostname,
      /^[a-z0-9-]+-qa\.ewatrade-storefront\.localhost$/,
    )
    assert.equal(target.port, "")
    mkdirSync(artifacts, { recursive: true })
    const browser = await launchSmokeBrowser()
    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        serviceWorkers: "block",
      })
      await context.addInitScript(() => {
        Object.defineProperty(window, "localStorage", {
          get() {
            throw new DOMException(
              "Blocked for bag lifetime test",
              "SecurityError",
            )
          },
        })
      })
      const page = await context.newPage()
      page.setDefaultTimeout(30000)
      let documents = 0
      let writes = 0
      const errors = []
      page.on("pageerror", (error) => errors.push(error.message))
      page.on("request", (request) => {
        if (
          request.isNavigationRequest() &&
          request.resourceType() === "document"
        )
          documents++
      })
      await page.route("**/*", async (route) => {
        const request = route.request()
        if (!["GET", "HEAD"].includes(request.method())) {
          writes++
          return route.abort("blockedbyclient")
        }
        const url = new URL(request.url())
        if (
          url.origin === target.origin &&
          url.pathname === "/shop" &&
          request.headers().rsc === "1"
        )
          await new Promise((done) => setTimeout(done, 1500))
        return route.continue()
      })
      await page.goto(`${target.origin}/services`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      })
      await page
        .getByRole("heading", { name: "Services", exact: true })
        .waitFor()
      assert.equal(await page.locator("main").count(), 1)
      const header = await page.locator(".cs-header").elementHandle()
      const footer = await page.locator(".cs-footer").elementHandle()
      assert.ok(header && footer)
      const initialDocuments = documents
      const nav = page.getByRole("navigation", { name: /pages$/ })
      await nav.getByRole("link", { name: "Shop", exact: true }).click()
      await page.getByLabel("Loading shop", { exact: true }).waitFor()
      assert.equal(await header.evaluate((node) => node.isConnected), true)
      await page.screenshot({ path: resolve(artifacts, "shop-loading.png") })
      await page.locator(".cs-card").first().waitFor()
      assert.equal(
        await header.evaluate(
          (node) => node === document.querySelector(".cs-header"),
        ),
        true,
      )
      assert.equal(
        await footer.evaluate(
          (node) => node === document.querySelector(".cs-footer"),
        ),
        true,
      )
      await nav.getByRole("link", { name: "Our story", exact: true }).click()
      await page.waitForURL(`${target.origin}/about`)
      await page.getByRole("heading", { level: 1 }).waitFor()
      await page.goBack()
      await page.waitForURL(`${target.origin}/shop`)
      await page.locator(".cs-card").first().waitFor()
      await nav.getByRole("link", { name: "Home", exact: true }).click()
      await page.waitForURL(`${target.origin}/`)
      await page.getByRole("heading", { level: 1 }).waitFor()
      assert.equal(await header.evaluate((node) => node.isConnected), true)
      // A bag held only in memory proves provider lifetime, rather than storage rehydration.
      await page.locator(".cs-card h3 a").first().click()
      await page.getByRole("button", { name: /^Add to bag/ }).click()
      await page.getByRole("button", { name: "Close bag", exact: true }).click()
      await nav.getByRole("link", { name: "Services", exact: true }).click()
      await page
        .getByRole("heading", { name: "Services", exact: true })
        .waitFor()
      await page
        .getByRole("button", { name: "Bag, 1 item", exact: true })
        .waitFor()
      await nav.getByRole("link", { name: "Home", exact: true }).click()
      await page.waitForURL(`${target.origin}/`)
      await page.getByRole("heading", { level: 1 }).waitFor()
      assert.equal(documents, initialDocuments)
      assert.equal(writes, 0)
      assert.deepEqual(errors, [])
      await page.screenshot({ path: resolve(artifacts, "home.png") })
      await page.setViewportSize({ width: 390, height: 844 })
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      )
      await page.screenshot({ path: resolve(artifacts, "home-phone.png") })
      writeFileSync(
        resolve(artifacts, "verification.json"),
        JSON.stringify(
          {
            origin: target.origin,
            documents,
            writes,
            errors,
            shellRetained: true,
            checks: [
              "native loading fallback",
              "header/footer node identity",
              "Shop/About/Back/Home soft navigation",
              "one main",
              "in-memory bag survives item/Services/Home navigation",
              "phone containment",
            ],
          },
          null,
          2,
        ),
      )
      await context.close()
    } finally {
      await browser.close()
    }
  },
)
