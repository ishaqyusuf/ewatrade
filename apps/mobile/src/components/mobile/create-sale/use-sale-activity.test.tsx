import { beforeEach, expect, test } from "bun:test"
import { mobileActivityInputSchema } from "@ewatrade/events/mobile-activity"
import type { MobileActivityInput } from "@ewatrade/events/mobile-activity"
import { DOMParser } from "@xmldom/xmldom"
import { act, createElement } from "react"
import {
  type SaleActivityState,
  saleActivityCategory,
  saleActivityLifetimeOf,
  useSaleActivity,
} from "./use-sale-activity"

const events: MobileActivityInput[] = []
let throwing = false
/** The live session lifetime; null when signed out. */
let live: string | null = "actor-a:business-a:store-a:gen-1:online"
let liveThrows = false
const track = (input: MobileActivityInput) => {
  if (throwing) throw Error("collector down")
  // Every emitted event must satisfy the fixed shared schema.
  mobileActivityInputSchema.parse(input)
  events.push(input)
}
beforeEach(() => {
  events.length = 0
  throwing = false
  live = "actor-a:business-a:store-a:gen-1:online"
  liveThrows = false
})

async function mount(initial: SaleActivityState) {
  const document = new DOMParser().parseFromString(
    "<html><body/></html>",
    "text/html",
  )
  const window = {
    document,
    HTMLIFrameElement: class {},
    HTMLElement: class {},
    addEventListener() {},
    removeEventListener() {},
  }
  Object.assign(globalThis, {
    document,
    window,
    IS_REACT_ACT_ENVIRONMENT: true,
  })
  Object.assign(document, {
    defaultView: window,
    addEventListener() {},
    removeEventListener() {},
  })
  const create = document.createElement.bind(document)
  document.createElement = (name: string) =>
    Object.assign(create(name), {
      style: {},
      addEventListener() {},
      removeEventListener() {},
    })
  const host = document.createElement("div")
  document.documentElement?.appendChild(host)
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(host as unknown as HTMLElement)
  let state = initial
  let api: ReturnType<typeof useSaleActivity> | undefined
  function Probe() {
    // The live session port (proposed in seq 475): what the session, cache
    // and connection are right now, independent of these render props.
    api = useSaleActivity(state, track, () => {
      if (liveThrows) throw Error("session store unavailable")
      return live
    })
    return null
  }
  const render = async () => {
    await act(async () => root.render(createElement(Probe)))
  }
  await render()
  return {
    set: async (patch: Partial<SaleActivityState>) => {
      state = { ...state, ...patch }
      await render()
    },
    get api() {
      if (!api) throw Error("not mounted")
      return api
    },
    close: async () => act(async () => root.unmount()),
  }
}

const empty: SaleActivityState = {
  lifetime: "actor-a:business-a:store-a:gen-1:online",
  step: "items",
  category: null,
  itemCount: 0,
  completion: null,
  submission: null,
  chosenAccountId: null,
  paymentMethod: "cash",
}
const names = () => events.map((event) => event.name)
/** A model confirmation attempt, and the same attempt with its outcome. */
function attempt() {
  const id = {}
  return {
    pending: { attempt: id },
    settled: (outcome: "saved" | "queued" | "failed" | "unknown") => ({
      attempt: id,
      outcome,
    }),
  }
}

test("category comes from line kinds only", () => {
  expect(saleActivityCategory(0, [])).toBeNull()
  expect(saleActivityCategory(2, [])).toBe("catalog")
  expect(saleActivityCategory(0, ["quick_sale"])).toBe("quick_sale")
  expect(saleActivityCategory(0, ["additional_cost"])).toBe("additional_cost")
  expect(saleActivityCategory(1, ["additional_cost"])).toBe("mixed")
  expect(saleActivityCategory(0, ["quick_sale", "additional_cost"])).toBe(
    "mixed",
  )
})

test("a full online sale reports each boundary exactly once", async () => {
  const ui = await mount(empty)
  try {
    expect(events).toEqual([])
    await ui.set({ category: "catalog", itemCount: 1 })
    await ui.set({ itemCount: 2 })
    await ui.set({ step: "customer" })
    await ui.set({ step: "review" })
    const a = attempt()
    await ui.set({ submission: a.pending })
    await ui.set({ submission: a.pending })
    const completion = { status: "created" as const }
    await ui.set({ completion, submission: a.settled("saved") })
    await ui.set({ completion, submission: a.settled("saved") })
    expect(events).toEqual([
      { name: "mobile_sale_started", properties: { category: "catalog" } },
      {
        name: "mobile_sale_step_viewed",
        properties: { action: "customer", category: "catalog" },
      },
      {
        name: "mobile_sale_step_viewed",
        properties: { action: "review", category: "catalog" },
      },
      {
        name: "mobile_sale_submitted",
        properties: { category: "catalog", item_count: 2 },
      },
      {
        name: "mobile_sale_result",
        properties: { category: "catalog", status: "saved" },
      },
    ])
  } finally {
    await ui.close()
  }
})

