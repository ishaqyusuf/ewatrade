/**
 * Local-only browser regression harness; never starts or stops a dev stack.
 * Run with Bun from the root: bun apps/marketing/src/lib/store-in-a-minute-browser-qa.mjs matrix|player
 * Uses tools/marketing-video's existing Playwright dependency and installed Chrome.
 * player mode needs process-only WEB/MOBILE SRC, POSTER and CAPTIONS envs on the
 * root marketing dev process: /__qa/player/test.m3u8, test.mp4, poster.jpg,
 * captions.vtt at QA_MARKETING_URL. It intercepts these URLs, generates temporary
 * FFmpeg fixtures, and captures analytics locally. Restore normal dev env afterward.
 * QA_ASSERT_ANALYTICS=true requires the test dev process to enable marketing analytics.
 * QA_OUTPUT_DIR, QA_BROWSER_PATH and QA_PLAYWRIGHT_MODULE are optional overrides.
 * No account, legal, database, deployment, or external analytics mutation runs.
 */
import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { getStoreInAMinuteConfig } from "./store-in-a-minute-video.ts"
const root = fileURLToPath(new URL("../../../../", import.meta.url))
const { chromium } = await import(
  pathToFileURL(
    process.env.QA_PLAYWRIGHT_MODULE ??
      join(root, "tools/marketing-video/node_modules/playwright/index.mjs"),
  ).href
)
const mode = process.argv[2] ?? "matrix"
if (!["matrix", "player"].includes(mode))
  throw new Error("Choose matrix or player")
const origin = new URL(
  process.env.QA_MARKETING_URL ?? "https://ewatrade.localhost",
)
if (origin.port || !origin.hostname.endsWith(".localhost"))
  throw new Error("Use a port-free local Portless URL")
const outputDir =
  process.env.QA_OUTPUT_DIR ??
  (await mkdtemp(join(tmpdir(), "ewatrade-section-qa-")))
