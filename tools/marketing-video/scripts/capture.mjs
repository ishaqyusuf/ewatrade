import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const base =
  process.env.VIDEO_DASHBOARD || "https://ewatrade-dashboard.localhost"
if (
  !["ewatrade-dashboard.localhost", "capture-dashboard.localhost"].includes(
    new URL(base).hostname,
  )
)
  throw Error("Capture permits only exact authorized local QA dashboard hosts")
const variant = process.argv[2] || "web"
if (!["web", "mobile"].includes(variant)) throw Error("Unknown variant")
const inspect = process.argv.includes("--inspect")
const signupOnly = process.argv.includes("--signup-only")
const only = process.argv.find((a) => a.startsWith("--chapter="))?.split("=")[1]
const fixtures = JSON.parse(
  await readFile(path.join(root, "output/fixtures.json"), "utf8"),
)
const businesses = JSON.parse(
  await readFile(path.join(root, "fixtures/businesses.json"), "utf8"),
)
const browser = await chromium.launch({
  executablePath:
    process.env.VIDEO_CHROME ||
    "/Users/M1PRO/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  headless: true,
})
const previous =
  !signupOnly && process.argv.includes("--resume")
    ? JSON.parse(
        await readFile(
          path.join(root, `output/capture-${variant}.json`),
          "utf8",
        ).catch(() => '{"results":[]}'),
      ).results.filter((r) => !r.error)
    : []
