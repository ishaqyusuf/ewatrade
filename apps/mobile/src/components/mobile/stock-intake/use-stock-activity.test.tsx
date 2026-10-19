import { expect, test } from "bun:test"
import { act, createElement } from "react"
import type { StockReview } from "./stock-intake-model"
import { useStockActivity } from "./use-stock-activity"
import type { StockIntakeModel } from "./use-stock-intake"

// Real React effects through react-dom (no native runtime): proves the effect
// boundaries, not just helper logic.
type Activity = Parameters<Parameters<typeof useStockActivity>[1]>[0]
type State = Pick<
  StockIntakeModel,
  | "review"
  | "hasAttempt"
  | "outcome"
  | "reviewStale"
  | "scopeChanged"
  | "canManage"
>

const review = (mode: StockReview["draft"]["mode"] = "receipt") =>
  ({
    balance: { kind: "SHARED_POOL" },
    draft: { mode },
  }) as unknown as StockReview

async function mount() {
  const { DOMImplementation } = await import("@xmldom/xmldom")
  const document = new DOMImplementation().createDocument(
    "http://www.w3.org/1999/xhtml",
    "html",
    null,
  )
  const window = {
    document,
    HTMLIFrameElement: class {},
    HTMLElement: class {},
    addEventListener() {},
    removeEventListener() {},
  }
  Object.assign(globalThis, {
    window,
    document,
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
  const events: Activity[] = []
  const track = (event: Activity) => {
    events.push(event)
  }
  function Probe(state: State) {
    useStockActivity(state, track)
    return null
  }
  let state: State = {
    review: null,
    hasAttempt: false,
    outcome: null,
    reviewStale: false,
    scopeChanged: false,
    canManage: true,
  }
  return {
    events,
    set: async (patch: Partial<State>) => {
      state = { ...state, ...patch }
      await act(async () => root.render(createElement(Probe, state)))
    },
    close: async () => act(async () => root.unmount()),
  }
}

test("a review reports once even when its attempt is cleared and re-rendered", async () => {
  const ui = await mount()
  const shown = review()
  await ui.set({ review: shown })
  await ui.set({ review: shown, hasAttempt: true })
  // Definitive rejection or conflict clears the attempt: same review object.
  await ui.set({ review: shown, hasAttempt: false })
  await ui.set({ review: shown })
  expect(ui.events.filter((e) => e.name === "mobile_stock_reviewed")).toEqual([
    {
      name: "mobile_stock_reviewed",
      properties: { action: "receipt", category: "shared" },
    },
  ])
  // A fresh review object (new snapshot) is a new review.
  await ui.set({ review: review("count") })
  expect(
    ui.events.filter((e) => e.name === "mobile_stock_reviewed"),
  ).toHaveLength(2)
  await ui.close()
})

test("each outcome status reports once per reviewed attempt", async () => {
  const ui = await mount()
  const shown = review()
  await ui.set({ review: shown, hasAttempt: true })
  const unknown = { kind: "unknown" as const, review: shown }
  await ui.set({ outcome: unknown })
  // Check status keeps failing: a new outcome object, same status.
  await ui.set({ outcome: { kind: "unknown", review: shown } })
  const recorded = {
    kind: "recorded" as const,
    review: shown,
    effectiveAt: null,
    readBaseline: 0,
    operationId: "cmh2x9k1z0001qv8f3a7b5c2d",
  }
  await ui.set({ outcome: recorded })
  await ui.set({ outcome: { ...recorded } })
  expect(
    ui.events
      .filter((e) => e.name === "mobile_stock_result")
      .map((e) => e.properties),
  ).toEqual([
    { action: "receipt", status: "unknown" },
    { action: "receipt", status: "recorded" },
  ])
  await ui.close()
})

test("a stale review reports refresh_required once and is not re-reviewed", async () => {
  const ui = await mount()
  const shown = review()
  await ui.set({ review: shown })
  await ui.set({ review: shown, reviewStale: true })
  await ui.set({ review: shown, reviewStale: true })
  expect(ui.events.map((e) => e.name)).toEqual([
    "mobile_stock_reviewed",
    "mobile_stock_result",
  ])
  expect(ui.events[1]?.properties).toEqual({
    action: "receipt",
    status: "refresh_required",
  })
  await ui.close()
})

test("nothing is reported for a scope the screen no longer serves", async () => {
  const ui = await mount()
  const shown = review()
  await ui.set({ review: shown, scopeChanged: true })
  await ui.set({
    review: shown,
    scopeChanged: true,
    outcome: { kind: "unknown", review: shown },
  })
  expect(ui.events).toEqual([])
  await ui.close()
})

test("losing stock access silences review and outcome events", async () => {
  const ui = await mount()
  const shown = review()
  await ui.set({ review: shown, hasAttempt: true })
  // Manager → Cashier (or scoped cutover) after the request was sent.
  await ui.set({ canManage: false })
  await ui.set({ outcome: { kind: "unknown", review: shown } })
  await ui.set({ review: review("count"), hasAttempt: false, outcome: null })
  expect(ui.events).toEqual([])
  await ui.close()
})
