import assert from "node:assert/strict"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import { launchSmokeBrowser } from "./qa-web-smoke.mjs"

const enabled = process.env.RUN_JAWDAH_MOBILE_QA === "1"
const origin =
  "https://jawdah-poultry-qa-62bf6899-qa.ewatrade-storefront.localhost"
const artifacts = resolve(".scratch/jawdah-storefront/2026-10-28/mobile")
const productId = "cmuvpgsfc0000z19kraila9rq"
const serviceId = "cmuwrhwn1002hex9km4qzwrmj"

// Reuses the canonical QA browser launcher. This feature check only reads existing
// QA data and changes an isolated browser's bag/draft; business writes refuse; only the manifest-identified read-only bag action is allowed.
test(
  "Jawdah phone galleries, four-crate draft, booking preference and paid receipt",
  { skip: !enabled, timeout: 180000 },
  async () => {
    mkdirSync(artifacts, { recursive: true })
    const browser = await launchSmokeBrowser()
    const errors = []
    const blockedWrites = []
    const checks = []
    const readActions = []
    const readActionIds = new Set()
    for (const folder of [
      "apps/storefront/.next/dev/server",
      "apps/storefront/.next/server",
    ]) {
      try {
        const manifest = JSON.parse(
          readFileSync(
            resolve(
              folder,
              "app/(storefront)/checkout/page/server-reference-manifest.json",
            ),
            "utf8",
          ),
        )
        for (const [id, action] of Object.entries(manifest.node ?? {}))
          if (
            action.exportedName === "checkStorefrontBag" &&
            action.filename ===
              "apps/storefront/src/app/storefront-commerce-actions.ts"
          )
            readActionIds.add(id)
      } catch {
        /* Another Next runtime may use the other build directory. */
      }
    }
    try {
      assert.ok(
        readActionIds.size,
        "current server manifest identifies the read-only bag action",
      )
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        serviceWorkers: "block",
      })
      const page = await context.newPage()
      page.setDefaultTimeout(30000)
      page.on("pageerror", (error) => errors.push(error.message))
      let failPhotos = false
      await page.route("**/*", (route) => {
        const request = route.request()
        const url = new URL(request.url())
        if (
          request.method() === "POST" &&
          url.origin === origin &&
          ["/", "/checkout"].includes(url.pathname) &&
          readActionIds.has(request.headers()["next-action"])
        ) {
          readActions.push("checkStorefrontBag")
          return route.continue()
        }
        if (!["GET", "HEAD"].includes(request.method())) {
          blockedWrites.push(new URL(request.url()).pathname)
          return route.abort("blockedbyclient")
        }
        if (
          failPhotos &&
          new URL(request.url()).pathname.startsWith("/api/catalog/public/")
        )
          return route.fulfill({
            status: 404,
            body: "Local QA unavailable-image check",
          })
        return route.continue()
      })
      async function phone(name) {
        const size = await page.evaluate(() => ({
          viewport: innerWidth,
          client: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
        }))
        assert.equal(size.viewport, 390, `${name}: real phone viewport`)
        assert.ok(
          size.scroll <= size.client + 1,
          `${name}: no horizontal page overflow (${size.scroll}/${size.client})`,
        )
        await page.evaluate(() => scrollTo(0, 0))
        await page.screenshot({
          path: resolve(artifacts, `${name}.png`),
          fullPage: false,
        })
        checks.push({ name, ...size })
      }
      async function gallery(name) {
        const stage = page.getByRole("group", {
          name: `${name} photos`,
          exact: true,
        })
        await stage.waitFor()
        await page.waitForFunction(() => {
          const image = document.querySelector(".sf-feature-gallery__photo")
          return image?.complete && image.naturalWidth > 0
        })
        assert.equal(
          await page
            .getByRole("button", { name: /^Show photo \d of 2$/ })
            .count(),
          2,
        )
        const first = await stage.locator("img").getAttribute("src")
        await stage.focus()
        await page.keyboard.press("ArrowRight")
        await page
          .getByRole("button", { name: "Show photo 2 of 2", exact: true })
          .waitFor()
        assert.equal(
          await page
            .getByRole("button", { name: "Show photo 2 of 2", exact: true })
            .getAttribute("aria-current"),
          "true",
        )
        assert.notEqual(await stage.locator("img").getAttribute("src"), first)
        await page
          .getByRole("button", { name: "Show photo 1 of 2", exact: true })
          .click()
        assert.equal(await stage.locator("img").getAttribute("src"), first)
        await page.waitForFunction(() => {
          const image = document.querySelector(".sf-feature-gallery__photo")
          return image?.complete && image.naturalWidth > 0
        })
        assert.ok(
          await stage.locator("img").evaluate((image) => {
            const bounds = image.getBoundingClientRect()
            return bounds.width >= 300 && bounds.height >= 200
          }),
          "selected gallery image occupies the phone stage",
        )
      }
      await page.goto(`${origin}/?item=${productId}`, {
        waitUntil: "domcontentloaded",
      })
      await page.getByRole("heading", { name: "Eggs", exact: true }).waitFor()
      await gallery("Eggs")
      await phone("product-gallery")
      await page.getByRole("button", { name: /^Small · Crate,/ }).click()
      await page
        .getByRole("textbox", { name: "Quantity", exact: true })
        .fill("4")
      await page.getByRole("button", { name: /^Add to bag/ }).click()
      const bag = page.getByRole("dialog", { name: "Your bag", exact: true })
      await bag.waitFor()
      assert.equal(
        await bag
          .getByRole("textbox", { name: "Quantity of Eggs", exact: true })
          .inputValue(),
        "4",
      )
      assert.match(await bag.innerText(), /₦18,000/)
      await phone("four-crate-bag")
      await bag
        .getByRole("link", { name: "Continue to request", exact: true })
        .click()
      await page
        .getByRole("heading", { name: "Send your order request", exact: true })
        .waitFor()
      await page
        .getByRole("textbox", { name: "Your name", exact: true })
        .fill("Jawdah Mobile QA draft")
      await page.getByText("Order summary", { exact: true }).click()
      await phone("checkout")
      await page
        .getByRole("main")
        .getByRole("link", { name: "Eggs", exact: true })
        .click()
      await page.getByRole("heading", { name: "Eggs", exact: true }).waitFor()
      await page.goBack()
      await page
        .getByRole("heading", { name: "Send your order request", exact: true })
        .waitFor()
      assert.equal(
        await page
          .getByRole("textbox", { name: "Your name", exact: true })
          .inputValue(),
        "Jawdah Mobile QA draft",
      )
      assert.match(await page.getByRole("main").innerText(), /₦18,000/)
      checks.push({
        name: "item-link-back-retains-four-crate-draft",
        passed: true,
      })
      await page.goto(`${origin}/?item=${serviceId}`, {
        waitUntil: "domcontentloaded",
      })
      await page
        .getByRole("heading", { name: "QA bird dressing 6 Oct", exact: true })
        .waitFor()
      await gallery("QA bird dressing 6 Oct")
      await page.getByLabel(/^Preferred date/).fill("2026-11-05")
      assert.equal(
        await page
          .getByLabel("Preferred time (optional)", { exact: true })
          .isEnabled(),
        true,
      )
      await phone("service-booking")
      const receipt = new URL(
        readFileSync(
          resolve(artifacts, "../journey-receipt-url.txt"),
          "utf8",
        ).trim(),
      )
      assert.equal(receipt.origin, origin)
      assert.match(receipt.pathname, /^\/receipt\//)
      await page.goto(receipt.href, { waitUntil: "domcontentloaded" })
      await page.getByRole("heading", { name: "Paid", exact: true }).waitFor()
      assert.match(await page.getByRole("main").innerText(), /₦19,500/)
      assert.match(await page.getByRole("main").innerText(), /Amount due\s*₦0/)
      await phone("paid-receipt")
      failPhotos = true
      await page.goto(`${origin}/?item=${productId}`, {
        waitUntil: "domcontentloaded",
      })
      await page.getByRole("heading", { name: "Eggs", exact: true }).waitFor()
      await page
        .locator(".sf-feature-gallery__photo")
        .waitFor({ state: "hidden" })
      assert.equal(
        await page.getByRole("button", { name: /^Add to bag/ }).isEnabled(),
        true,
      )
      await phone("failed-images-usable-product")
      assert.deepEqual(blockedWrites, [])
      assert.deepEqual(errors, [])
      writeFileSync(
        resolve(artifacts, "verification.json"),
        JSON.stringify(
          {
            viewport: { width: 390, height: 844 },
            checks,
            blockedWrites,
            readActions,
            errors,
            providerCalls: 0,
            businessSubmissions: 0,
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
