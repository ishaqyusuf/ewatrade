import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import { launchSmokeBrowser } from "./qa-web-smoke.mjs"

const origin = process.env.STOREFRONT_NAVIGATION_ORIGIN
const photoOrigin = process.env.STOREFRONT_PHOTO_ORIGIN
const performanceOrigin = process.env.STOREFRONT_PERFORMANCE_ORIGIN
const artifacts = resolve(
  process.env.STOREFRONT_NAVIGATION_ARTIFACTS ??
    ".scratch/storefront-navigation/2026-10-28",
)

test(
  "bounded existing-data storefront navigation timing",
  { skip: !performanceOrigin, timeout: 180000 },
  async () => {
    const target = new URL(performanceOrigin)
    assert.equal(target.protocol, "https:")
    assert.match(
      target.hostname,
      /^[a-z0-9-]+-qa\.ewatrade-storefront\.localhost$/,
    )
    assert.equal(target.port, "")
    const samples = []
    const responses = []
    let writes = 0
    let documents = 0
    const errors = []
    mkdirSync(artifacts, { recursive: true })
    const browser = await launchSmokeBrowser()
    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        serviceWorkers: "block",
      })
      const page = await context.newPage()
      page.setDefaultTimeout(45000)
      page.on("pageerror", (error) => errors.push(error.message))
      page.on("requestfinished", (request) => {
        if (request.headers().rsc === "1") {
          const timing = request.timing()
          responses.push({
            path: new URL(request.url()).pathname,
            milliseconds: Math.round(timing.responseEnd),
            firstByteMilliseconds: Math.round(timing.responseStart),
          })
        }
      })
      page.on("request", (request) => {
        if (
          request.isNavigationRequest() &&
          request.resourceType() === "document"
        )
          documents++
      })
      await page.route("**/*", (route) => {
        if (!["GET", "HEAD"].includes(route.request().method())) {
          writes++
          return route.abort("blockedbyclient")
        }
        return route.continue()
      })
      await page.goto(target.origin, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      })
      await page.locator(".cs-hero").waitFor()
      const header = await page.locator(".cs-header").elementHandle()
      const nav = page.getByRole("navigation", { name: /pages$/ })
      for (let round = 0; round < 3; round++) {
        for (const [label, path, selector] of [
          ["Shop", "/shop", ".cs-card"],
          ["Our story", "/about", ".cs-story"],
          ["Home", "/", ".cs-hero"],
        ]) {
          const started = performance.now()
          await nav.getByRole("link", { name: label, exact: true }).click()
          await page.waitForURL(`${target.origin}${path}`)
          await page.locator(`main ${selector}`).first().waitFor()
          samples.push({
            path,
            phase: round === 0 ? "first-visit" : "warm",
            milliseconds: Math.round(performance.now() - started),
          })
          assert.equal(await header.evaluate((node) => node.isConnected), true)
        }
      }
      const result = {
        origin: target.origin,
        runtime: "local development; source SHA recorded separately",
        samples,
        documents,
        writes,
        errors,
        responses,
        browserResources: await page.evaluate(() => {
          const entries = performance.getEntriesByType("resource")
          const scripts = entries.filter(
            (entry) => entry.initiatorType === "script",
          )
          return {
            scripts: scripts.length,
            scriptBytes: scripts.reduce(
              (sum, entry) => sum + entry.encodedBodySize,
              0,
            ),
          }
        }),
      }
      writeFileSync(
        resolve(artifacts, "performance.json"),
        JSON.stringify(result, null, 2),
      )
      console.log(JSON.stringify(result))
      assert.equal(documents, 1)
      assert.equal(writes, 0)
      assert.deepEqual(errors, [])
      const budget = Number(process.env.STOREFRONT_PERFORMANCE_BUDGET_MS)
      if (Number.isFinite(budget) && budget > 0)
        assert.ok(
          samples
            .filter((sample) => sample.phase === "warm")
            .every((sample) => sample.milliseconds <= budget),
          `Warm navigation exceeds the explicit ${budget} ms local budget`,
        )
    } finally {
      await browser.close()
    }
  },
)