await mkdir(outputDir, { recursive: true })
const mediaDir = join(outputDir, "fixtures")
const media = getStoreInAMinuteConfig({}).variants
if (mode === "player") {
  await mkdir(mediaDir, { recursive: true })
  const duration = String(
    Math.ceil(
      Math.max(media.web.durationSeconds, media.mobile.durationSeconds) + 3,
    ),
  )
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=30352d:s=320x180:r=10",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=22050",
    "-t",
    duration,
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-g",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "24k",
    "-movflags",
    "+faststart",
    join(mediaDir, "test.mp4"),
    "-y",
  ])
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    join(mediaDir, "test.mp4"),
    "-c",
    "copy",
    "-hls_time",
    "6",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_filename",
    join(mediaDir, "test-%03d.ts"),
    join(mediaDir, "test.m3u8"),
    "-y",
  ])
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    join(mediaDir, "test.mp4"),
    "-frames:v",
    "1",
    join(mediaDir, "poster.jpg"),
    "-y",
  ])
  await fs.writeFile(
    join(mediaDir, "captions.vtt"),
    "WEBVTT\n\n00:00:00.000 --> 00:10:00.000\nPlayer regression fixture, not product footage.\n",
  )
}
import assert from "node:assert/strict"
import fs from "node:fs/promises"
const browser = await chromium.launch({
  ...(process.env.QA_BROWSER_PATH
    ? { executablePath: process.env.QA_BROWSER_PATH }
    : process.platform === "darwin"
      ? {
          executablePath:
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        }
      : {}),
  headless: true,
})
const report = {}
async function scenario(
  name,
  { reduced = false, saveData = false, width = 1280, forceHls = false } = {},
) {
  const context = await browser.newContext({
    viewport: { width, height: 1024 },
    reducedMotion: reduced ? "reduce" : "no-preference",
  })
  if (saveData)
    await context.addInitScript(() => {
      const c = new EventTarget()
      c.saveData = true
      Object.defineProperty(navigator, "connection", {
        value: c,
        configurable: true,
      })
    })
  if (forceHls)
    await context.addInitScript(() => {
      const orig = HTMLMediaElement.prototype.canPlayType
      HTMLMediaElement.prototype.canPlayType = function (type) {
        return /mpegurl/i.test(type) ? "" : orig.call(this, type)
      }
    })
  const delivered = []
  await context.route("**/api/analytics", async (route) => {
    const batch = route.request().postDataJSON()
    delivered.push(
      ...(batch.events ?? []).map(({ name, properties }) => ({
        name,
        properties,
      })),
    )
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: "{}",
    })
  })
  const page = await context.newPage()
  const requests = []
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.route("**/__qa/player/*", async (route) => {
    const filename = new URL(route.request().url()).pathname.split("/").pop()
    requests.push(filename)
    const type = filename.endsWith(".m3u8")
      ? "application/vnd.apple.mpegurl"
      : filename.endsWith(".ts")
        ? "video/mp2t"
        : filename.endsWith(".mp4")
          ? "video/mp4"
          : filename.endsWith(".vtt")
            ? "text/vtt"
            : "image/jpeg"
    const data = await fs.readFile(join(mediaDir, filename))
    const range = route.request().headers().range
    if (range && filename.endsWith(".mp4")) {
      const match = range.match(/bytes=(\d+)-(\d*)/)
      const start = Number(match[1])
      const end = match[2]
        ? Math.min(Number(match[2]), data.length - 1)
        : data.length - 1
      await route.fulfill({
        status: 206,
        contentType: type,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes ${start}-${end}/${data.length}`,
          "Content-Length": String(end - start + 1),
        },
        body: data.subarray(start, end + 1),
      })
    } else
      await route.fulfill({
        contentType: type,
        headers: { "Accept-Ranges": "bytes" },
        body: data,
      })
  })
  await page.goto(origin.href, { waitUntil: "networkidle" })
  await page.locator("#store-in-a-minute video").waitFor()
  report[name] = { beforeInView: requests.slice(), errors }
  assert.equal(
    requests.filter((x) => !x.endsWith(".jpg")).length,
    0,
    "no media before in-view",
  )
  await page.locator(".shop-sim-player").scrollIntoViewIfNeeded()
  if (reduced || saveData) {
    await page.waitForTimeout(600)
    assert.equal(
      requests.filter((x) => !x.endsWith(".jpg")).length,
      0,
      "motion/data no media before click",
    )
    report[name].blockedAutoplay = await page
      .locator("video")
      .evaluate((v) => v.paused && !v.hasAttribute("src"))
    assert.equal(report[name].blockedAutoplay, true)
    await page
      .getByRole("button", { name: "Play the video", exact: true })
      .click()
  }
  await page.waitForFunction(
    () => {
      const v = document.querySelector("#store-in-a-minute video")
      return v && !v.paused && v.currentTime > 0.2
    },
    {},
    { timeout: 15000 },
  )
  report[name].playing = await page.locator("video").evaluate((v) => ({
    muted: v.muted,
    time: v.currentTime,
    captions: [...v.textTracks].map((t) => t.mode),
  }))
  await page.getByRole("button", { name: "Pause video", exact: true }).click()
  await page
    .locator(".shop-sim-rail button")
    .filter({ hasText: "Pharmacy" })
    .click()
  await page.waitForFunction(
    (start) =>
      document.querySelector("#store-in-a-minute video").currentTime >= start,
    media[width < 720 ? "mobile" : "web"].chapterStarts.pharmacy,
  )
  report[name].chapterSeek = await page
    .locator("video")
    .evaluate((v) => ({ time: v.currentTime, paused: v.paused }))
  await page.getByRole("button", { name: "Pause video", exact: true }).click()
  await page.getByRole("button", { name: "Captions", exact: true }).click()
  await page.getByRole("button", { name: "Turn on sound", exact: true }).click()
  await page.waitForFunction(
    () => !document.querySelector("#store-in-a-minute video").paused,
  )
  await page.getByRole("button", { name: "Pause video", exact: true }).click()
  await page
    .getByRole("radio", { name: width < 720 ? "Web" : "Mobile", exact: true })
    .check()
  await page.waitForTimeout(400)
  report[name].switchedPaused = await page.locator("video").evaluate((v) => ({
    paused: v.paused,
    muted: v.muted,
    time: v.currentTime,
  }))
  assert.equal(report[name].switchedPaused.paused, true)
  assert.equal(report[name].switchedPaused.muted, false)
  assert.equal(
    await page
      .getByRole("button", { name: "Captions", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  )
  await page.getByRole("button", { name: "Play video", exact: true }).click()
  await page.waitForFunction(
    (start) => {
      const v = document.querySelector("#store-in-a-minute video")
      return !v.paused && v.currentTime >= start
    },
    media[width < 720 ? "web" : "mobile"].chapterStarts.pharmacy,
    { timeout: 15000 },
  )
  report[name].resumed = await page.locator("video").evaluate((v) => ({
    paused: v.paused,
    muted: v.muted,
    time: v.currentTime,
  }))
  await page.evaluate(() => scrollTo(0, 0))
  await page.waitForFunction(
    () => document.querySelector("#store-in-a-minute video").paused,
  )
  report[name].outOfViewPaused = true
  report[name].requests = requests
  await page.locator(".shop-sim-cta a").evaluate((element) =>
    element.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    }),
  )
  await page.locator(".shop-sim-cta a").click()
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")))
  await page.waitForTimeout(500)
  report[name].deliveredAnalytics = delivered.filter(
    (event) => event.properties.category === "store_in_a_minute",
  )
  if (process.env.QA_ASSERT_ANALYTICS === "true") {
    const names = delivered.map((event) => event.name)
    for (const required of [
      "video_view",
      "video_unmute",
      "video_chapter_select",
      "video_variant_switch",
      "video_cta_click",
    ])
      assert.ok(names.includes(required), `Missing delivered ${required}`)
    assert.equal(names.filter((name) => name === "video_view").length, 1)
  }
  assert.deepEqual(errors, [])
  await context.close()
}
async function matrix() {
  const context = await browser.newContext({ reducedMotion: "reduce" })
  await context.route("**/api/analytics", (route) =>
    route.fulfill({ status: 202, body: "{}" }),
  )
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  for (const width of [320, 390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1024 })
    await page.goto(origin.href, { waitUntil: "networkidle" })
    await page
      .locator("#store-in-a-minute")
      .screenshot({ path: join(outputDir, `section-${width}.png`) })
    await page
      .locator("#pricing")
      .screenshot({ path: join(outputDir, `pricing-${width}.png`) })
    report[width] = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      variant: document.querySelector(".shop-sim-layout").dataset.variant,
      plans: document.querySelectorAll(".shop-plan").length,
      offscreenControls: [
        ...document.querySelectorAll(
          "#store-in-a-minute button,#store-in-a-minute a,#pricing a",
        ),
      ]
        .filter((e) => {
          const r = e.getBoundingClientRect()
          return r.left < 0 || r.right > innerWidth
        })
        .map((e) => e.textContent),
    }))
    assert.equal(report[width].overflow, false)
    assert.equal(report[width].plans, 4)
    assert.deepEqual(report[width].offscreenControls, [])
  }
  await page.getByRole("radio", { name: "Web", exact: true }).focus()
  await page.keyboard.press("ArrowRight")
  assert.equal(
    await page.locator(".shop-sim-layout").getAttribute("data-variant"),
    "mobile",
  )
  for (const name of [
    "Poultry farm",
    "Pharmacy",
    "Fashion boutique",
    "Laundry & dry cleaning",
    "Bakery",
  ]) {
    const item = page.locator(".shop-sim-rail button").filter({ hasText: name })
    await item.focus()
    await page.keyboard.press("Enter")
    assert.equal(await item.getAttribute("aria-current"), "true")
  }
  await page.locator(".shop-sim-transcript summary").focus()
  await page.keyboard.press("Enter")
  assert.equal(
    await page.locator(".shop-sim-transcript").getAttribute("open"),
    "",
  )
  report.pageErrors = errors
  assert.deepEqual(errors, [])
  await context.close()
}
try {
  if (mode === "matrix") await matrix()
  else {
    await scenario("normal")
    await scenario("reduced", { reduced: true })
    await scenario("saveData", { saveData: true })
    await scenario("mobile", { saveData: true, width: 390 })
    await scenario("hlsJs", { forceHls: true })
  }
} finally {
  await fs.writeFile(
    join(outputDir, `${mode}.json`),
    JSON.stringify(report, null, 2),
  )
  console.log(JSON.stringify({ outputDir, report }, null, 2))
  await browser.close()
}
