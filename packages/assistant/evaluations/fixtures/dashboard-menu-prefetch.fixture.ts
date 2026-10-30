import { afterAll, afterEach, beforeAll, expect, test } from "bun:test"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Browser, BrowserContext, Page } from "playwright"
import { getDashboardNavigation } from "../../../../apps/dashboard/src/lib/navigation"
import { buildMenuPrefetchFixture } from "./dashboard-menu-prefetch-build"

// Real menu, IntentLink, App Router Link, link registry, cache-key and native
// Chromium visibility/events. Scheduler, router state/dispatch, Flight and icons
// are inert ports. No live service/account/API, data fixture or provider runs.
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))
process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(
  repoRoot,
  ".scratch/qa-release/playwright",
)
const launcherPath = new URL(
  "../../../../scripts/qa-web-smoke.mjs",
  import.meta.url,
).href
const { launchSmokeBrowser }: { launchSmokeBrowser: () => Promise<Browser> } =
  await import(launcherPath)
const ownerItems = getDashboardNavigation("OWNER")
const groups = ownerItems.filter((item) => item.children?.length)
const settingsGroup = groups.find((item) => item.href === "/settings")
if (!settingsGroup?.children)
  throw Error("Expected current Owner Settings navigation")
const settings = { ...settingsGroup, children: settingsGroup.children }
let browser: Browser
let sources: Record<"production" | "development", string>
const contexts: BrowserContext[] = []
const errors: string[] = []
const unexpected: string[] = []
beforeAll(async () => {
  const [production, development] = await Promise.all([
    buildMenuPrefetchFixture("production"),
    buildMenuPrefetchFixture("development"),
  ])
  sources = { production, development }
  browser = await launchSmokeBrowser()
}, 30_000)
afterAll(async () => {
  await browser?.close()
})
afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close()
  expect(errors.splice(0)).toEqual([])
  expect(unexpected.splice(0)).toEqual([])
})
async function boot(
  mode: "production" | "development" = "production",
  items = ownerItems,
) {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1400 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
  })
  contexts.push(context)
  await context.route("**/*", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (
      request.isNavigationRequest() &&
      request.url() === "https://navigation.invalid/catalog"
    ) {
      await route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><body><div id="app"></div></body></html>',
      })
    } else if (url.pathname === "/favicon.ico")
      await route.fulfill({ status: 204 })
    else {
      unexpected.push(`${request.method()} ${request.url()}`)
      await route.abort("blockedbyclient")
    }
  })
  const page = await context.newPage()
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("https://navigation.invalid/catalog")
  await page.evaluate((values) => {
    window.__menuItems = values
  }, items)
  await page.addScriptTag({ content: sources[mode] })
  await page.getByRole("navigation", { name: "Main navigation" }).waitFor()
  if (mode === "production") {
    // Positive control: a broken App Router alias/env must not make zero pass.
    await page.waitForFunction(
      (count) =>
        window.__menuProbe.tasks.filter(
          (task) => task.strategy === window.__menuProbe.strategies.PPR,
        ).length === count,
      items.length,
    )
  }
  return page
}
async function frames(page: Page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 2; i++)
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      )
  })
}
async function open(page: Page, label: string, count: number) {
  await page.getByRole("button", { name: `Toggle ${label} pages` }).click()
  await page.waitForFunction(
    (expected) =>
      document.querySelectorAll("nav > ul > li > ul a").length === expected,
    count,
  )
  // Observe the actual visible anchors separately; no synthetic visibility is
  // injected into Next's registry or its own native IntersectionObserver.
  await page.evaluate(async () => {
    const anchors = [...document.querySelectorAll("nav > ul > li > ul a")]
    await new Promise<void>((resolve) => {
      const seen = new Set<Element>()
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries)
          if (entry.intersectionRatio > 0) seen.add(entry.target)
        if (seen.size === anchors.length) {
          observer.disconnect()
          resolve()
        }
      })
      for (const anchor of anchors) observer.observe(anchor)
    })
  })
  await frames(page)
}
async function snapshot(page: Page, name: string) {
  const result = await page.evaluate(() => ({
    tasks: window.__menuProbe.tasks,
    navigations: window.__menuProbe.navigations,
    closes: window.__menuProbe.closes,
    strategies: window.__menuProbe.strategies,
    scrollModes: window.__menuProbe.scrollModes,
    handlers: window.__menuProbe.handlers,
  }))
  const directory = process.env.MENU_PREFETCH_EVIDENCE_DIR
  if (directory)
    await Bun.write(
      join(directory, `menu-prefetch-${name}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
    )
  return result
}
for (const group of groups) {
  test(`${group.label} expansion avoids eager full route tasks and retains automatic parents`, async () => {
    const page = await boot()
    await open(page, group.label, group.children?.length ?? 0)
    const result = await snapshot(
      page,
      `expand-${group.href.replaceAll("/", "-")}`,
    )
    expect(
      result.tasks.filter((task) => task.strategy === result.strategies.Full),
    ).toHaveLength(0)
    expect(
      result.tasks.filter((task) => task.strategy === result.strategies.PPR),
    ).toHaveLength(ownerItems.length)
  })
}
test("mouse, keyboard and touch warm only their destination and repeated intent reuses its task", async () => {
  const page = await boot()
  await open(page, settings.label, settings.children.length)
  const links = page.locator("nav > ul > li > ul a")
  const targets = await links.evaluateAll((nodes) =>
    nodes.map(
      (node) =>
        new URL(node.getAttribute("href") ?? "", location.href).pathname,
    ),
  )
  for (const [index, action] of ["hover", "focus", "touch"].entries()) {
    const link = links.nth(index)
    if (action === "hover") await link.hover()
    else if (action === "focus") await link.focus()
    else await link.dispatchEvent("touchstart")
    const target = targets[index]
    if (!target) throw Error(`Missing current Settings target ${index}`)
    await page.waitForFunction(
      (path) =>
        window.__menuProbe.tasks.some(
          (task) =>
            task.strategy === window.__menuProbe.strategies.Full &&
            task.pathname === path,
        ),
      target,
    )
    const result = await snapshot(page, `intent-${action}`)
    expect(
      result.tasks
        .filter((task) => task.strategy === result.strategies.Full)
        .map((task) => task.pathname),
    ).toEqual(targets.slice(0, index + 1))
  }
  expect(
    await links.nth(1).evaluate((node) => document.activeElement === node),
  ).toBe(true)
  await links.nth(0).hover()
  await frames(page)
  const result = await snapshot(page, "intent-repeated")
  expect(
    result.tasks.filter((task) => task.strategy === result.strategies.Full),
  ).toHaveLength(3)
})
test("a cold child click keeps native dispatch and the existing close callback", async () => {
  const page = await boot()
  await open(page, settings.label, settings.children.length)
  const first = page.locator("nav > ul > li > ul a").first()
  const href = await first.getAttribute("href")
  await first.dispatchEvent("click", { button: 0 })
  await page.waitForFunction(() => window.__menuProbe.navigations.length === 1)
  const result = await snapshot(page, "cold-click")
  expect(result.navigations[0]).toMatchObject({
    href,
    type: "push",
    intent: "none",
  })
  expect(result.closes).toBe(1)
  expect(
    result.tasks.filter((task) => task.strategy === result.strategies.Full),
  ).toHaveLength(0)
})
test("collapse cancels the warmed child task and a later expansion needs new intent", async () => {
  const page = await boot()
  await open(page, settings.label, settings.children.length)
  await page.locator("nav > ul > li > ul a").first().focus()
  await page.waitForFunction(() =>
    window.__menuProbe.tasks.some(
      (task) => task.strategy === window.__menuProbe.strategies.Full,
    ),
  )
  await page
    .getByRole("button", { name: `Toggle ${settings.label} pages` })
    .click()
  await frames(page)
  const closed = await snapshot(page, "collapsed")
  expect(
    closed.tasks
      .filter((task) => task.strategy === closed.strategies.Full)
      .every((task) => task.cancelled),
  ).toBe(true)
  await open(page, settings.label, settings.children.length)
  const result = await snapshot(page, "reexpanded")
  expect(
    result.tasks.filter((task) => task.strategy === result.strategies.Full),
  ).toHaveLength(1)
})
test("a changed destination cannot inherit another href's warming state", async () => {
  const page = await boot()
  await page.evaluate(() =>
    window.__menuProbe.renderDirect({ href: "/settings/receipts" }),
  )
  const link = page.getByRole("link", { name: "Direct target" })
  await link.hover()
  await page.waitForFunction(() =>
    window.__menuProbe.tasks.some(
      (task) => task.strategy === window.__menuProbe.strategies.Full,
    ),
  )
  await page.evaluate(() =>
    window.__menuProbe.renderDirect({ href: "/settings/stores" }),
  )
  await page.waitForFunction(
    () =>
      document.querySelector("a")?.getAttribute("href") === "/settings/stores",
  )
  await frames(page)
  const before = await snapshot(page, "href-changed-before-intent")
  expect(
    before.tasks.filter(
      (task) =>
        task.strategy === before.strategies.Full &&
        task.pathname === "/settings/stores",
    ),
  ).toHaveLength(0)
  await link.focus()
  await page.waitForFunction(() =>
    window.__menuProbe.tasks.some(
      (task) =>
        task.strategy === window.__menuProbe.strategies.Full &&
        task.pathname === "/settings/stores",
    ),
  )
})
test("caller handlers, prevented events, href/query/hash and navigation options survive", async () => {
  const page = await boot()
  await page.evaluate(() =>
    window.__menuProbe.renderDirect({
      href: "/settings/receipts?view=compact#header",
      preventHover: true,
      preventClick: true,
    }),
  )
  const link = page.getByRole("link", { name: "Direct target" })
  await link.hover()
  await frames(page)
  const blocked = await snapshot(page, "composed-hover")
  expect(blocked.handlers.hover).toBe(1)
  expect(
    blocked.tasks.filter((task) => task.strategy === blocked.strategies.Full),
  ).toHaveLength(0)
  await link.focus()
  await page.waitForFunction(() =>
    window.__menuProbe.tasks.some(
      (task) => task.strategy === window.__menuProbe.strategies.Full,
    ),
  )
  await link.dispatchEvent("touchstart")
  await link.dispatchEvent("click", { button: 0 })
  await frames(page)
  const prevented = await snapshot(page, "composed-prevented-click")
  expect(prevented.handlers).toEqual({ hover: 1, focus: 1, touch: 1, click: 1 })
  expect(prevented.navigations).toHaveLength(0)
  expect(await link.getAttribute("href")).toBe(
    "/settings/receipts?view=compact#header",
  )
  expect(await link.getAttribute("class")).toBe("inert-direct")
  await page.evaluate(() =>
    window.__menuProbe.renderDirect({
      href: "/settings/receipts?view=compact#header",
    }),
  )
  await frames(page)
  await link.dispatchEvent("click", { button: 0 })
  await page.waitForFunction(() => window.__menuProbe.navigations.length === 1)
  const result = await snapshot(page, "composed-click")
  expect(result.navigations[0]).toMatchObject({
    href: "/settings/receipts?view=compact#header",
    type: "replace",
    scroll: result.scrollModes.NoScroll,
    intent: "full",
  })
  expect(
    result.tasks.filter((task) => task.strategy === result.strategies.Full)[0]
      ?.search,
  ).toBe("?view=compact")
})
test("development remains free of framework prefetch work after visibility and intent", async () => {
  const page = await boot("development")
  await open(page, settings.label, settings.children.length)
  await page.locator("nav > ul > li > ul a").first().hover()
  await page.locator("nav > ul > li > ul a").nth(1).focus()
  await frames(page)
  expect((await snapshot(page, "development")).tasks).toHaveLength(0)
})
test("the current scoped-staff navigation cannot speculate unlisted destinations", async () => {
  const items = getDashboardNavigation("CASHIER", {
    staffAccessMode: "SCOPED",
    catalogEditor: false,
  })
  const page = await boot("production", items)
  const result = await snapshot(page, "scoped-staff")
  expect(
    result.tasks.every((task) =>
      items.some((item) => item.href === task.pathname),
    ),
  ).toBe(true)
  expect(
    result.tasks.some((task) => task.pathname.startsWith("/settings")),
  ).toBe(false)
})
