import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { webkit } from "playwright"

const marketingOrigin = requireEnvironment("QA_ACCEPTANCE_MARKETING_ORIGIN")
const dashboardOrigin = requireEnvironment("QA_ACCEPTANCE_DASHBOARD_ORIGIN")
const qaDomain = requireEnvironment("QA_ACCEPTANCE_DOMAIN")
const credential = requireEnvironment("QA_ACCEPTANCE_CREDENTIAL")
const evidenceDirectory =
  process.env.QA_ACCEPTANCE_EVIDENCE_DIRECTORY?.trim() ||
  "/private/tmp/ewatrade-qa-webkit-acceptance"

function requireEnvironment(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  assert.ok(
    dimensions.scrollWidth <= dimensions.clientWidth,
    `${label} overflows horizontally: ${JSON.stringify(dimensions)}`,
  )
}

async function authorize(page) {
  await page.getByLabel("QA domain").fill(qaDomain)
  await page.getByLabel("Tester credential").fill(credential)
  await page.getByRole("button", { name: "Load QA businesses" }).click()
  await page
    .getByRole("button", { name: "Open 2 QA businesses" })
    .waitFor({ state: "visible" })
}

await mkdir(evidenceDirectory, { recursive: true })

const browser = await webkit.launch({ headless: true })
try {
  const context = await browser.newContext({
    viewport: { height: 900, width: 1280 },
  })
  const primary = await context.newPage()
  const abortCapability = (route) => route.abort("failed")
  await primary.route("**/api/qa-access/capability?*", abortCapability)
  await primary.goto(`${marketingOrigin}/login`, { waitUntil: "networkidle" })

  const gate = primary.getByRole("dialog", { name: "Connect QA workspace" })
  await gate.waitFor({ state: "visible" })
  await primary
    .getByText("QA access stays blocked while authorization cannot be checked.")
    .waitFor({ state: "visible" })
  await primary.screenshot({
    fullPage: true,
    path: path.join(evidenceDirectory, "00-network-fail-closed.png"),
  })
  await primary.unroute("**/api/qa-access/capability?*", abortCapability)
  await primary.getByRole("button", { name: "Retry connection" }).click()
  await primary.getByLabel("QA domain").waitFor({ state: "visible" })

  const unavailableCapability = (route) =>
    route.fulfill({
      body: JSON.stringify({ available: false, category: "misconfigured" }),
      contentType: "application/json",
      status: 200,
    })
  await primary.route("**/api/qa-access/capability?*", unavailableCapability)
  await primary.reload({ waitUntil: "networkidle" })
  await primary
    .getByText("This preview server has not enabled the QA accelerator.", {
      exact: false,
    })
    .waitFor({ state: "visible" })
  await primary.unroute("**/api/qa-access/capability?*", unavailableCapability)
  await primary.getByRole("button", { name: "Retry configuration" }).click()
  await primary.getByLabel("QA domain").waitFor({ state: "visible" })

  await primary.screenshot({
    fullPage: true,
    path: path.join(evidenceDirectory, "01-first-view-gate-desktop.png"),
  })

  if (process.env.QA_ACCEPTANCE_CHECK_INVALID !== "false") {
    await primary.getByLabel("QA domain").fill(qaDomain)
    await primary.getByLabel("Tester credential").fill("invalid-credential")
    await primary.getByRole("button", { name: "Load QA businesses" }).click()
    await primary
      .getByText("QA access could not be authorized.", { exact: true })
      .waitFor({ state: "visible" })
  }

  await authorize(primary)
  const cookies = await context.cookies(marketingOrigin)
  for (const cookieName of [
    "ewatrade.qa_authorization.v1",
    "ewatrade.qa_client.v1",
  ]) {
    const cookie = cookies.find((candidate) => candidate.name === cookieName)
    assert.ok(cookie, `${cookieName} was not retained.`)
    assert.equal(cookie.httpOnly, true)
    assert.equal(cookie.sameSite, "Lax")
    assert.equal(cookie.path, "/")
    assert.equal(cookie.secure, marketingOrigin.startsWith("https://"))
  }

  const secondary = await context.newPage()
  await secondary.goto(`${marketingOrigin}/login`, { waitUntil: "networkidle" })
  await secondary
    .getByRole("button", { name: "Open 2 QA businesses" })
    .waitFor({ state: "visible" })
  await secondary.reload({ waitUntil: "networkidle" })
  await secondary.goto(marketingOrigin, { waitUntil: "networkidle" })
  await secondary.goBack({ waitUntil: "networkidle" })
  await secondary
    .getByRole("button", { name: "Open 2 QA businesses" })
    .waitFor({ state: "visible" })

  const chooserButton = secondary.getByRole("button", {
    name: "Open 2 QA businesses",
  })
  await chooserButton.focus()
  await secondary.keyboard.press("Enter")
  const chooser = secondary.getByRole("dialog", { name: "QA businesses" })
  await chooser.waitFor({ state: "visible" })
  await secondary
    .getByPlaceholder("Business, owner, role, or store")
    .fill("Beta")
  await secondary.getByRole("button", { name: /QA Acceptance Beta/ }).waitFor()
  assert.equal(
    await secondary
      .getByRole("button", { name: /QA Acceptance Alpha/ })
      .count(),
    0,
  )
  await secondary.getByLabel("Close QA businesses").click()

  await primary.getByRole("button", { name: "Open 2 QA businesses" }).click()
  await primary.getByRole("button", { name: "Clear QA data" }).click()
  await secondary
    .getByRole("dialog", { name: "Connect QA workspace" })
    .waitFor({ state: "visible" })

  await authorize(secondary)
  await secondary.setViewportSize({ height: 844, width: 390 })
  await secondary.getByRole("button", { name: "Open 2 QA businesses" }).click()
  await secondary.getByPlaceholder("Business, owner, role, or store").fill("")
  await assertNoHorizontalOverflow(secondary, "narrow QA chooser")
  await secondary.screenshot({
    fullPage: true,
    path: path.join(evidenceDirectory, "02-business-chooser-narrow.png"),
  })
  const selectionResponse = secondary.waitForResponse(
    (response) =>
      response.url().endsWith("/api/qa-access/select") &&
      response.request().method() === "POST",
  )
  await secondary.getByRole("button", { name: /QA Acceptance Alpha/ }).click()
  const selection = await selectionResponse
  assert.equal(selection.status(), 200)
  const setCookieHeaders = await selection.headerValues("set-cookie")
  const redactedSetCookieHeaders = setCookieHeaders.map((header) =>
    header.replace(
      /^[^=]+=[^;]*/,
      (cookie) => `${cookie.slice(0, cookie.indexOf("="))}=<redacted>`,
    ),
  )
  const selectedCookies = await context.cookies()
  const sessionCookie = selectedCookies.find((cookie) =>
    [
      "better-auth.session_token",
      "__Secure-better-auth.session_token",
    ].includes(cookie.name),
  )
  assert.ok(
    sessionCookie,
    `Profile selection did not install an ordinary session cookie. Cookies: ${selectedCookies
      .map((cookie) => cookie.name)
      .sort()
      .join(", ")}. Set-Cookie: ${JSON.stringify(redactedSetCookieHeaders)}`,
  )
  await secondary.goto(dashboardOrigin, { waitUntil: "networkidle" })
  assert.equal(new URL(secondary.url()).origin, dashboardOrigin)

  const staffMutations = []
  secondary.on("request", (request) => {
    if (
      request.method() !== "GET" &&
      new URL(request.url()).pathname === "/api/staff"
    ) {
      staffMutations.push(request.method())
    }
  })
  await secondary.goto(`${dashboardOrigin}/staff?staffSheet=invite`, {
    waitUntil: "networkidle",
  })
  const quickFill = secondary.getByRole("button", {
    name: new RegExp(`Quick Fill using ${qaDomain.replaceAll(".", "\\.")}`),
  })
  await quickFill.waitFor({ state: "visible", timeout: 30_000 })
  await quickFill.click()
  const generatedEmail = await secondary
    .locator('input[type="email"]')
    .inputValue()
  assert.ok(
    generatedEmail.endsWith(`@${qaDomain}`),
    "Staff Quick Fill did not use the active QA Domain.",
  )
  assert.deepEqual(staffMutations, [], "Staff Quick Fill submitted the form.")
  await assertNoHorizontalOverflow(secondary, "narrow Staff sheet")
  await secondary.screenshot({
    fullPage: true,
    path: path.join(evidenceDirectory, "03-staff-quick-fill-narrow.png"),
  })

  process.stdout.write(
    `${JSON.stringify({
      browser: "webkit",
      evidenceDirectory,
      generatedEmailDomain: generatedEmail.split("@").pop(),
      submitted: false,
      status: "passed",
      viewports: ["1280x900", "390x844"],
    })}\n`,
  )
} finally {
  await browser.close()
}
