import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { DOMParser } from "@xmldom/xmldom"
import { act, createElement } from "react"

// Actual useSalesValueMotion under real React with inert, deterministic ports:
// a manual animation-frame queue and clock, and a controllable Reduce Motion
// value. No native module, timer or network runs.
let reduced = false
mock.module("react-native-reanimated", () => ({
  useReducedMotion: () => reduced,
}))
const { useSalesValueMotion, resetSalesValueMemory } = await import(
  "./use-sales-value-motion"
)
type Target = Parameters<typeof useSalesValueMotion>[0]

let clock = 0
let nextFrame = 1
const frames = new Map<number, (now: number) => void>()
let cancelled = 0
const errors: unknown[][] = []
const originalError = console.error

beforeEach(() => {
  // Each case starts as a fresh app process.
  resetSalesValueMemory()
  reduced = false
  clock = 0
  nextFrame = 1
  frames.clear()
  cancelled = 0
  errors.length = 0
  console.error = (...args: unknown[]) => {
    errors.push(args)
  }
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: (now: number) => void) => {
      const id = nextFrame++
      frames.set(id, callback)
      return id
    },
    cancelAnimationFrame: (id: number) => {
      if (frames.delete(id)) cancelled++
    },
    performance: { now: () => clock },
  })
})
afterEach(() => {
  console.error = originalError
})

/** Advance the clock and run the frames that were queued before it. */
async function frame(ms: number) {
  clock += ms
  const due = [...frames.entries()]
  frames.clear()
  await act(async () => {
    for (const [, callback] of due) callback(clock)
  })
}

async function mount(initial: Target, startActive = true) {
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
  let target = initial
  let active = startActive
  /** Every value the hook returned, render by render. */
  const rendered: (number | undefined)[] = []
  function Probe() {
    rendered.push(useSalesValueMotion(target, active))
    return null
  }
  const ui = {
    rendered,
    get shown() {
      return rendered.at(-1)
    },
    set: async (next: Target) => {
      target = next
      await act(async () => root.render(createElement(Probe)))
    },
    setActive: async (next: boolean) => {
      active = next
      await act(async () => root.render(createElement(Probe)))
    },
    rerender: async () => {
      await act(async () => root.render(createElement(Probe)))
    },
    close: async () => {
      await act(async () => root.unmount())
    },
  }
  await ui.rerender()
  return ui
}

const scope = "actor-a:business-a:store-a:owner:2026-10-17"
const at = (minor: number, scopeKey = scope) => ({ minor, scopeKey })

test("the first confirmed value shows at once, with no count", async () => {
  const ui = await mount(at(400_000))
  try {
    expect(ui.rendered.every((v) => v === 400_000)).toBe(true)
    expect(ui.shown).toBe(400_000)
    expect(frames.size).toBe(0)
  } finally {
    await ui.close()
  }
})

test("a confirmed change counts in whole naira and lands exactly", async () => {
  const ui = await mount(at(400_000))
  try {
    await ui.set(at(750_000))
    expect(ui.shown).toBe(400_000)
    expect(frames.size).toBe(1)
    const seen: number[] = []
    for (let i = 0; i < 12 && frames.size; i++) {
      await frame(50)
      seen.push(ui.shown as number)
    }
    expect(seen.at(-1)).toBe(750_000)
    expect(frames.size).toBe(0)
    for (let i = 1; i < seen.length; i++)
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1] as number)
    for (const value of seen.slice(0, -1)) {
      expect(value).toBeGreaterThan(400_000)
      expect(value).toBeLessThan(750_000)
      expect(value % 100).toBe(0)
    }
    // Lands within the 500ms duration (10 frames of 50ms).
    expect(seen.length).toBe(10)
  } finally {
    await ui.close()
  }
})

test("an unchanged refresh (a new target object) never counts", async () => {
  const ui = await mount(at(400_000))
  try {
    const before = ui.rendered.length
    await ui.set(at(400_000))
    await ui.rerender()
    expect(frames.size).toBe(0)
    expect(ui.rendered.slice(before).every((v) => v === 400_000)).toBe(true)
  } finally {
    await ui.close()
  }
})