test("a batched attempt that arrives already settled reports submitted then its result", async () => {
  live = "a:b:s:gen-1:offline"
  const ui = await mount({ ...empty, lifetime: "a:b:s:gen-1:offline" })
  try {
    await ui.set({ category: "quick_sale", itemCount: 1, step: "review" })
    await ui.set({
      completion: { status: "queued" },
      submission: attempt().settled("queued"),
    })
    expect(names().slice(-2)).toEqual([
      "mobile_sale_submitted",
      "mobile_sale_result",
    ])
    expect(events.at(-1)).toEqual({
      name: "mobile_sale_result",
      properties: { category: "quick_sale", status: "queued" },
    })
  } finally {
    await ui.close()
  }
})

test("failed and unknown outcomes report once per attempt; a retry is a new attempt", async () => {
  const ui = await mount(empty)
  try {
    await ui.set({ category: "catalog", itemCount: 1 })
    const first = attempt()
    await ui.set({ submission: first.pending })
    await ui.set({ submission: first.settled("unknown") })
    await ui.set({ submission: first.settled("unknown") })
    const retry = attempt()
    await ui.set({ submission: retry.settled("failed") })
    expect(names()).toEqual([
      "mobile_sale_started",
      "mobile_sale_submitted",
      "mobile_sale_result",
      "mobile_sale_submitted",
      "mobile_sale_result",
    ])
    expect(
      events
        .filter((e) => e.name === "mobile_sale_result")
        .map((e) => (e.properties as { status: string }).status),
    ).toEqual(["unknown", "failed"])
  } finally {
    await ui.close()
  }
})

test("a draft already holding lines or a completion at mount is not a fresh start", async () => {
  const restored = attempt().settled("saved")
  const ui = await mount({
    ...empty,
    category: "catalog",
    itemCount: 1,
    step: "review",
    completion: { status: "created" },
    submission: restored,
  })
  try {
    await ui.set({ itemCount: 1 })
    await ui.set({ submission: { ...restored } })
    expect(events).toEqual([])
  } finally {
    await ui.close()
  }
})

test("a lifetime change retires everything observed; null reports nothing", async () => {
  const ui = await mount(empty)
  try {
    await ui.set({ category: "catalog", itemCount: 1 })
    const a = attempt()
    await ui.set({ submission: a.pending })
    events.length = 0
    // Store switch mid-submit: the old attempt's outcome can't report.
    await ui.set({
      lifetime: "actor-a:business-a:store-b:gen-1:online",
      completion: { status: "created" },
      submission: a.settled("saved"),
    })
    await ui.set({ step: "customer" })
    expect(events).toEqual([])
    await ui.set({ lifetime: null, completion: null, submission: null })
    await ui.set({ step: "review", submission: attempt().pending })
    expect(events).toEqual([])
  } finally {
    await ui.close()
  }
})

test("only an applied user account choice reports, as a fixed method", async () => {
  const ui = await mount(empty)
  try {
    await ui.set({ category: "catalog", itemCount: 1, step: "review" })
    events.length = 0
    // Sole preselection or hydration never reports.
    await ui.set({ chosenAccountId: "acct-cash" })
    await ui.set({ chosenAccountId: "acct-cash" })
    expect(events).toEqual([])
    ui.api.noteAccountChoice("acct-bank")
    await ui.set({
      paymentMethod: "bank_transfer",
      chosenAccountId: "acct-bank",
    })
    await ui.set({ chosenAccountId: "acct-bank" })
    expect(events).toEqual([
      {
        name: "mobile_payment_account_selected",
        properties: { category: "bank_transfer" },
      },
    ])
    // A rejected (stale) choice never applies, so never reports.
    ui.api.noteAccountChoice("acct-stale")
    await ui.set({ chosenAccountId: "acct-bank" })
    expect(events).toHaveLength(1)
  } finally {
    await ui.close()
  }
})

test("a throwing tracker never breaks the sale", async () => {
  throwing = true
  const ui = await mount(empty)
  try {
    await ui.set({ category: "catalog", itemCount: 1 })
    await ui.set({ step: "customer" })
    expect(events).toEqual([])
  } finally {
    await ui.close()
  }
})

test("a restored draft with lines and no completion never reports started", async () => {
  const ui = await mount({ ...empty, category: "catalog", itemCount: 2 })
  try {
    // Benign identical rerender, then an unrelated account change.
    await ui.set({ itemCount: 2 })
    await ui.set({ chosenAccountId: "acct-cash" })
    await ui.set({ step: "customer" })
    expect(events).toEqual([])
    // Its own later submit and authoritative result are a real sale.
    const a = attempt()
    await ui.set({ step: "review", submission: a.pending })
    await ui.set({
      completion: { status: "created" },
      submission: a.settled("saved"),
    })
    expect(events).toEqual([
      {
        name: "mobile_sale_submitted",
        properties: { category: "catalog", item_count: 2 },
      },
      {
        name: "mobile_sale_result",
        properties: { category: "catalog", status: "saved" },
      },
    ])
  } finally {
    await ui.close()
  }
})