const results = [...previous]
try {
  for (const business of businesses.filter((b) => !only || b.id === only)) {
    if (results.some((r) => r.id === business.id)) continue
    const fixture = fixtures.fixtures.find(
      (f) => f.variant === variant && f.id === business.id,
    )
    if (!fixture || !fixture.email.endsWith("@ishaq.qa.test"))
      throw Error("QA fixture missing")
    const dir = path.join(root, "public/captures", variant, business.id)
    await mkdir(dir, { recursive: true })
    const viewport =
      variant === "mobile"
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 }
    const context = await browser.newContext({
      viewport,
      ignoreHTTPSErrors: true,
      recordVideo: inspect || signupOnly ? undefined : { dir, size: viewport },
      isMobile: variant === "mobile",
      hasTouch: variant === "mobile",
    })
    const blockedWrites = []
    if (signupOnly)
      await context.route("**/*", async (route) => {
        const request = route.request()
        if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) {
          blockedWrites.push({
            method: request.method(),
            path: new URL(request.url()).pathname,
          })
          await route.abort()
        } else await route.continue()
      })
    const page = await context.newPage()
    const browserErrors = []
    page.on("pageerror", (error) => browserErrors.push(String(error)))
    page.on("requestfailed", (request) =>
      browserErrors.push(
        `${new URL(request.url()).pathname}: ${request.failure()?.errorText}`,
      ),
    )
    if (inspect)
      page.on("response", async (r) => {
        if (r.url().includes("setupAssistant.state"))
          console.log(
            "Assistant state",
            r.status(),
            (await r.text()).slice(0, 1800),
          )
      })
    const events = []
    const started = performance.now()
    const mark = async (name) => {
      events.push({ name, elapsedMs: Math.round(performance.now() - started) })
      await page.screenshot({ path: path.join(dir, `${name}.png`) })
      console.log(
        `${variant}/${business.id}: ${name} at ${((performance.now() - started) / 1000).toFixed(1)}s`,
      )
    }
    try {
      // Actual signup form only. No email, legal acceptance or account creation.
      await page.goto(`${base}/signup?profile=${business.profileKey}`, {
        waitUntil: "domcontentloaded",
      })
      await page.waitForTimeout(2500)
      const adult = page.getByRole("radio", {
        name: "18 or older",
        exact: true,
      })
      if (await adult.count()) {
        await adult.check()
        await page.getByRole("button", { name: /^Continue/ }).click()
      }
      await page
        .getByRole("heading", { name: "Start your next chapter.", exact: true })
        .waitFor({ state: "visible", timeout: 60000 })
      await page
        .getByLabel("Your full name", { exact: true })
        .fill(business.owner)
      await page
        .getByLabel("Business name", { exact: true })
        .fill(business.business)
      await page
        .getByLabel("Email address", { exact: true })
        .fill(fixture.email)
      await page.waitForTimeout(1200)
      await mark("signup-form")
      if (signupOnly) {
        results.push({
          id: business.id,
          variant,
          heading: "Start your next chapter.",
          signup: "Unsubmitted actual form only",
          readOnly: true,
          blockedWrites,
          events,
        })
        continue
      }
      const auth = await context.request.post(`${base}/api/qa-access`, {
        data: { action: "authorize", qaDomain: "ishaq.qa.test" },
        headers: { origin: base },
        timeout: 60000,
      })
      const access = await auth.json()
      if (!auth.ok()) throw Error(access.message || "QA authorization failed")
      const profile = access.access?.profiles.find(
        (p) =>
          p.identity.email === fixture.email && p.membership.role === "OWNER",
      )
      if (!profile || profile.business.id !== fixture.tenantId)
        throw Error("Exact QA profile mismatch")
      const select = await context.request.post(`${base}/api/qa-access`, {
        data: {
          action: "select",
          profileReference: profile.profileReference,
          next: "/?setup=assistant",
        },
        headers: { origin: base },
        timeout: 60000,
      })
      const selected = await select.json()
      if (!select.ok()) throw Error(selected.message || "QA selection failed")
      if (!new URL(selected.redirectTo, base).hostname.endsWith(".localhost"))
        throw Error("Non-local redirect refused")
      const redirect = new URL(selected.redirectTo, base)
      if (redirect.hostname !== new URL(base).hostname)
        throw Error(
          `QA selection redirected outside exact capture host: ${redirect.hostname}`,
        )
      const stateReady = page
        .waitForResponse((r) => r.url().includes("setupAssistant.state"), {
          timeout: 60000,
        })
        .catch(() => null)
      await page.goto(redirect.href, { waitUntil: "domcontentloaded" })
      const stateResponse = await stateReady
      if (inspect && !stateResponse)
        console.log(
          "No assistant state request; browser errors",
          browserErrors,
          await page.locator("body").ariaSnapshot(),
        )
      await page.waitForTimeout(5000)
      await mark("setup-entry")
      if (inspect) {
        console.log((await page.locator("body").innerText()).slice(0, 10000))
        continue
      }
      const setupStarted = performance.now()
      const startButton = page.getByRole("button", {
        name: "Set up with AI",
        exact: true,
      })
      if (await startButton.count()) await startButton.click()
      const textarea = page.getByRole("textbox", {
        name: "Tell the assistant about your business",
      })
      await textarea.waitFor({ state: "visible", timeout: 30000 })
      for (const [index, line] of business.input.split("\n").entries()) {
        if (index > 0) await textarea.press("Shift+Enter")
        await textarea.pressSequentially(line, { delay: 28 })
      }
      await mark("typed-input")
      await page.getByRole("button", { name: "Send", exact: true }).click()
      await page
        .getByRole("button", { name: "Stop", exact: true })
        .waitFor({ state: "hidden", timeout: 90000 })
      const listButton = page
        .getByRole("button", { name: /Setup list/ })
        .first()
      if ((await listButton.count()) && (await listButton.isVisible()))
        await listButton.click()
      await page.waitForTimeout(1000)
      if (
        await page
          .getByRole("heading", {
            name: "Accept the EwaTrade Terms",
            exact: true,
          })
          .count()
      )
        throw Error("Terms gate present; capture never accepts owner Terms")
      const confirms = page
        .getByRole("button", { name: /^Confirm all ready/ })
        .filter({ visible: true })
      await confirms.first().waitFor({ state: "visible", timeout: 60000 })
      await mark("draft-ready")
      await mark("review-list")
      await confirms.first().click()
      await page
        .getByRole("button", { name: "Add 2 to my business", exact: true })
        .filter({ visible: true })
        .waitFor({ state: "visible", timeout: 30000 })
      const individual = page
        .getByRole("button", { name: "Confirm", exact: true })
        .filter({ visible: true })
      while (await individual.count()) {
        await individual.first().click()
        await page.waitForTimeout(300)
      }
      await mark("confirmed")
      const add = page
        .getByRole("button", { name: /^Add(?: \d+)? to my business/ })
        .filter({ visible: true })
        .first()
      await add.click({ timeout: 30000 })
      await page
        .getByText("2 added to your business", { exact: false })
        .filter({ visible: true })
        .first()
        .waitFor({ timeout: 60000 })
      await page.waitForTimeout(1400)
      await mark("added")
      const close = page
        .getByRole("button", { name: "Close", exact: true })
        .filter({ visible: true })
      if (await close.count()) await close.first().click()
      const done = page
        .getByRole("button", { name: "Done for now", exact: true })
        .filter({ visible: true })
      if (await done.count()) await done.first().click()
      await page.goto(new URL("/catalog", page.url()).href, {
        waitUntil: "domcontentloaded",
      })
      await page
        .getByText(business.input.split(",")[0], { exact: true })
        .first()
        .waitFor({ timeout: 30000 })
      await page.waitForTimeout(1600)
      await mark("catalog-result")
      const setupElapsedMs = Math.round(performance.now() - setupStarted)
      console.log(
        `${variant}/${business.id}: ${setupElapsedMs}ms through actual Add and Catalog readback`,
      )
      results.push({
        id: business.id,
        variant,
        classification: "QA",
        provider: "existing provider-free rehearsal",
        signup: "Form only; separate pre-seeded QA workspace",
        setupElapsedMs,
        totalElapsedMs: Math.round(performance.now() - started),
        events,
        sourceUrl: page.url(),
        commit: "2 records added and actual Catalog names read back",
      })
      await page.waitForTimeout(2000)
    } catch (error) {
      await page
        .screenshot({ path: path.join(dir, "failure.png") })
        .catch(() => {})
      results.push({ id: business.id, variant, error: String(error), events })
      console.error(`${variant}/${business.id}: ${error}`)
      console.log((await page.locator("body").innerText()).slice(-6000))
    } finally {
      const video = page.video()
      await context.close()
      if (video) await video.saveAs(path.join(dir, "raw.webm"))
    }
  }
} finally {
  await browser.close()
}
await writeFile(
  path.join(
    root,
    `output/capture-${signupOnly ? "signup-" : ""}${variant}.json`,
  ),
  JSON.stringify({ capturedAt: new Date().toISOString(), results }, null, 2),
)
if (results.some((r) => r.error)) process.exitCode = 1