test("a newer value mid-count continues from the number on screen", async () => {
  const ui = await mount(at(400_000))
  try {
    await ui.set(at(750_000))
    await frame(50)
    await frame(150)
    const shown = ui.shown as number
    expect(shown).toBeGreaterThan(400_000)
    expect(shown).toBeLessThan(750_000)
    const cancelledBefore = cancelled
    await ui.set(at(1_000_000))
    // The old count's queued frame was cancelled, a new one queued.
    expect(cancelled).toBe(cancelledBefore + 1)
    expect(frames.size).toBe(1)
    expect(ui.shown).toBe(shown)
    await frame(1)
    expect(ui.shown as number).toBeGreaterThanOrEqual(shown)
    expect(ui.shown as number).toBeLessThan(1_000_000)
    for (let i = 0; i < 20 && frames.size; i++) await frame(50)
    expect(ui.shown).toBe(1_000_000)
  } finally {
    await ui.close()
  }
})

test("a new scope shows its own value in the same render, never the old count", async () => {
  const ui = await mount(at(400_000))
  try {
    await ui.set(at(750_000))
    await frame(100)
    const before = ui.rendered.length
    await ui.set(at(1_215_000, "actor-a:business-a:store-b:owner:2026-10-17"))
    // Every render after the switch shows the new Store's value.
    expect(ui.rendered.slice(before).every((v) => v === 1_215_000)).toBe(true)
    expect(frames.size).toBe(0)
  } finally {
    await ui.close()
  }
})

test("unmount mid-count cancels the queued frame and never updates afterwards", async () => {
  const ui = await mount(at(400_000))
  await ui.set(at(750_000))
  await frame(50)
  expect(frames.size).toBe(1)
  const cancelledBefore = cancelled
  await ui.close()
  expect(cancelled).toBe(cancelledBefore + 1)
  expect(frames.size).toBe(0)
  expect(errors).toEqual([])
})

test("an absent target shows nothing; its return follows the shared rules", async () => {
  const ui = await mount(undefined)
  try {
    expect(ui.shown).toBeUndefined()
    await ui.set(at(400_000))
    expect(ui.shown).toBe(400_000)
    expect(frames.size).toBe(0)
    await ui.set(undefined)
    expect(ui.shown).toBeUndefined()
    // Same scope and value on return: nothing to count.
    await ui.set(at(400_000))
    expect(ui.shown).toBe(400_000)
    expect(frames.size).toBe(0)
    // Same scope, new value on return: counts from the last shown value.
    await ui.set(undefined)
    await ui.set(at(500_000))
    expect(ui.shown).toBe(400_000)
    expect(frames.size).toBe(1)
    for (let i = 0; i < 20 && frames.size; i++) await frame(50)
    expect(ui.shown).toBe(500_000)
    // A new scope on return: shown at once.
    await ui.set(undefined)
    await ui.set(at(90_000, "actor-b:business-b:store-c:mine:2026-10-17"))
    expect(ui.shown).toBe(90_000)
    expect(frames.size).toBe(0)
  } finally {
    await ui.close()
  }
})

test("Reduce Motion updates immediately, including during an active count", async () => {
  const ui = await mount(at(400_000))
  try {
    reduced = true
    await ui.set(at(750_000))
    expect(ui.shown).toBe(750_000)
    expect(frames.size).toBe(0)
    reduced = false
    await ui.set(at(1_000_000))
    await frame(100)
    expect(ui.shown as number).toBeLessThan(1_000_000)
    const cancelledBefore = cancelled
    reduced = true
    await ui.rerender()
    expect(ui.shown).toBe(1_000_000)
    expect(cancelled).toBe(cancelledBefore + 1)
    expect(frames.size).toBe(0)
  } finally {
    await ui.close()
  }
})

test("amounts with kobo count in minor units and land on the exact amount", async () => {
  const ui = await mount(at(400_050))
  try {
    await ui.set(at(750_025))
    for (let i = 0; i < 20 && frames.size; i++) await frame(50)
    expect(ui.shown).toBe(750_025)
    expect(errors).toEqual([])
  } finally {
    await ui.close()
  }
})