test("a stale-props render after the live session changed reports nothing", async () => {
  const ui = await mount(empty)
  try {
    await ui.set({ category: "catalog", itemCount: 1, step: "review" })
    const before = events.length
    // The live session/cache changes before React renders new props.
    live = "actor-a:business-a:store-a:gen-2:online"
    const a = attempt()
    // Model state re-renders the view while props still carry the old
    // lifetime string: submit, result, step and account must all stay quiet.
    ui.api.noteAccountChoice("acct-bank")
    await ui.set({ submission: a.pending })
    await ui.set({
      completion: { status: "created" },
      submission: a.settled("saved"),
      step: "customer",
    })
    await ui.set({ chosenAccountId: "acct-bank" })
    expect(events).toHaveLength(before)
    // Live returns to the old value (A→B→A): the retired pending account and
    // attempt never resurrect.
    live = "actor-a:business-a:store-a:gen-1:online"
    await ui.set({ chosenAccountId: "acct-bank" })
    await ui.set({ submission: a.settled("saved") })
    await ui.set({ submission: attempt().pending })
    expect(events).toHaveLength(before)
  } finally {
    await ui.close()
  }
})

test("a failing live session getter denies every report", async () => {
  const ui = await mount(empty)
  try {
    await ui.set({ category: "catalog", itemCount: 1 })
    const before = events.length
    liveThrows = true
    const a = attempt()
    await ui.set({ step: "customer" })
    await ui.set({ submission: a.pending })
    liveThrows = false
    await ui.set({ submission: a.settled("saved") })
    expect(events).toHaveLength(before)
  } finally {
    await ui.close()
  }
})

test("the rendered lifetime builder uses explicit session facts only", () => {
  const profile = { id: "actor-a", businessId: "business-a", storeId: "s" }
  const base = {
    token: "t",
    profile,
    hasBusinessAccess: true,
    generation: 1,
    sessionGeneration: 1,
    offline: false,
    operationalGeneration: 1,
  }
  expect(saleActivityLifetimeOf({ ...base, token: null })).toBeNull()
  expect(saleActivityLifetimeOf({ ...base, profile: null })).toBeNull()
  const key = saleActivityLifetimeOf(base)
  for (const changed of [
    { token: "t2" },
    { generation: 2 },
    { sessionGeneration: 2 },
    { offline: true },
    { operationalGeneration: 2 },
    { hasBusinessAccess: false },
    { profile: { ...profile, storeId: "s2" } },
    { profile: { ...profile, status: "SUSPENDED" } },
  ])
    expect(saleActivityLifetimeOf({ ...base, ...changed })).not.toBe(key)
  // Same final session and connection after two unobserved writes (A→B→A):
  // the generations still make it a different lifetime.
  expect(
    saleActivityLifetimeOf({
      ...base,
      sessionGeneration: 3,
      operationalGeneration: 3,
    }),
  ).not.toBe(key)
})

test("an unobserved session and offline A→B→A keeps the old attempt and account suppressed", async () => {
  const rendered = (session: number, operational: number) =>
    saleActivityLifetimeOf({
      token: "t",
      profile: { id: "actor-a", businessId: "business-a", storeId: "s" },
      hasBusinessAccess: true,
      generation: 1,
      sessionGeneration: session,
      offline: false,
      operationalGeneration: operational,
    })
  const oldLifetime = rendered(1, 1)
  live = oldLifetime
  const ui = await mount({ ...empty, lifetime: oldLifetime })
  try {
    await ui.set({ category: "catalog", itemCount: 1, step: "review" })
    const before = events.length
    const a = attempt()
    ui.api.noteAccountChoice("acct-bank")
    // hasBusinessAccess true→false→true and offline false→true→false both
    // happened unobserved: identical final values, generations advanced twice.
    live = rendered(3, 3)
    await ui.set({ submission: a.pending })
    await ui.set({ chosenAccountId: "acct-bank" })
    await ui.set({ submission: a.settled("saved") })
    expect(events).toHaveLength(before)
    // The view re-renders with the new rendered lifetime: a genuinely new
    // lifetime, where the old attempt and pending account never report.
    await ui.set({ lifetime: rendered(3, 3) })
    await ui.set({ submission: a.settled("saved") })
    await ui.set({ chosenAccountId: "acct-bank" })
    expect(events).toHaveLength(before)
  } finally {
    await ui.close()
  }
})
