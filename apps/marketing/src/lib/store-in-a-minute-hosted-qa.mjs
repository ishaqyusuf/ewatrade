/**
 * Real-asset acceptance against an explicitly selected immutable Marketing Preview.
 * Run with Bun: QA_MARKETING_URL=https://ewatrade-marketing-<id>-ishaqyusufs-projects.vercel.app
 * QA_STORAGE_STATE=/absolute/path/to/existing-playwright-state.json
 * bun apps/marketing/src/lib/store-in-a-minute-hosted-qa.mjs
 * Optional: QA_OUTPUT_DIR, QA_BROWSER_PATH, QA_PLAYWRIGHT_MODULE,
 * QA_ANALYTICS_EXPECTATION=observed|emitted|accepted (default observed).
 * QA_WATCH_PROGRESS=true watches 38 real seconds once; emitted/accepted enable it.
 * QA_SCENARIOS selects comma-separated names (default all six).
 * Preview origin refusal/disabled flags are recorded, never bypassed.
 * QA_EXPECT_COMMIT / QA_EXPECT_DEPLOYMENT annotate supplied identity, not attest it.
 * No fixture routes, auth bypass, form submission, signup, DB or deployment writes.
 * Player interactions may send ordinary analytics to the real same-origin endpoint;
 * accepted browser POSTs do not prove external collector persistence.
 * Chrome mobile viewport/throttling does not establish physical iOS Safari acceptance.
 */
import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { getStoreInAMinuteConfig } from "./store-in-a-minute-video.ts"

const origin = new URL(
  process.env.QA_MARKETING_URL ?? "https://missing.invalid",
)
assert.ok(
  origin.protocol === "https:" &&
    !origin.port &&
    !origin.username &&
    !origin.password &&
    /^ewatrade-marketing-[a-z0-9]+-ishaqyusufs-projects\.vercel\.app$/.test(
      origin.hostname,
    ) &&
    origin.pathname === "/" &&
    !origin.search &&
    !origin.hash,
  "Set QA_MARKETING_URL to the final immutable Marketing Preview root",
)
const root = fileURLToPath(new URL("../../../../", import.meta.url))
const { chromium } = await import(
  pathToFileURL(
    process.env.QA_PLAYWRIGHT_MODULE ??
      join(root, "tools/marketing-video/node_modules/playwright/index.mjs"),
  ).href
)
const config = getStoreInAMinuteConfig({})
const assetRoot = "/media/setup-2026-10-08/"
const isAsset = (url) => {
  const parsed = new URL(url)
  return (
    parsed.origin === origin.origin && parsed.pathname.startsWith(assetRoot)
  )
}
const isVideo = (path) => /\.(?:m3u8|ts|m4s|mp4|vtt)(?:$|\?)/i.test(path)
const outputDir =
  process.env.QA_OUTPUT_DIR ??
  (await mkdtemp(join(tmpdir(), "ewatrade-hosted-player-")))
await mkdir(outputDir, { recursive: true })
let storageState
if (process.env.QA_STORAGE_STATE) {
  try {
    const state = JSON.parse(
      await readFile(process.env.QA_STORAGE_STATE, "utf8"),
    )
    assert.ok(Array.isArray(state.cookies) && Array.isArray(state.origins))
    storageState = {
      cookies: state.cookies.filter((cookie) => {
        const domain = cookie.domain.replace(/^\./, "")
        return (
          origin.hostname === domain || origin.hostname.endsWith(`.${domain}`)
        )
      }),
      origins: state.origins.filter((entry) => entry.origin === origin.origin),
    }
  } catch {
    throw new Error(
      "QA_STORAGE_STATE must be readable Playwright storage-state JSON; authentication data is never printed",
    )
  }
}
const analyticsExpectation = process.env.QA_ANALYTICS_EXPECTATION ?? "observed"
assert.ok(["observed", "emitted", "accepted"].includes(analyticsExpectation))
const watchProgress =
  process.env.QA_WATCH_PROGRESS === "true" ||
  analyticsExpectation !== "observed"
const scenarioOptions = {
  normal: {},
  reduced: { reduced: true },
  saveData: { saveData: true },
  mobile: { width: 390, saveData: true },
  hlsJs: { forceHls: true },
  constrainedMobile: { width: 390, saveData: true, constrained: true },
}
const selectedScenarios =
  process.env.QA_SCENARIOS?.split(",") ?? Object.keys(scenarioOptions)