test("a rebuilt Home counts up from the last value shown, not from the new total", async () => {
  const first = await mount(at(400_000))
  await first.close()
  // A sale later: Home is mounted fresh with the newer confirmed total.
  const rebuilt = await mount(at(750_000))
  try {
    expect(rebuilt.rendered[0]).toBe(400_000)
    expect(frames.size).toBe(1)
    for (let i = 0; i < 20 && frames.size; i++) await frame(50)
    expect(rebuilt.shown).toBe(750_000)
  } finally {
    await rebuilt.close()
  }
  // A different Store remembers nothing from this one.
  const other = await mount(
    at(90_000, "actor-a:business-a:store-b:owner:2026-10-17"),
  )
  try {
    expect(other.rendered[0]).toBe(90_000)
    expect(frames.size).toBe(0)
  } finally {
    await other.close()
  }
})

test("Home rebuilt under the success screen stays still while hidden, then counts 4,000 → 7,500 when shown", async () => {
  const before = await mount(at(400_000))
  await before.close()
  // The outcome rebases Home underneath itself: hidden, with cached data.
  const under = await mount(at(400_000), false)
  try {
    // The confirmed total refreshes while Home is still hidden.
    await under.set(at(750_000))
    expect(frames.size).toBe(0)
    expect(under.rendered.every((value) => value === 400_000)).toBe(true)
  } finally {
    await under.close()
  }
  // Exit: Home is mounted again, visible, with the new total.
  const shown = await mount(at(750_000))
  try {
    expect(shown.rendered[0]).toBe(400_000)
    const seen: number[] = []
    for (let i = 0; i < 20 && frames.size; i++) {
      await frame(50)
      seen.push(shown.shown as number)
    }
    expect(seen.at(-1)).toBe(750_000)
    expect(seen.some((value) => value > 400_000 && value < 750_000)).toBe(true)
  } finally {
    await shown.close()
  }
})

test("a hidden Home that becomes visible counts from what it showed; a stale frame never lands", async () => {
  const before = await mount(at(400_000))
  await before.close()
  const home = await mount(undefined, false)
  try {
    // Total arrives while hidden: the remembered value shows, nothing runs.
    await home.set(at(750_000))
    expect(home.shown).toBe(400_000)
    expect(frames.size).toBe(0)
    await home.setActive(true)
    expect(frames.size).toBe(1)
    await frame(100)
    // Hidden again mid-count: the queued frame is cancelled.
    const cancelledBefore = cancelled
    await home.setActive(false)
    expect(cancelled).toBe(cancelledBefore + 1)
    expect(frames.size).toBe(0)
    await home.setActive(true)
    for (let i = 0; i < 20 && frames.size; i++) await frame(50)
    expect(home.shown).toBe(750_000)
  } finally {
    await home.close()
  }
})

test("remembered values never cross scopes: another Store, role, currency, session or cache start fresh", async () => {
  const { salesValueScope } = await import("../lib/sales-value-motion")
  const base = {
    actorId: "actor-a",
    businessId: "business-a",
    storeId: "store-a",
    role: "OWNER",
    mine: false,
    dayStartIso: "2026-10-17T00:00:00.000Z",
    currencyCode: "NGN",
    sessionGeneration: 1,
    dataGeneration: 1,
  }
  const first = await mount(at(400_000, salesValueScope(base)))
  await first.close()
  for (const changed of [
    { storeId: "store-b" },
    { businessId: "business-b" },
    { actorId: "actor-b" },
    { role: "CASHIER" },
    { mine: true },
    { currencyCode: "GHS" },
    { sessionGeneration: 2 },
    { dataGeneration: 2 },
    { dayStartIso: "2026-10-18T00:00:00.000Z" },
  ]) {
    const other = await mount(
      at(750_000, salesValueScope({ ...base, ...changed })),
    )
    try {
      expect(other.rendered[0]).toBe(750_000)
      expect(frames.size).toBe(0)
    } finally {
      await other.close()
    }
  }
})