test(
  "existing QA photography falls back to artwork when delivery is unavailable",
  { skip: !photoOrigin, timeout: 90000 },
  async () => {
    const target = new URL(photoOrigin)
    assert.equal(target.protocol, "https:")
    assert.match(
      target.hostname,
      /^[a-z0-9-]+-qa\.ewatrade-storefront\.localhost$/,
    )
    assert.equal(target.port, "")
    assert.ok(["/", "/qa-template-preview"].includes(target.pathname))
    mkdirSync(artifacts, { recursive: true })
    const browser = await launchSmokeBrowser()
    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        serviceWorkers: "block",
      })
      const page = await context.newPage()
      let unavailable = false
      let blockedPhotos = 0
      let writes = 0
      const errors = []
      page.on("pageerror", (error) => errors.push(error.message))
      await page.route("**/*", async (route) => {
        const request = route.request()
        if (!["GET", "HEAD"].includes(request.method())) {
          writes++
          return route.abort("blockedbyclient")
        }
        if (
          unavailable &&
          new URL(request.url()).pathname.startsWith("/qa-photo/")
        ) {
          blockedPhotos++
          return route.fulfill({
            status: 404,
            contentType: "text/plain",
            body: "Unavailable for the photo failure check",
          })
        }
        return route.continue()
      })
      await page.goto(target.href, { waitUntil: "domcontentloaded" })
      await page.locator(".sf-product-photo").first().waitFor()
      const tileIndex = await page.evaluate(() =>
        [...document.querySelectorAll(".sf-tile")].findIndex((tile) =>
          tile.querySelector(".sf-product-photo"),
        ),
      )
      assert.ok(tileIndex >= 0, "an existing configured photo is present")
      await page.locator(".sf-tile").nth(tileIndex).scrollIntoViewIfNeeded()
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".sf-product-photo")].some(
          (image) => image.complete && image.naturalWidth > 0,
        ),
      )
      unavailable = true
      await page.reload({ waitUntil: "domcontentloaded" })
      const tile = page.locator(".sf-tile").nth(tileIndex)
      await tile.scrollIntoViewIfNeeded()
      await tile.locator(".sf-tile-art svg").waitFor()
      assert.equal(await tile.locator("img").count(), 0)
      assert.ok(blockedPhotos > 0)
      assert.equal(writes, 0)
      assert.deepEqual(errors, [])
      await page.screenshot({ path: resolve(artifacts, "photo-fallback.png") })
      writeFileSync(
        resolve(artifacts, "photo-verification.json"),
        JSON.stringify(
          {
            origin: target.origin,
            existingPhotosLoaded: true,
            failedPhotoUsesArtwork: true,
            blockedPhotos,
            writes,
            errors,
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

async function desktopShell(page) {
  const layout = await page.evaluate(() => {
    const viewport = document.querySelector(".sf-template-viewport")
    const nav = document.querySelector(".cs-nav")?.getBoundingClientRect()
    const wordmark = document
      .querySelector(".cs-wordmark")
      ?.getBoundingClientRect()
    const footer = document.querySelector(".cs-footer__grid")
    return {
      viewports: document.querySelectorAll(".sf-template-viewport").length,
      name: viewport && getComputedStyle(viewport).containerName,
      containment: viewport && getComputedStyle(viewport).containerType,
      navigationSharesHeaderRow:
        nav &&
        wordmark &&
        nav.top < wordmark.bottom &&
        nav.bottom > wordmark.top,
      footerColumns:
        footer &&
        getComputedStyle(footer).gridTemplateColumns.split(" ").length,
    }
  })
  assert.equal(layout.viewports, 1, "one responsive storefront container")
  assert.equal(layout.name, "storefront")
  assert.equal(layout.containment, "inline-size")
  assert.equal(layout.navigationSharesHeaderRow, true)
  assert.equal(layout.footerColumns, 4)
}

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
      await desktopShell(page)
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
      assert.ok(
        (await page
          .locator(".cs-grid")
          .evaluate(
            (node) =>
              getComputedStyle(node).gridTemplateColumns.split(" ").length,
          )) >= 3,
        "desktop catalog uses multiple columns",
      )
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
      const hero = await page.locator(".cs-hero__grid").evaluate((node) => {
        const copy = node
          .querySelector(".cs-hero__copy")
          ?.getBoundingClientRect()
        const media = node
          .querySelector(".cs-hero__media")
          ?.getBoundingClientRect()
        return {
          columns: getComputedStyle(node).gridTemplateColumns.split(" ").length,
          sideBySide: copy && media && media.left >= copy.right,
        }
      })
      assert.equal(hero.columns, 2)
      assert.equal(hero.sideBySide, true)
      // A bag held only in memory proves provider lifetime, rather than storage rehydration.
      await page.locator(".cs-card h3 a").first().click()
      await page.locator(".cs-product__grid").waitFor()
      assert.equal(
        await page
          .locator(".cs-product__grid")
          .evaluate(
            (node) =>
              getComputedStyle(node).gridTemplateColumns.split(" ").length,
          ),
        2,
        "desktop product photo and controls sit side by side",
      )
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
      await desktopShell(page)
      assert.equal(await page.locator(".cs-dock").isVisible(), false)
      assert.equal(documents, initialDocuments)
      assert.equal(writes, 0)
      assert.deepEqual(errors, [])
      await page.screenshot({ path: resolve(artifacts, "home.png") })
      await page.setViewportSize({ width: 390, height: 844 })
      assert.equal(await page.locator(".cs-dock").isVisible(), true)
      assert.equal(
        await page
          .locator(".cs-hero__grid")
          .evaluate(
            (node) =>
              getComputedStyle(node).gridTemplateColumns.split(" ").length,
          ),
        1,
        "phone hero stacks",
      )
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
              "desktop responsive container/header/hero/catalog/product/footer",
              "bag dock hidden on desktop and visible on phone",
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