assert.ok(
  selectedScenarios.length > 0 &&
    selectedScenarios.every((name) => Object.hasOwn(scenarioOptions, name)),
  "Choose valid QA_SCENARIOS names",
)
const report = {
  origin: origin.origin,
  suppliedCommit: process.env.QA_EXPECT_COMMIT ?? null,
  suppliedDeployment: process.env.QA_EXPECT_DEPLOYMENT ?? null,
  identityNote:
    "Supplied identifiers require independent deployment/source attestation",
  startedAt: new Date().toISOString(),
  analyticsExpectation,
  scenarios: {},
  limits: [
    "No external collector persistence proof",
    "No physical iOS Safari proof",
    "No ordinary signup or Terms submission",
  ],
}
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

async function scenario(
  name,
  {
    width = 1280,
    reduced = false,
    saveData = false,
    forceHls = false,
    constrained = false,
  } = {},
) {
  const result = {
    errors: [],
    requests: [],
    responses: [],
    transfers: [],
    analytics: [],
    analyticsResponses: [],
    requestFailures: [],
  }
  report.scenarios[name] = result
  const context = await browser.newContext({
    viewport: { width, height: 1024 },
    reducedMotion: reduced ? "reduce" : "no-preference",
    storageState,
  })
  try {
    if (saveData)
      await context.addInitScript(() => {
        const connection = new EventTarget()
        connection.saveData = true
        Object.defineProperty(navigator, "connection", {
          configurable: true,
          value: connection,
        })
      })
    if (forceHls)
      await context.addInitScript(() => {
        const original = HTMLMediaElement.prototype.canPlayType
        HTMLMediaElement.prototype.canPlayType = function (type) {
          return /mpegurl/i.test(type) ? "" : original.call(this, type)
        }
      })
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send("Network.enable")
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true })
    const requestPaths = new Map()
    cdp.on("Network.requestWillBeSent", ({ requestId, request }) => {
      if (isAsset(request.url))
        requestPaths.set(requestId, new URL(request.url).pathname)
    })
    cdp.on("Network.loadingFinished", ({ requestId, encodedDataLength }) => {
      const path = requestPaths.get(requestId)
      if (path) result.transfers.push({ path, encodedBytes: encodedDataLength })
    })
    page.on("pageerror", (error) => result.errors.push(error.message))
    const pending = []
    const emittedIds = new Set()
    page.on("request", (request) => {
      if (isAsset(request.url()))
        result.requests.push(new URL(request.url()).pathname)
      const url = new URL(request.url())
      if (
        url.origin === origin.origin &&
        url.pathname === "/api/analytics" &&
        request.method() === "POST"
      ) {
        const batch = request.postDataJSON()
        for (const event of batch?.events ?? []) {
          if (
            event.properties?.category !== "store_in_a_minute" ||
            emittedIds.has(event.eventId)
          )
            continue
          emittedIds.add(event.eventId)
          result.analytics.push({
            name: event.name,
            variant: event.properties.channel,
            chapter: event.properties.action,
            percent: event.properties.item_count,
          })
        }
      }
    })
    page.on("requestfailed", (request) => {
      if (isAsset(request.url()))
        result.requestFailures.push({
          path: new URL(request.url()).pathname,
          error: request.failure()?.errorText,
        })
    })
    page.on("response", (response) => {
      const request = response.request()
      const url = new URL(response.url())
      if (isAsset(response.url()))
        pending.push(
          (async () => {
            result.responses.push({
              path: url.pathname,
              status: response.status(),
              type: (await response.headerValue("content-type")) ?? "",
            })
          })(),
        )
      if (
        url.origin === origin.origin &&
        url.pathname === "/api/analytics" &&
        request.method() === "POST"
      ) {
        const batch = request.postDataJSON()
        const names = (batch?.events ?? [])
          .filter((event) => event.properties?.category === "store_in_a_minute")
          .map((event) => event.name)
        if (names.length)
          result.analyticsResponses.push({ names, status: response.status() })
      }
    })
    const response = await page.goto(origin.href, {
      waitUntil: "networkidle",
      timeout: 60000,
    })
    assert.equal(
      response?.status(),
      200,
      "Preview must be accessible through existing authentication",
    )
    await page.locator("#store-in-a-minute video").waitFor({ timeout: 15000 })
    result.beforeInView = result.requests.slice()
    assert.equal(
      result.beforeInView.filter(isVideo).length,
      0,
      "no eager media, manifests or captions",
    )
    result.analyticsPolicy = await page.evaluate(async () => {
      const response = await fetch("/api/analytics/context", {
        cache: "no-store",
      })
      const body = await response.json()
      return { status: response.status, enabled: body.enabled === true }
    })
    if (constrained) {
      result.network = {
        latencyMs: 400,
        downloadBitsPerSecond: 400000,
        uploadBitsPerSecond: 400000,
      }
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 400,
        downloadThroughput: 50000,
        uploadThroughput: 50000,
        connectionType: "cellular3g",
      })
    }
    await page.locator(".shop-sim-player").scrollIntoViewIfNeeded()
    if (reduced || saveData) {
      await page.waitForTimeout(750)
      assert.equal(
        result.requests.filter(isVideo).length,
        0,
        "motion/data preferences defer actual media",
      )
    }
    const startedAt = Date.now()
    if (reduced || saveData)
      await page
        .getByRole("button", { name: "Play the video", exact: true })
        .click()
    await page.waitForFunction(
      () => {
        const video = document.querySelector("#store-in-a-minute video")
        return (
          video &&
          !video.paused &&
          video.currentTime > 0.3 &&
          video.readyState >= 2
        )
      },
      {},
      { timeout: constrained ? 45000 : 20000 },
    )
    result.startupMs = Date.now() - startedAt
    result.startupEncodedBytes = result.transfers.reduce(
      (total, transfer) => total + transfer.encodedBytes,
      0,
    )
    result.playing = await page.locator("video").evaluate((video) => ({
      time: video.currentTime,
      duration: video.duration,
      muted: video.muted,
      captions: [...video.textTracks].map((track) => track.mode),
      sourcePath: new URL(video.currentSrc).pathname,
      sourceOrigin: new URL(video.currentSrc).origin,
    }))
    assert.ok(
      Math.abs(result.playing.duration - config.variants.web.durationSeconds) <
        0.25,
      "final duration",
    )
    assert.equal(result.playing.muted, true)
    assert.ok(
      result.playing.captions.includes("showing"),
      "English captions load and show",
    )
    assert.equal(
      result.playing.sourceOrigin,
      origin.origin,
      "same-origin media or MediaSource blob",
    )
    if (name === "normal" && watchProgress) {
      await page.waitForTimeout(38000)
    }
    if (constrained) {
      result.constrainedPlayback = await page
        .locator("video")
        .evaluate(async (video) => {
          const start = video.currentTime
          let waits = 0
          const waiting = () => {
            waits++
          }
          video.addEventListener("waiting", waiting)
          await new Promise((resolve) => setTimeout(resolve, 10000))
          video.removeEventListener("waiting", waiting)
          return {
            windowMs: 10000,
            advancedSeconds: video.currentTime - start,
            waitingEvents: waits,
            paused: video.paused,
          }
        })
      assert.ok(
        result.constrainedPlayback.advancedSeconds > 2 &&
          !result.constrainedPlayback.paused,
        "actual playback advances under constrained network",
      )
    }
    await page.getByRole("button", { name: "Pause video", exact: true }).click()
    const segmentCount = () =>
      result.requests.filter((path) => /\.(ts|m4s)$/.test(path)).length
    const beforePause = segmentCount()
    const bytesBeforePause = result.transfers.reduce(
      (sum, transfer) => sum + transfer.encodedBytes,
      0,
    )
    await page.waitForTimeout(5000)
    result.pausedLoad = {
      windowMs: 5000,
      newSegments: segmentCount() - beforePause,
      completedEncodedBytes:
        result.transfers.reduce(
          (sum, transfer) => sum + transfer.encodedBytes,
          0,
        ) - bytesBeforePause,
      asserted: forceHls,
    }
    if (forceHls)
      assert.ok(
        result.pausedLoad.newSegments <= 1,
        "hls.js pause stops new loading, allowing one racing request",
      )
    const selectedChapters =
      name === "normal"
        ? config.chapters
        : config.chapters.filter((chapter) =>
            ["pharmacy", "bakery"].includes(chapter.id),
          )
    for (const chapter of selectedChapters) {
      await page
        .locator(".shop-sim-rail button")
        .filter({ hasText: chapter.label })
        .click()
      // On phones the rail is below the player; return it to view before
      // asserting playback, since the visibility policy pauses while offscreen.
      await page.locator(".shop-sim-player").scrollIntoViewIfNeeded()
      const start =
        config.variants[width < 720 ? "mobile" : "web"].chapterStarts[
          chapter.id
        ]
      await page.waitForFunction(
        (start) => {
          const video = document.querySelector("#store-in-a-minute video")
          return (
            video &&
            !video.paused &&
            !video.seeking &&
            video.currentTime >= start &&
            video.currentTime < start + 5
          )
        },
        start,
        { timeout: constrained ? 45000 : 20000 },
      )
      await page
        .getByRole("button", { name: "Pause video", exact: true })
        .click()
      const cta = await page.locator(".shop-sim-cta a").getAttribute("href")
      if (cta !== "/contact")
        assert.equal(
          new URL(cta).searchParams.get("profile"),
          chapter.profileKey,
        )
    }
    await page.getByRole("button", { name: "Captions", exact: true }).click()
    await page
      .getByRole("button", { name: "Turn on sound", exact: true })
      .click()
    await page.waitForFunction(
      () => !document.querySelector("#store-in-a-minute video").paused,
    )
    await page.getByRole("button", { name: "Pause video", exact: true }).click()
    await page
      .getByRole("radio", { name: width < 720 ? "Web" : "Mobile", exact: true })
      .check()
    assert.equal(
      await page.locator("video").evaluate((video) => video.paused),
      true,
    )
    assert.equal(
      await page
        .getByRole("button", { name: "Captions", exact: true })
        .getAttribute("aria-pressed"),
      "false",
    )
    await page.getByRole("button", { name: "Play video", exact: true }).click()
    await page.waitForFunction(
      () => {
        const video = document.querySelector("#store-in-a-minute video")
        return !video.paused && !video.muted && video.currentTime >= 112
      },
      {},
      { timeout: constrained ? 45000 : 20000 },
    )
    result.switched = await page.locator("video").evaluate((video) => ({
      time: video.currentTime,
      duration: video.duration,
      muted: video.muted,
    }))
    await page.evaluate(() => scrollTo(0, 0))
    await page.waitForFunction(
      () => document.querySelector("#store-in-a-minute video").paused,
    )
    await page.locator(".shop-sim-transcript summary").click()
    for (const text of [config.introTranscript, config.outroTranscript])
      assert.equal(
        await page
          .locator(".shop-sim-transcript")
          .getByText(text, { exact: false })
          .isVisible(),
        true,
      )
    await page.locator(".shop-sim-cta a").evaluate((element) =>
      element.addEventListener("click", (event) => event.preventDefault(), {
        once: true,
      }),
    )
    await page.locator(".shop-sim-cta a").click()
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")))
    if (analyticsExpectation !== "observed") {
      const deadline = Date.now() + 5000
      while (
        !result.analytics.some((event) => event.name === "video_cta_click") &&
        Date.now() < deadline
      )
        await page.waitForTimeout(200)
      for (const name of [
        "video_view",
        "video_chapter_select",
        "video_unmute",
        "video_variant_switch",
        "video_cta_click",
      ])
        assert.ok(
          result.analytics.some((event) => event.name === name),
          `real client batch emitted: ${name}`,
        )
      assert.equal(
        result.analytics.filter((event) => event.name === "video_view").length,
        1,
      )
      if (name === "normal")
        assert.ok(
          result.analytics.some(
            (event) => event.name === "video_progress" && event.percent === 25,
          ),
          "25% actually watched milestone emitted",
        )
      if (analyticsExpectation === "accepted") {
        assert.equal(result.analyticsPolicy.enabled, true)
        for (const name of [
          "video_view",
          "video_chapter_select",
          "video_unmute",
          "video_variant_switch",
          "video_cta_click",
        ])
          assert.ok(
            result.analyticsResponses.some(
              (response) =>
                response.names.includes(name) &&
                response.status >= 200 &&
                response.status < 300,
            ),
            `real same-origin POST accepted: ${name}`,
          )
      }
    } else await page.waitForTimeout(750)
    await Promise.all(pending)
    result.analyticsGate = result.analyticsResponses.some(
      (response) => response.status === 403,
    )
      ? "origin/policy refused; Preview isolation preserved"
      : result.analytics.length
        ? "client batch emitted; see response statuses"
        : "no client batch observed; client flag or runtime policy may disable collection"
    result.networkTotals = {
      requestedSegments: segmentCount(),
      completedTransfers: result.transfers.length,
      encodedBytes: result.transfers.reduce(
        (sum, transfer) => sum + transfer.encodedBytes,
        0,
      ),
    }
    assert.ok(
      result.responses.some(
        (response) =>
          response.path.endsWith(".m3u8") &&
          /application\/(vnd\.apple\.mpegurl|x-mpegurl)/i.test(response.type),
      ),
      "actual HLS manifest with correct MIME delivered",
    )
    assert.ok(
      result.responses.some((response) => /\.(ts|m4s)$/.test(response.path)),
      "actual HLS segment delivered",
    )
    assert.ok(
      result.responses.some(
        (response) =>
          response.path.endsWith(".vtt") && /text\/vtt/i.test(response.type),
      ),
      "captions MIME",
    )
    assert.ok(
      !result.responses.some((response) => response.status >= 400),
      "all requested assets successful",
    )
    assert.ok(
      !result.requests.some((path) => path.endsWith(".mp4")),
      "published adaptive HLS without eager MP4",
    )
    if (name === "normal") {
      result.manifests = []
      for (const variant of ["web", "mobile"]) {
        const masterUrl = new URL(`${assetRoot}${variant}/master.m3u8`, origin)
        const masterResponse = await context.request.get(masterUrl.href)
        assert.equal(masterResponse.status(), 200)
        const lines = (await masterResponse.text()).trim().split(/\r?\n/)
        const renditions = []
        for (let index = 0; index < lines.length; index++) {
          if (!lines[index].startsWith("#EXT-X-STREAM-INF:")) continue
          const attributes = lines[index].split(":")[1]
          const bandwidth = Number(
            attributes.match(/(?:^|,)BANDWIDTH=(\d+)/)?.[1],
          )
          const resolution = attributes.match(/RESOLUTION=(\d+)x(\d+)/)
          const renditionUrl = new URL(lines[index + 1], masterUrl)
          assert.ok(
            isAsset(renditionUrl.href),
            "rendition remains in same-origin media directory",
          )
          const renditionResponse = await context.request.get(renditionUrl.href)
          assert.equal(renditionResponse.status(), 200)
          const playlist = await renditionResponse.text()
          const durations = [...playlist.matchAll(/#EXTINF:([\d.]+)/g)].map(
            (match) => Number(match[1]),
          )
          const duration = durations.reduce((sum, seconds) => sum + seconds, 0)
          assert.ok(playlist.includes("#EXT-X-ENDLIST"), "finite VOD rendition")
          assert.ok(
            Math.abs(duration - config.variants[variant].durationSeconds) <
              0.25,
          )
          assert.ok(
            bandwidth > 0 && resolution,
            "declared bitrate and resolution",
          )
          renditions.push({
            path: renditionUrl.pathname,
            bandwidth,
            width: Number(resolution[1]),
            height: Number(resolution[2]),
            segments: durations.length,
            durationSeconds: duration,
          })
        }
        assert.equal(renditions.length, 2, "two adaptive renditions")
        result.manifests.push({ variant, path: masterUrl.pathname, renditions })
      }
    }
    assert.deepEqual(result.errors, [])
    await page
      .locator("#store-in-a-minute")
      .screenshot({ path: join(outputDir, `${name}.png`) })
    result.status = "pass"
  } catch (error) {
    result.status = "fail"
    result.failure = error.message
    throw error
  } finally {
    await context.close()
  }
}
try {
  for (const name of selectedScenarios)
    await scenario(name, scenarioOptions[name])
} finally {
  report.finishedAt = new Date().toISOString()
  await writeFile(
    join(outputDir, "report.json"),
    JSON.stringify(report, null, 2),
  )
  console.log(JSON.stringify({ outputDir, report }, null, 2))
  await browser.close()
}
