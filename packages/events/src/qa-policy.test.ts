import { expect, test } from "bun:test"
import { createAttributedBrowserAnalytics } from "./browser-attribution"
import { createNativeAnalytics } from "./native"
import { isQaAnalyticsPrincipal } from "./qa-policy.server"
const routes = JSON.stringify({ "tester.qa.test": "tester@example.com" })
function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
}
test("QA policy uses exact configured email domain, session scope, or workspace classification", () => {
  expect(
    isQaAnalyticsPrincipal({ email: " OWNER@Tester.QA.Test " }, routes),
  ).toBe(true)
  expect(
    isQaAnalyticsPrincipal({ email: "owner@sub.tester.qa.test" }, routes),
  ).toBe(false)
  expect(
    isQaAnalyticsPrincipal({ email: "qa+owner@example.com" }, routes),
  ).toBe(false)
  expect(
    isQaAnalyticsPrincipal({ email: "owner@unconfigured.test" }, routes),
  ).toBe(false)
  expect(isQaAnalyticsPrincipal({ qaSession: true }, undefined)).toBe(true)
  expect(isQaAnalyticsPrincipal({ dataClassification: "QA" }, undefined)).toBe(
    true,
  )
  expect(isQaAnalyticsPrincipal({}, routes)).toBe(false)
  expect(() =>
    isQaAnalyticsPrincipal({ email: "owner@example.com" }, "broken"),
  ).toThrow()
})
test("browser QA denial drops queued events and prevents anonymous fallback; normal user resumes", async () => {
  const store = storage()
  let offline = true
  const delivered: string[] = []
  const client = createAttributedBrowserAnalytics({
    storage: store,
    send: async (batch) => {
      if (offline) throw Error("offline")
      delivered.push(...batch.events.map((event) => event.name))
    },
  })
  client.track("before_qa", {}, null)
  await client.flush()
  client.setEnabled(false)
  expect(
    store.getItem("logly:ewatrade-dashboard:attributed-visitor"),
  ).toBeNull()
  offline = false
  client.trackPageView("/sales", null)
  client.track("qa_action", {}, null)
  await client.flush()
  expect(delivered).toEqual([])
  client.setEnabled(true)
  client.track("normal_action", {}, null)
  await client.flush()
  expect(delivered).toContain("normal_action")
  expect(delivered).not.toContain("before_qa")
  client.destroy()
})
test("native QA permission clears pending retries and cannot send anonymously", async () => {
  let allowed = true
  let offline = true
  const store = storage()
  const delivered: string[] = []
  const client = createNativeAnalytics({
    endpoint: "https://example.com",
    enabled: true,
    permission: () => allowed,
    storage: store,
    createId: () => crypto.randomUUID(),
    send: async (batch) => {
      if (offline) throw Error("offline")
      delivered.push(...batch.events.map((event) => event.name))
    },
  })
  try {
    client.init()
    client.track("before_qa")
    await client.flush()
    allowed = false
    offline = false
    client.trackPageView({ route: "/sales" })
    client.track("qa_action")
    await client.flush()
    expect(delivered).toEqual([])
    expect(store.getItem("logly:ewatrade-mobile:visitor")).toBeNull()
    client.destroy()
    allowed = true
    client.init()
    client.track("normal_action")
    await client.flush()
    expect(delivered).toContain("normal_action")
    expect(delivered).not.toContain("before_qa")
  } finally {
    client.destroy()
  }
})
